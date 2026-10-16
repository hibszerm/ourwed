#!/usr/bin/env python3
"""Run the disposable Supabase startup through a private, fail-closed Docker guard."""

from __future__ import annotations

import http.client
import json
import os
import re
import shutil
import socket
import socketserver
import stat
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler
from pathlib import Path


PROJECT = "ourwed-collab-harness-1016"
DB_NAME = f"supabase_db_{PROJECT}"
DB_HOST_PORT = "56522"
PROJECT_LABELS = {
    "com.docker.compose.project": PROJECT,
    "com.supabase.cli.project": PROJECT,
}
DB_IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.143"
AUTH_IMAGE = "public.ecr.aws/supabase/gotrue:v2.192.0"
AUTH_NAME = f"supabase_auth_{PROJECT}"
STARTUP_TIMEOUT_SECONDS = 240
TERMINATE_GRACE_SECONDS = 5
SUPPORTED_DOCKER_API_VERSIONS = frozenset({"1.51"})
_VERSION_PREFIX = re.compile(r"^/v([^/]+)/")
_REPEATED_VERSION_PREFIX = re.compile(r"^/v(?:[0-9]|x)[^/]*/", re.IGNORECASE)
_HOST_CONFIG_KEYS = frozenset({
    "AutoRemove", "Binds", "BlkioDeviceReadBps", "BlkioDeviceReadIOps",
    "BlkioDeviceWriteBps", "BlkioDeviceWriteIOps", "BlkioWeight", "BlkioWeightDevice",
    "CapAdd", "CapDrop", "Cgroup", "CgroupParent", "CgroupnsMode", "ConsoleSize",
    "ContainerIDFile", "CpuCount", "CpuPercent", "CpuPeriod", "CpuQuota",
    "CpuRealtimePeriod", "CpuRealtimeRuntime", "CpuShares", "CpusetCpus", "CpusetMems",
    "DeviceCgroupRules", "DeviceRequests", "Devices", "Dns", "DnsOptions", "DnsSearch",
    "ExtraHosts", "GroupAdd", "IOMaximumBandwidth", "IOMaximumIOps", "IpcMode", "Isolation",
    "Links", "LogConfig", "MaskedPaths", "Memory", "MemoryReservation", "MemorySwap",
    "MemorySwappiness", "NanoCpus", "NetworkMode", "OomKillDisable", "OomScoreAdj",
    "PidMode", "PidsLimit", "PortBindings", "Privileged", "PublishAllPorts", "ReadonlyPaths",
    "ReadonlyRootfs", "RestartPolicy", "SecurityOpt", "ShmSize", "UTSMode", "Ulimits",
    "UsernsMode", "VolumeDriver", "VolumesFrom",
})
_HOST_CONFIG_DEFAULTS = {
    "AutoRemove": False, "BlkioDeviceReadBps": None, "BlkioDeviceReadIOps": None,
    "BlkioDeviceWriteBps": None, "BlkioDeviceWriteIOps": None, "BlkioWeight": 0,
    "BlkioWeightDevice": None, "CapAdd": None, "CapDrop": None, "Cgroup": "",
    "CgroupParent": "", "CgroupnsMode": "", "ConsoleSize": [0, 0], "ContainerIDFile": "",
    "CpuCount": 0, "CpuPercent": 0, "CpuPeriod": 0, "CpuQuota": 0, "CpuRealtimePeriod": 0,
    "CpuRealtimeRuntime": 0, "CpuShares": 0, "CpusetCpus": "", "CpusetMems": "",
    "DeviceCgroupRules": None, "DeviceRequests": None, "Devices": None, "Dns": None,
    "DnsOptions": None, "DnsSearch": None, "ExtraHosts": None, "GroupAdd": None,
    "IOMaximumBandwidth": 0, "IOMaximumIOps": 0, "IpcMode": "", "Isolation": "",
    "Links": None, "LogConfig": {"Config": None, "Type": ""}, "MaskedPaths": None,
    "Memory": 0, "MemoryReservation": 0, "MemorySwap": 0, "MemorySwappiness": None,
    "NanoCpus": 0, "NetworkMode": f"supabase_network_{PROJECT}", "OomKillDisable": None,
    "OomScoreAdj": 0, "PidMode": "", "PidsLimit": None, "Privileged": False,
    "PublishAllPorts": False, "ReadonlyPaths": None, "ReadonlyRootfs": False,
    "SecurityOpt": None, "ShmSize": 0, "UTSMode": "", "Ulimits": None,
    "UsernsMode": "", "VolumeDriver": "", "VolumesFrom": None,
}
_SECRET_OUTPUT = re.compile(
    r"(?i)(?:DB_URL|DATABASE_URL|ANON_KEY|SERVICE_ROLE_KEY|PUBLISHABLE_KEY|SECRET_KEY|JWT_SECRET|PASSWORD|ACCESS_TOKEN|REFRESH_TOKEN)"
)


def docker_socket() -> str:
    configured = os.environ.get("DOCKER_HOST", "")
    if configured[:7] == "unix://":
        return configured.removeprefix("unix://")
    for candidate in ("/Users/marcin/.docker/run/docker.sock", "/var/run/docker.sock"):
        if os.path.exists(candidate):
            return candidate
    raise RuntimeError("Cannot locate the local Docker Engine Unix socket.")


DOCKER_SOCKET = docker_socket()


def strip_api_version(path: str) -> str:
    """Normalize only the exact Docker API version supported by this harness."""
    request_path = urllib.parse.urlsplit(path).path
    # The pinned Supabase CLI uses the Docker Engine's unversioned ping handshake.
    if request_path == "/_ping":
        return request_path
    match = _VERSION_PREFIX.match(request_path)
    if match is None:
        raise ValueError("Docker API path must use an explicitly supported version prefix")
    if match.group(1) not in SUPPORTED_DOCKER_API_VERSIONS:
        raise ValueError("Docker API version is not in the explicit supported-version allowlist")
    normalized = request_path[match.end() - 1:]
    if _REPEATED_VERSION_PREFIX.match(normalized):
        raise ValueError("Docker API path contains a repeated version prefix")
    return normalized


def _validate_host_config(host: object, service: str) -> str | None:
    if not isinstance(host, dict):
        return f"{service} create is missing HostConfig"
    unknown = set(host) - _HOST_CONFIG_KEYS
    if unknown:
        return f"{service} HostConfig contains an unapproved key: {sorted(unknown)[0]}"
    for key, expected in _HOST_CONFIG_DEFAULTS.items():
        if key in {"NetworkMode", "PortBindings", "RestartPolicy", "Binds"}:
            continue
        if key in host and host[key] != expected:
            return f"{service} HostConfig.{key} is outside the observed safe profile"
    if host.get("NetworkMode") != f"supabase_network_{PROJECT}":
        return f"{service} create does not use the exact disposable project network"
    if host.get("Privileged", False) is not False:
        return f"{service} HostConfig.Privileged must be false"
    for key in ("CapAdd", "Devices", "DeviceRequests", "SecurityOpt", "PidMode", "IpcMode", "UTSMode", "UsernsMode", "CgroupnsMode", "CgroupParent"):
        if host.get(key) not in (None, [], ""):
            return f"{service} HostConfig.{key} may not expand host or container privileges"
    return None


def _identity_labels(value: object) -> bool:
    return isinstance(value, dict) and value == PROJECT_LABELS


_CREATE_COMMON_KEYS = frozenset({
    "AttachStderr", "AttachStdin", "AttachStdout", "Cmd", "Domainname", "Entrypoint", "Env",
    "Healthcheck", "HostConfig", "Hostname", "Image", "Labels", "NetworkingConfig", "OnBuild",
    "OpenStdin", "StdinOnce", "Tty", "User", "Volumes", "WorkingDir",
})


def _validate_create_top_level(request: dict, service: str, named_auth: bool = False) -> str | None:
    if service == "GoTrue initializer":
        expected_keys = _CREATE_COMMON_KEYS - {"Healthcheck"}
    else:
        expected_keys = _CREATE_COMMON_KEYS | ({"ExposedPorts"} if named_auth else set())
    if set(request) != expected_keys:
        return f"{service} create top-level fields differ from the observed startup profile"
    defaults = {
        "AttachStderr": False, "AttachStdin": False, "AttachStdout": False,
        "Domainname": "", "Hostname": "", "OpenStdin": False, "StdinOnce": False,
        "Tty": False, "User": "", "Volumes": None, "WorkingDir": "", "OnBuild": None,
    }
    for key, expected in defaults.items():
        if request.get(key) != expected:
            return f"{service} create top-level {key} differs from the observed safe profile"
    if not isinstance(request.get("Env"), list) or any(not isinstance(item, str) for item in request["Env"]):
        return f"{service} create Env is malformed"
    if service == "GoTrue initializer":
        if request.get("Cmd") != ["gotrue", "migrate"]:
            return "GoTrue initializer create Cmd differs from the observed migration command"
        if request.get("Entrypoint") is not None or "Healthcheck" in request:
            return "GoTrue initializer create command/health fields differ from the observed profile"
    elif request.get("Cmd") is not None:
        return f"{service} create Cmd differs from the observed null command override"
    elif service == "PostgreSQL DB":
        entrypoint = request.get("Entrypoint")
        if not isinstance(entrypoint, list) or len(entrypoint) != 3 or entrypoint[:2] != ["sh", "-c"] or not isinstance(entrypoint[2], str):
            return "PostgreSQL DB create Entrypoint differs from the observed shell wrapper shape"
    elif request.get("Entrypoint") is not None:
        return "GoTrue service create Entrypoint differs from the observed null override"
    if service != "GoTrue initializer" and not isinstance(request.get("Healthcheck"), dict):
        return f"{service} create Healthcheck is malformed"
    networking = request.get("NetworkingConfig")
    if not isinstance(networking, dict) or set(networking) != {"EndpointsConfig"}:
        return f"{service} create NetworkingConfig differs from the observed startup profile"
    endpoints = networking["EndpointsConfig"]
    expected_endpoints = None if service == "GoTrue initializer" else {}
    if service != "GoTrue initializer":
        aliases = ["db", "db.supabase.internal"] if service == "PostgreSQL DB" else ["auth"]
        endpoint = {
            "Aliases": aliases, "DNSNames": None, "DriverOpts": None, "EndpointID": "", "Gateway": "",
            "GlobalIPv6Address": "", "GlobalIPv6PrefixLen": 0, "GwPriority": 0, "IPAMConfig": None,
            "IPAddress": "", "IPPrefixLen": 0, "IPv6Gateway": "", "Links": None, "MacAddress": "", "NetworkID": "",
        }
        expected_endpoints = {f"supabase_network_{PROJECT}": endpoint}
    if endpoints != expected_endpoints:
        return f"{service} create does not use the exact disposable project network endpoint"
    if named_auth and request.get("ExposedPorts") != {"9999/tcp": {}}:
        return "GoTrue create ExposedPorts differs from the observed internal service port"
    return None


def rewrite_db_create(path: str, body: bytes) -> tuple[bytes | None, str | None]:
    """Validate one exact DB create and return the minimally rewritten JSON body."""
    parsed = urllib.parse.urlsplit(path)
    query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True) if parsed.query else {}
    names = query.get("name", [])
    try:
        normalized_path = strip_api_version(path)
    except ValueError as exc:
        return None, str(exc)
    if normalized_path != "/containers/create" or set(query) != {"name"} or names != [DB_NAME]:
        return None, "container create is not the exact disposable DB target"
    try:
        request = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        return None, "container create body is not valid JSON"
    if not isinstance(request, dict) or not _identity_labels(request.get("Labels")):
        return None, "container create is missing exact project labels"
    if request.get("Image") != DB_IMAGE:
        return None, "container create image is not the pinned disposable Supabase DB image"
    top_error = _validate_create_top_level(request, "PostgreSQL DB")
    if top_error:
        return None, top_error
    host_config = request.get("HostConfig")
    host_error = _validate_host_config(host_config, "PostgreSQL DB")
    if host_error:
        return None, host_error
    if set(host_config) != _HOST_CONFIG_KEYS:
        return None, "PostgreSQL DB HostConfig differs from the exact observed key set"
    if host_config.get("Binds") != [f"{DB_NAME}:/var/lib/postgresql/data"]:
        return None, "PostgreSQL DB bind must be the exact disposable Docker-managed data volume"
    if host_config.get("RestartPolicy") != {"MaximumRetryCount": 0, "Name": "unless-stopped"}:
        return None, "PostgreSQL DB restart policy differs from the observed startup profile"
    if host_config.get("PublishAllPorts", False) is not False:
        return None, "container create must not publish all exposed ports"
    port_bindings = host_config.get("PortBindings")
    if not isinstance(port_bindings, dict) or set(port_bindings) != {"5432/tcp"}:
        return None, "container create must publish only the PostgreSQL port"
    postgres_bindings = port_bindings.get("5432/tcp")
    if not isinstance(postgres_bindings, list) or len(postgres_bindings) != 1:
        return None, "container create must have exactly one PostgreSQL binding"
    binding = postgres_bindings[0]
    if not isinstance(binding, dict) or set(binding) != {"HostIp", "HostPort"} or not isinstance(binding.get("HostPort"), str) or not binding["HostPort"].isdigit():
        return None, "container create has malformed PostgreSQL HostPort"
    if binding["HostPort"] != DB_HOST_PORT:
        return None, "container create PostgreSQL HostPort does not match the dedicated project configuration"
    if binding.get("HostIp", "") not in {"", "0.0.0.0", "::", "[::]", "127.0.0.1"}:
        return None, "container create has an unexpected PostgreSQL HostIp"
    binding["HostIp"] = "127.0.0.1"
    return json.dumps(request, separators=(",", ":")).encode(), None


def validate_auth_create(path: str, body: bytes) -> tuple[bool, str]:
    """Permit only the internal, unpublished GoTrue service needed to seed auth schema."""
    parsed = urllib.parse.urlsplit(path)
    query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True) if parsed.query else {}
    try:
        normalized_path = strip_api_version(path)
    except ValueError as exc:
        return False, str(exc)
    if normalized_path != "/containers/create" or query not in ({}, {"name": [AUTH_NAME]}):
        return False, "auth create must use the exact disposable GoTrue name or unnamed migration initializer"
    try:
        request = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        return False, "auth create body is not valid JSON"
    if not isinstance(request, dict) or request.get("Image") != AUTH_IMAGE or not _identity_labels(request.get("Labels")):
        return False, "auth create is not the exact disposable GoTrue service"
    named_auth = query == {"name": [AUTH_NAME]}
    profile_name = "GoTrue service" if named_auth else "GoTrue initializer"
    top_error = _validate_create_top_level(request, profile_name, named_auth=named_auth)
    if top_error:
        return False, top_error
    host_config = request.get("HostConfig")
    host_error = _validate_host_config(host_config, profile_name)
    if host_error:
        return False, host_error
    if set(host_config) != _HOST_CONFIG_KEYS:
        return False, f"{profile_name} HostConfig differs from the exact observed key set"
    expected_restart = {"MaximumRetryCount": 0, "Name": "unless-stopped" if named_auth else ""}
    if host_config.get("RestartPolicy") != expected_restart:
        return False, f"{profile_name} restart policy differs from the observed startup profile"
    expected_binds = None
    if host_config.get("Binds") != expected_binds or host_config.get("VolumesFrom") is not None:
        return False, f"{profile_name} must not mount or inherit host volumes"
    if host_config.get("PortBindings") is not None or host_config.get("PublishAllPorts", False) is not False:
        return False, "auth service must not publish host ports"
    return True, "exact unpublished GoTrue service required to initialize the disposable auth schema"


class GuardPolicy:
    """Small request allowlist; unknown Docker API calls are denied."""

    def __init__(self) -> None:
        self.container_ids: set[str] = set()
        self.auth_container_ids: set[str] = set()
        self.network_ids: set[str] = set()
        self.db_create_count = 0
        self.auth_initializer_create_count = 0
        self.auth_service_create_count = 0

    def authorize(self, method: str, raw_path: str, body: bytes) -> tuple[bool, bytes, str]:
        try:
            path = strip_api_version(raw_path)
        except ValueError as exc:
            return False, body, str(exc)
        parsed = urllib.parse.urlsplit(raw_path)
        try:
            query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True) if parsed.query else {}
        except ValueError:
            return False, body, "request query string is malformed"
        if method in {"GET", "HEAD"} and path == "/_ping" and not query:
            return True, body, "read-only Docker Engine ping required by the CLI"
        if method == "GET" and path == "/version" and not query:
            return True, body, "read-only Docker handshake/version metadata required by the CLI"
        if method == "POST" and path == "/containers/create":
            auth_allowed, auth_reason = validate_auth_create(raw_path, body)
            if auth_allowed:
                auth_query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True) if parsed.query else {}
                if auth_query:
                    if self.auth_service_create_count != 0:
                        return False, body, "duplicate named GoTrue service creation is not allowed"
                elif self.auth_initializer_create_count != 0:
                    return False, body, "duplicate unnamed GoTrue initializer creation is not allowed"
                return True, body, auth_reason
            try:
                candidate = json.loads(body)
            except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
                candidate = None
            if isinstance(candidate, dict) and candidate.get("Image") == AUTH_IMAGE:
                return False, body, auth_reason
            if self.db_create_count != 0:
                return False, body, "duplicate DB container creation is not allowed"
            rewritten, error = rewrite_db_create(raw_path, body)
            if error:
                return False, body, error
            return True, rewritten or body, "exact disposable DB creation with loopback-only PostgreSQL binding"
        if method == "POST" and path == "/networks/create":
            try:
                request = json.loads(body)
            except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
                return False, body, "network create body is not valid JSON"
            if (
                isinstance(request, dict)
                and request.get("Name") == f"supabase_network_{PROJECT}"
                and _identity_labels(request.get("Labels"))
                and set(request) <= {"Name", "CheckDuplicate", "Driver", "Scope", "Internal", "Attachable", "Ingress", "ConfigOnly", "ConfigFrom", "IPAM", "EnableIPv6", "Options", "Labels"}
                and not query
            ):
                return True, body, "creation of the exact disposable Supabase project network"
            return False, body, "network create is not the exact disposable project network"
        if method == "GET" and path == "/containers/json":
            expected_filters = {"label": {f"com.supabase.cli.project={PROJECT}": True}}
            try:
                filters = json.loads(query.get("filters", [""])[0])
            except (json.JSONDecodeError, IndexError):
                return False, body, "container enumeration filter is malformed"
            expected_filter_json = json.dumps(expected_filters, separators=(",", ":"))
            if query in ({"filters": [expected_filter_json]}, {"all": ["1"], "filters": [expected_filter_json]}) and filters == expected_filters:
                return True, body, "read-only container enumeration filtered by the exact Supabase project label"
            return False, body, "container enumeration is not filtered to the exact disposable project"
        if method == "POST" and path == "/containers/prune":
            expected_filters = {"label": {f"com.supabase.cli.project={PROJECT}": True}}
            try:
                filters = json.loads(query.get("filters", [""])[0])
            except (json.JSONDecodeError, IndexError):
                return False, body, "container prune filter is malformed"
            if set(query) == {"filters"} and query.get("filters") == [json.dumps(expected_filters, separators=(",", ":"))] and filters == expected_filters:
                return True, body, "prune of stopped containers carrying the exact disposable project label"
            return False, body, "container prune is not limited to the exact disposable project"
        if method == "POST" and path == "/volumes/prune":
            expected_filters = {"all": {"true": True}, "label": {f"com.supabase.cli.project={PROJECT}": True}}
            try:
                filters = json.loads(query.get("filters", [""])[0])
            except (json.JSONDecodeError, IndexError):
                return False, body, "volume prune filter is malformed"
            if set(query) == {"filters"} and query.get("filters") == [json.dumps(expected_filters, separators=(",", ":"))] and filters == expected_filters:
                return True, body, "prune of volumes carrying the exact disposable project label"
            return False, body, "volume prune is not limited to the exact disposable project"
        if method == "POST" and path == "/networks/prune":
            expected_filters = {"label": {f"com.supabase.cli.project={PROJECT}": True}}
            try:
                filters = json.loads(query.get("filters", [""])[0])
            except (json.JSONDecodeError, IndexError):
                return False, body, "network prune filter is malformed"
            if set(query) == {"filters"} and query.get("filters") == [json.dumps(expected_filters, separators=(",", ":"))] and filters == expected_filters:
                return True, body, "prune of networks carrying the exact disposable project label"
            return False, body, "network prune is not limited to the exact disposable project"
        if method == "GET" and path == f"/volumes/{DB_NAME}" and not query:
            return True, body, "read-only lookup of the exact disposable DB volume"
        if method == "POST" and path == "/volumes/create" and not query:
            try:
                request = json.loads(body)
            except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
                return False, body, "volume create body is not valid JSON"
            allowed_fields = {"Name", "Labels", "Driver", "DriverOpts"}
            if (
                isinstance(request, dict)
                and request.get("Name") == DB_NAME
                and _identity_labels(request.get("Labels"))
                and set(request) <= allowed_fields
                and request.get("Driver", "") in ("", "local")
                and request.get("DriverOpts") in (None, {})
            ):
                return True, body, "creation of the exact disposable DB data volume"
            return False, body, "volume create is not the exact disposable DB volume"
        if method == "GET" and path in {
            f"/images/{DB_IMAGE}/json",
            "/images/public.ecr.aws/supabase/gotrue:v2.192.0/json",
        } and not query:
            return True, body, "read-only inspection of the exact cached Supabase DB image used by this harness"
        match = re.fullmatch(r"/containers/([0-9a-f]{12,64})/start", path)
        if method == "POST" and match and not query and match.group(1) in (self.container_ids | self.auth_container_ids):
            return True, body, "start of a container ID returned by exact disposable project creation"
        match = re.fullmatch(r"/containers/([0-9a-f]{12,64})/stop", path)
        if method == "POST" and match and not query and match.group(1) in (self.container_ids | self.auth_container_ids):
            return True, body, "stop of a container ID returned by exact disposable project creation"
        match = re.fullmatch(r"/containers/([0-9a-f]{12,64})/json", path)
        if method == "GET" and match and not query and match.group(1) in (self.container_ids | self.auth_container_ids):
            return True, body, "inspect of a container ID returned by exact disposable project creation"
        match = re.fullmatch(r"/containers/([0-9a-f]{12,64})/logs", path)
        if method == "GET" and match and match.group(1) in (self.container_ids | self.auth_container_ids):
            allowed_log_keys = {"follow", "stdout", "stderr", "since", "until", "timestamps", "tail", "details"}
            if set(query) <= allowed_log_keys and all(len(values) == 1 for values in query.values()):
                return True, body, "read-only logs for a container ID created by this guarded startup"
        if method == "GET" and path == f"/containers/{DB_NAME}/json" and not query:
            return True, body, "read-only lookup of the exact disposable DB container name"
        if method == "GET" and path == f"/containers/{AUTH_NAME}/json" and not query:
            return True, body, "read-only lookup of the exact disposable GoTrue container name"
        match = re.fullmatch(r"/containers/([0-9a-f]{12,64})", path)
        if method == "DELETE" and match and match.group(1) in self.auth_container_ids and query == {"force": ["1"], "v": ["1"]}:
            return True, body, "cleanup of an exact guarded GoTrue initializer with no attached volumes"
        match = re.fullmatch(r"/containers/([0-9a-f]{12,64})/rename", path)
        if method == "POST" and match and match.group(1) in self.auth_container_ids and query == {"name": [AUTH_NAME]}:
            return True, body, "rename of the guarded GoTrue container to its exact disposable service name"
        match = re.fullmatch(r"/networks/([0-9a-f]{12,64})", path)
        if method == "GET" and match and not query and match.group(1) in self.network_ids:
            return True, body, "inspect of the exact disposable project network created by this guarded run"
        return False, body, "request is outside the explicit Docker startup allowlist"


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path: str):
        super().__init__("localhost", timeout=30)
        self.socket_path = socket_path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(30)
        self.sock.connect(self.socket_path)


class GuardServer(socketserver.ThreadingUnixStreamServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, socket_path: str, policy: GuardPolicy):
        self.policy = policy
        super().__init__(socket_path, GuardHandler)

    def handle_error(self, _request, _client_address) -> None:
        # Clients may close immediately after receiving a deny response.
        return


class GuardHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _handle(self) -> None:
        length_text = self.headers.get("Content-Length", "0")
        if not length_text.isdigit() or int(length_text) > 16 * 1024 * 1024:
            self.send_error(400, "Malformed or oversized Docker API request")
            return
        body = self.rfile.read(int(length_text)) if int(length_text) else b""
        allowed, forwarded_body, reason = self.server.policy.authorize(self.command, self.path, body)  # type: ignore[attr-defined]
        if not allowed:
            safe_path = urllib.parse.urlsplit(self.path).path
            print(f"Docker guard DENY {self.command} {safe_path}: {reason}", file=sys.stderr, flush=True)
            self.send_error(403, "Docker API request denied by local harness guard")
            return
        connection = UnixHTTPConnection(DOCKER_SOCKET)
        try:
            headers = {
                key: value
                for key, value in self.headers.items()
                if key.lower() not in {"host", "connection", "content-length", "transfer-encoding"}
            }
            connection.request(self.command, self.path, body=forwarded_body or None, headers=headers)
            response = connection.getresponse()
            payload = response.read()
            self.send_response(response.status, response.reason)
            for key, value in response.getheaders():
                if key.lower() not in {"connection", "transfer-encoding", "content-length", "keep-alive"}:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
            if self.command == "POST" and strip_api_version(self.path) == "/containers/create" and response.status == 201:
                try:
                    create_request = json.loads(body or b"{}")
                    container_id = json.loads(payload).get("Id")
                except (json.JSONDecodeError, AttributeError):
                    create_request, container_id = {}, None
                if create_request.get("Image") == DB_IMAGE:
                    self.server.policy.db_create_count += 1  # type: ignore[attr-defined]
                if isinstance(container_id, str) and re.fullmatch(r"[0-9a-f]{12,64}", container_id):
                    if create_request.get("Image") == AUTH_IMAGE and _identity_labels(create_request.get("Labels")):
                        self.server.policy.auth_container_ids.add(container_id)  # type: ignore[attr-defined]
                        auth_query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query, keep_blank_values=True)
                        if auth_query:
                            self.server.policy.auth_service_create_count += 1  # type: ignore[attr-defined]
                        else:
                            self.server.policy.auth_initializer_create_count += 1  # type: ignore[attr-defined]
                    else:
                        self.server.policy.container_ids.add(container_id)  # type: ignore[attr-defined]
            if self.command == "DELETE" and response.status == 204:
                deleted = re.fullmatch(r"/containers/([0-9a-f]{12,64})", strip_api_version(self.path))
                if deleted:
                    self.server.policy.auth_container_ids.discard(deleted.group(1))  # type: ignore[attr-defined]
            if self.command == "GET" and strip_api_version(self.path) == f"/containers/{DB_NAME}/json" and response.status == 200:
                try:
                    inspected = json.loads(payload)
                    inspected_name = str(inspected.get("Name", "")).lstrip("/")
                    inspected_labels = inspected.get("Config", {}).get("Labels")
                    container_id = inspected.get("Id")
                except (json.JSONDecodeError, AttributeError):
                    inspected_name, inspected_labels, container_id = "", None, None
                if inspected_name == DB_NAME and _identity_labels(inspected_labels) and isinstance(container_id, str) and re.fullmatch(r"[0-9a-f]{12,64}", container_id):
                    self.server.policy.container_ids.add(container_id)  # type: ignore[attr-defined]
            if self.command == "GET" and strip_api_version(self.path) == f"/containers/{AUTH_NAME}/json" and response.status == 200:
                try:
                    inspected = json.loads(payload)
                    inspected_name = str(inspected.get("Name", "")).lstrip("/")
                    inspected_labels = inspected.get("Config", {}).get("Labels")
                    inspected_image = inspected.get("Config", {}).get("Image")
                    container_id = inspected.get("Id")
                except (json.JSONDecodeError, AttributeError):
                    inspected_name, inspected_labels, inspected_image, container_id = "", None, None, None
                if inspected_name == AUTH_NAME and inspected_image == AUTH_IMAGE and _identity_labels(inspected_labels) and isinstance(container_id, str) and re.fullmatch(r"[0-9a-f]{12,64}", container_id):
                    self.server.policy.auth_container_ids.add(container_id)  # type: ignore[attr-defined]
            if self.command == "POST" and strip_api_version(self.path) == "/networks/create" and response.status == 201:
                try:
                    network_id = json.loads(payload).get("Id")
                except (json.JSONDecodeError, AttributeError):
                    network_id = None
                if isinstance(network_id, str) and re.fullmatch(r"[0-9a-f]{12,64}", network_id):
                    self.server.policy.network_ids.add(network_id)  # type: ignore[attr-defined]
        except (OSError, http.client.HTTPException) as exc:
            self.send_error(502, f"Local Docker Unix socket forwarding failed: {exc}")
        finally:
            connection.close()

    do_GET = _handle
    do_POST = _handle
    do_PUT = _handle
    do_DELETE = _handle
    do_HEAD = _handle


def _terminate(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=TERMINATE_GRACE_SECONDS)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=TERMINATE_GRACE_SECONDS)


def _redact_output(output: str) -> str:
    safe_lines = []
    for line in output.splitlines(keepends=True):
        if _SECRET_OUTPUT.search(line) or "postgresql://" in line.lower():
            safe_lines.append("[local Supabase credential or database connection output redacted]\n")
        else:
            safe_lines.append(line)
    return "".join(safe_lines)


def run_guarded(command: list[str]) -> int:
    if not command:
        print("Usage: start_supabase_with_frozen_loopback.py COMMAND [ARGS...]", file=sys.stderr)
        return 2
    temp_dir = Path(tempfile.mkdtemp(prefix="ourwed-docker-guard-"))
    socket_path = str(temp_dir / "docker-guard.sock")
    server: GuardServer | None = None
    thread: threading.Thread | None = None
    process: subprocess.Popen[str] | None = None
    returncode = 1
    try:
        os.chmod(temp_dir, 0o700)
        server = GuardServer(socket_path, GuardPolicy())
        os.chmod(socket_path, 0o600)
        directory_stat = os.stat(temp_dir)
        socket_stat = os.stat(socket_path)
        if stat.S_IMODE(directory_stat.st_mode) != 0o700 or stat.S_IMODE(socket_stat.st_mode) != 0o600:
            raise RuntimeError("Docker guard Unix socket permissions do not match owner-only policy.")
        if directory_stat.st_uid != os.getuid() or socket_stat.st_uid != os.getuid():
            raise RuntimeError("Docker guard directory/socket is not owned by the current local user.")
        if server.socket.family != socket.AF_UNIX:
            raise RuntimeError("Docker guard unexpectedly created a non-Unix listener.")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        environment = dict(os.environ)
        environment["DOCKER_HOST"] = f"unix://{socket_path}"
        print(
            f"Docker guard DOCKER_HOST=unix://{socket_path}; directory=0700; socket=0600; "
            f"owner_uid={os.getuid()}; TCP listener=none; timeout={STARTUP_TIMEOUT_SECONDS}s."
        )
        process = subprocess.Popen(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            output, _ = process.communicate(timeout=STARTUP_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            _terminate(process)
            output, _ = process.communicate()
            print(f"Supabase CLI startup exceeded {STARTUP_TIMEOUT_SECONDS}s; child was terminated.", file=sys.stderr)
            sys.stdout.write(_redact_output(output))
            returncode = 124
        else:
            sys.stdout.write(_redact_output(output))
            returncode = int(process.returncode or 0)
            if returncode == 0:
                observed = (
                    server.policy.db_create_count,
                    server.policy.auth_initializer_create_count,
                    server.policy.auth_service_create_count,
                )
                if observed != (1, 1, 1):
                    print(
                        "Guarded startup did not perform exactly one intended DB create, "
                        "one auth initializer create, and one named auth service create.",
                        file=sys.stderr,
                    )
                    returncode = 1
    except KeyboardInterrupt:
        if process is not None:
            _terminate(process)
            if process.stdout:
                sys.stdout.write(_redact_output(process.stdout.read()))
        returncode = 130
    finally:
        if process is not None and process.poll() is None:
            _terminate(process)
        try:
            if server is not None:
                if thread is not None and thread.is_alive():
                    server.shutdown()
                server.server_close()
            if thread is not None:
                thread.join(timeout=2)
        finally:
            try:
                os.unlink(socket_path)
            except OSError:
                pass
            shutil.rmtree(temp_dir, ignore_errors=True)
    if returncode == 0:
        print("Docker API guard allowed only the exact disposable project startup operations.")
    return returncode


if __name__ == "__main__":
    raise SystemExit(run_guarded(sys.argv[1:]))
