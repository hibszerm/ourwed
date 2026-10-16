#!/usr/bin/env python3
"""Focused policy, transport, and cleanup tests for the local Docker guard."""

from __future__ import annotations

import importlib.util
import copy
import json
import os
import socket
import stat
import sys
import tempfile
import urllib.parse
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).with_name("start_supabase_with_frozen_loopback.py")
SPEC = importlib.util.spec_from_file_location("docker_guard", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
guard = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = guard
SPEC.loader.exec_module(guard)


def _base_host_config() -> dict:
    host = copy.deepcopy(guard._HOST_CONFIG_DEFAULTS)
    host.update({
        "Binds": [],
        "PortBindings": None,
        "RestartPolicy": {"MaximumRetryCount": 0, "Name": ""},
    })
    return host


def _base_create(image: str, labels: dict | None, network_endpoints: dict) -> dict:
    return {
        "AttachStderr": False,
        "AttachStdin": False,
        "AttachStdout": False,
        "Cmd": None,
        "Domainname": "",
        "Entrypoint": ["sh", "-c", "start-db"] if image == guard.DB_IMAGE else [],
        "Env": ["POSTGRES_PASSWORD=redacted-test-value"] if image == guard.DB_IMAGE else [],
        "Healthcheck": {} if image == guard.DB_IMAGE else None,
        "HostConfig": _base_host_config(),
        "Hostname": "",
        "Image": image,
        "Labels": labels if labels is not None else dict(guard.PROJECT_LABELS),
        "NetworkingConfig": {"EndpointsConfig": network_endpoints},
        "OnBuild": None,
        "OpenStdin": False,
        "StdinOnce": False,
        "Tty": False,
        "User": "",
        "Volumes": None,
        "WorkingDir": "",
    }


def db_create(name: str = guard.DB_NAME, labels: dict | None = None, host_ip: str = "") -> tuple[str, bytes]:
    endpoint = {
        "Aliases": ["db", "db.supabase.internal"], "DNSNames": None, "DriverOpts": None,
        "EndpointID": "", "Gateway": "", "GlobalIPv6Address": "", "GlobalIPv6PrefixLen": 0,
        "GwPriority": 0, "IPAMConfig": None, "IPAddress": "", "IPPrefixLen": 0,
        "IPv6Gateway": "", "Links": None, "MacAddress": "", "NetworkID": "",
    }
    request = _base_create(guard.DB_IMAGE, labels, {f"supabase_network_{guard.PROJECT}": endpoint})
    request["HostConfig"].update({
        "NetworkMode": f"supabase_network_{guard.PROJECT}",
        "Binds": [f"{guard.DB_NAME}:/var/lib/postgresql/data"],
        "PortBindings": {"5432/tcp": [{"HostIp": host_ip, "HostPort": "56522"}]},
        "RestartPolicy": {"MaximumRetryCount": 0, "Name": "unless-stopped"},
    })
    body = request
    path = "/v1.51/containers/create?name=" + name
    return path, json.dumps(body).encode()


def auth_create(image: str = guard.AUTH_IMAGE, labels: dict | None = None, port_bindings=None, named: bool = False) -> tuple[str, bytes]:
    endpoint = {
        "Aliases": ["auth"], "DNSNames": None, "DriverOpts": None,
        "EndpointID": "", "Gateway": "", "GlobalIPv6Address": "", "GlobalIPv6PrefixLen": 0,
        "GwPriority": 0, "IPAMConfig": None, "IPAddress": "", "IPPrefixLen": 0,
        "IPv6Gateway": "", "Links": None, "MacAddress": "", "NetworkID": "",
    }
    endpoints = {f"supabase_network_{guard.PROJECT}": endpoint} if named else None
    body = _base_create(image, labels, endpoints)
    body["Env"] = []
    if not named:
        body.pop("Healthcheck")
        body["Cmd"] = ["gotrue", "migrate"]
        body["Entrypoint"] = None
    else:
        body["Entrypoint"] = None
        body["Healthcheck"] = {}
    body["HostConfig"].update({
        "NetworkMode": f"supabase_network_{guard.PROJECT}",
        "PortBindings": port_bindings,
        "Binds": None,
        "RestartPolicy": {"MaximumRetryCount": 0, "Name": "unless-stopped" if named else ""},
    })
    if named:
        body["ExposedPorts"] = {"9999/tcp": {}}
    return "/v1.51/containers/create", json.dumps(body).encode()


class GuardPolicyTests(unittest.TestCase):
    def test_exact_db_create_rewrites_only_postgres_host_ip(self) -> None:
        path, body = db_create()
        allowed, rewritten, _ = guard.GuardPolicy().authorize("POST", path, body)
        self.assertTrue(allowed)
        before = json.loads(body)
        after = json.loads(rewritten)
        before["HostConfig"]["PortBindings"]["5432/tcp"][0]["HostIp"] = "127.0.0.1"
        self.assertEqual(after, before)
        self.assertEqual(after["HostConfig"]["PortBindings"]["5432/tcp"][0]["HostPort"], "56522")
        self.assertEqual(set(after["HostConfig"]["PortBindings"]), {"5432/tcp"})

    def test_prefix_collision_and_other_project_are_denied(self) -> None:
        for name in (guard.DB_NAME + "-evil", "supabase_db_other-project"):
            with self.subTest(name=name):
                path, body = db_create(name=name)
                self.assertFalse(guard.GuardPolicy().authorize("POST", path, body)[0])

    def test_wrong_or_missing_project_labels_are_denied(self) -> None:
        wrong = dict(guard.PROJECT_LABELS, **{"com.supabase.cli.project": guard.PROJECT + "-evil"})
        path, body = db_create(labels=wrong)
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, body)[0])
        path, body = db_create(labels={})
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, body)[0])
        path, body = db_create(labels=dict(guard.PROJECT_LABELS, **{"unrecognized": "label"}))
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, body)[0])
        wrong_image = json.loads(body := db_create()[1])
        wrong_image["Image"] = "other/image:tag"
        path = "/v1.51/containers/create?name=" + guard.DB_NAME
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, json.dumps(wrong_image).encode())[0])
        policy = guard.GuardPolicy()
        policy.db_create_count = 1
        path, body = db_create()
        self.assertFalse(policy.authorize("POST", path, body)[0])

    def test_exact_auth_initializer_allowed_without_host_publication(self) -> None:
        policy = guard.GuardPolicy()
        path, body = auth_create()
        self.assertTrue(policy.authorize("POST", path, body)[0])
        named_path, named_body = auth_create(named=True)
        self.assertTrue(policy.authorize("POST", named_path + "?name=" + guard.AUTH_NAME, named_body)[0])
        self.assertFalse(policy.authorize("POST", path, json.dumps({**json.loads(body), "Image": "other/auth:tag"}).encode())[0])
        self.assertFalse(policy.authorize("POST", path, auth_create(port_bindings={"9999/tcp": [{"HostIp": "0.0.0.0", "HostPort": "9999"}]})[1])[0])
        self.assertFalse(policy.authorize("POST", path, auth_create(labels={})[1])[0])
        policy.auth_initializer_create_count = 1
        self.assertFalse(policy.authorize("POST", path, body)[0])
        policy.auth_service_create_count = 1
        self.assertFalse(policy.authorize("POST", named_path + "?name=" + guard.AUTH_NAME, named_body)[0])

    def test_arbitrary_create_delete_unknown_and_global_reads_are_denied(self) -> None:
        policy = guard.GuardPolicy()
        path, body = db_create(name="unrelated-container")
        self.assertFalse(policy.authorize("POST", path, body)[0])
        self.assertFalse(policy.authorize("DELETE", "/v1.51/containers/abcdef012345?force=true", b"")[0])
        self.assertFalse(policy.authorize("GET", "/v1.51/containers/json", b"")[0])
        self.assertFalse(policy.authorize("GET", "/v1.51/images/json", b"")[0])
        self.assertFalse(policy.authorize("GET", "/v1.51/containers/json?all=1", b"")[0])
        self.assertFalse(policy.authorize("POST", "/v1.51/unknown", b"")[0])
        self.assertFalse(policy.authorize("GET", f"/v1.51/containers/{guard.DB_NAME}-evil/json", b"")[0])
        self.assertFalse(policy.authorize("POST", "/v1.51/containers/abcdef012345/stop", b"")[0])

    def test_malformed_json_port_binding_and_query_are_denied(self) -> None:
        path, _ = db_create()
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, b"not-json")[0])
        path, body = db_create(host_ip="192.168.1.7")
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, body)[0])
        path, body = db_create()
        wrong_port = json.loads(body)
        wrong_port["HostConfig"]["PortBindings"]["5432/tcp"][0]["HostPort"] = "56523"
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, json.dumps(wrong_port).encode())[0])
        self.assertFalse(guard.GuardPolicy().authorize("POST", path + "&name=duplicate", body)[0])
        path, body = db_create()
        request = json.loads(body)
        request["HostConfig"]["PortBindings"]["8080/tcp"] = [{"HostIp": "127.0.0.1", "HostPort": "18080"}]
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, json.dumps(request).encode())[0])

    def test_api_version_is_exact_and_rejects_malformed_or_repeated_prefixes(self) -> None:
        policy = guard.GuardPolicy()
        self.assertTrue(policy.authorize("GET", "/v1.51/_ping", b"")[0])
        self.assertTrue(policy.authorize("GET", "/_ping", b"")[0])
        self.assertFalse(policy.authorize("POST", "/containers/create", db_create()[1])[0])
        for path in (
            "/v0/_ping", "/v99.999/_ping", "/v999999.999999/_ping",
            "/vx.y/_ping", "/v1.51/v1.51/_ping", "/v1x51/_ping",
            "/v1.51.0/_ping", "/v1.51/_ping/extra",
        ):
            with self.subTest(path=path):
                self.assertFalse(policy.authorize("GET", path, b"")[0])
        self.assertFalse(policy.authorize("POST", "/v1.51/unknown", b"")[0])

    def test_db_privileged_and_capability_expansion_are_denied(self) -> None:
        path, body = db_create()
        for key, value in (("Privileged", True), ("CapAdd", ["SYS_ADMIN"]), ("CapAdd", ["CHOWN"])):
            with self.subTest(key=key, value=value):
                request = json.loads(body)
                request["HostConfig"][key] = value
                self.assertFalse(guard.GuardPolicy().authorize("POST", path, json.dumps(request).encode())[0])

    def test_db_binding_rejects_unknown_nested_host_publication_fields(self) -> None:
        path, body = db_create()
        request = json.loads(body)
        request["HostConfig"]["PortBindings"]["5432/tcp"][0]["PublishMode"] = "host"
        self.assertFalse(guard.GuardPolicy().authorize("POST", path, json.dumps(request).encode())[0])

    def test_gotrue_privileged_and_capability_expansion_are_denied(self) -> None:
        path, body = auth_create()
        for key, value in (("Privileged", True), ("CapAdd", ["SYS_ADMIN"]), ("CapAdd", ["CHOWN"])):
            with self.subTest(key=key, value=value):
                request = json.loads(body)
                request["HostConfig"][key] = value
                self.assertFalse(guard.GuardPolicy().authorize("POST", path, json.dumps(request).encode())[0])

    def test_db_device_namespace_bind_and_unknown_hostconfig_escape_paths_are_denied(self) -> None:
        path, body = db_create()
        mutations = (
            ("Devices", [{"PathOnHost": "/dev/null", "PathInContainer": "/dev/null", "CgroupPermissions": "rwm"}]),
            ("DeviceRequests", [{"Driver": "nvidia", "Count": -1, "Capabilities": [["gpu"]]}]),
            ("NetworkMode", "host"), ("PidMode", "host"),
            ("Binds", ["/tmp:/host"]),
            ("Binds", ["/var/run/docker.sock:/var/run/docker.sock"]),
            ("Binds", ["/Users/marcin/.docker/run/docker.sock:/var/run/docker.sock"]),
            ("Binds", ["unrelated-volume:/var/lib/postgresql/data"]),
            ("SecurityOpt", ["seccomp=unconfined"]), ("IpcMode", "host"), ("UTSMode", "host"),
            ("UsernsMode", "host"), ("CgroupnsMode", "host"), ("CgroupParent", "host.slice"),
            ("OomScoreAdj", -1000), ("MaskedPaths", ["/proc"]), ("ReadonlyPaths", ["/sys"]),
            ("Tmpfs", {"/host": "rw"}),
            ("Runtime", "privileged-runtime"),
            ("Sysctls", {"net.ipv4.ip_forward": "1"}),
            ("unexpectedKey", True),
        )
        for key, value in mutations:
            with self.subTest(key=key, value=value):
                request = json.loads(body)
                request["HostConfig"][key] = value
                self.assertFalse(guard.GuardPolicy().authorize("POST", path, json.dumps(request).encode())[0])

    def test_gotrue_device_namespace_bind_and_publication_escape_paths_are_denied(self) -> None:
        path, body = auth_create()
        mutations = (
            ("Devices", [{"PathOnHost": "/dev/null", "PathInContainer": "/dev/null", "CgroupPermissions": "rwm"}]),
            ("DeviceRequests", [{"Driver": "nvidia", "Count": -1, "Capabilities": [["gpu"]]}]),
            ("NetworkMode", "host"), ("PidMode", "host"),
            ("Binds", ["/tmp:/host"]),
            ("Binds", ["/var/run/docker.sock:/var/run/docker.sock"]),
            ("Binds", ["/Users/marcin/.docker/run/docker.sock:/var/run/docker.sock"]),
            ("Binds", ["unrelated-volume:/data"]),
            ("PortBindings", {"9999/tcp": [{"HostIp": "0.0.0.0", "HostPort": "9999"}]}),
            ("SecurityOpt", ["seccomp=unconfined"]), ("IpcMode", "host"), ("UTSMode", "host"),
            ("UsernsMode", "host"), ("CgroupnsMode", "host"), ("CgroupParent", "host.slice"),
            ("OomScoreAdj", -1000), ("MaskedPaths", ["/proc"]), ("ReadonlyPaths", ["/sys"]),
            ("Tmpfs", {"/host": "rw"}), ("Sysctls", {"net.ipv4.ip_forward": "1"}),
            ("Runtime", "privileged-runtime"), ("unexpectedKey", True),
        )
        for key, value in mutations:
            with self.subTest(key=key, value=value):
                request = json.loads(body)
                request["HostConfig"][key] = value
                self.assertFalse(guard.GuardPolicy().authorize("POST", path, json.dumps(request).encode())[0])

    def test_only_known_global_read_only_metadata_is_allowed(self) -> None:
        policy = guard.GuardPolicy()
        self.assertTrue(policy.authorize("GET", "/v1.51/_ping", b"")[0])
        self.assertTrue(policy.authorize("HEAD", "/v1.51/_ping", b"")[0])
        self.assertTrue(policy.authorize("GET", "/v1.51/version", b"")[0])
        filtered = '{"label":{"com.supabase.cli.project=ourwed-collab-harness-1016":true}}'
        self.assertTrue(policy.authorize("GET", "/v1.51/containers/json?all=1&filters=" + urllib.parse.quote(filtered), b"")[0])
        self.assertTrue(policy.authorize("GET", "/v1.51/containers/json?filters=" + urllib.parse.quote(filtered), b"")[0])
        self.assertTrue(policy.authorize("GET", "/v1.51/images/public.ecr.aws/supabase/postgres:17.6.1.143/json", b"")[0])
        self.assertTrue(policy.authorize("GET", "/v1.51/images/public.ecr.aws/supabase/gotrue:v2.192.0/json", b"")[0])
        self.assertFalse(policy.authorize("GET", "/v1.51/images/public.ecr.aws/supabase/storage-api:v1.62.5/json", b"")[0])
        self.assertFalse(policy.authorize("GET", "/v1.51/images/other-project:latest/json", b"")[0])
        self.assertFalse(policy.authorize("POST", "/v1.51/version", b"")[0])

    def test_auth_container_followup_is_limited_to_exact_id_and_name(self) -> None:
        policy = guard.GuardPolicy()
        auth_id = "abcdef012345"
        policy.auth_container_ids.add(auth_id)
        self.assertTrue(policy.authorize("POST", f"/v1.51/containers/{auth_id}/start", b"")[0])
        self.assertTrue(policy.authorize("POST", f"/v1.51/containers/{auth_id}/rename?name={guard.AUTH_NAME}", b"")[0])
        self.assertFalse(policy.authorize("POST", f"/v1.51/containers/{auth_id}/rename?name={guard.AUTH_NAME}-evil", b"")[0])
        self.assertTrue(policy.authorize("DELETE", f"/v1.51/containers/{auth_id}?force=1&v=1", b"")[0])
        self.assertFalse(policy.authorize("DELETE", f"/v1.51/containers/{auth_id}?force=true", b"")[0])
        self.assertFalse(policy.authorize("DELETE", "/v1.51/containers/000000000000?force=1&v=1", b"")[0])

    def test_only_exact_project_volume_and_filtered_prune_are_allowed(self) -> None:
        policy = guard.GuardPolicy()
        volume_body = json.dumps({"Name": guard.DB_NAME, "Labels": dict(guard.PROJECT_LABELS)}).encode()
        self.assertTrue(policy.authorize("POST", "/v1.51/volumes/create", volume_body)[0])
        wrong_volume = json.dumps({"Name": guard.DB_NAME + "-evil", "Labels": dict(guard.PROJECT_LABELS)}).encode()
        self.assertFalse(policy.authorize("POST", "/v1.51/volumes/create", wrong_volume)[0])
        filters = '{"label":{"com.supabase.cli.project=ourwed-collab-harness-1016":true}}'
        encoded = urllib.parse.quote(filters)
        self.assertTrue(policy.authorize("POST", "/v1.51/containers/prune?filters=" + encoded, b"")[0])
        self.assertFalse(policy.authorize("POST", "/v1.51/containers/prune", b"")[0])
        volume_filters = '{"all":{"true":true},"label":{"com.supabase.cli.project=ourwed-collab-harness-1016":true}}'
        self.assertTrue(policy.authorize("POST", "/v1.51/volumes/prune?filters=" + urllib.parse.quote(volume_filters), b"")[0])
        self.assertFalse(policy.authorize("POST", "/v1.51/volumes/prune?filters=" + encoded, b"")[0])
        self.assertTrue(policy.authorize("POST", "/v1.51/networks/prune?filters=" + encoded, b"")[0])


class GuardTransportAndCleanupTests(unittest.TestCase):
    def test_cli_output_redacts_database_urls_and_supabase_keys(self) -> None:
        output = '\n'.join([
            '"ANON_KEY": "anon-secret-value"',
            '"SERVICE_ROLE_KEY": "service-secret-value"',
            '"PUBLISHABLE_KEY": "publishable-secret-value"',
            '"SECRET_KEY": "secret-key-value"',
            '"JWT_SECRET": "jwt-secret-value"',
            'DB_URL=postgresql://user:password@127.0.0.1:56522/postgres',
        ])
        redacted = guard._redact_output(output)
        for secret in ("anon-secret-value", "service-secret-value", "publishable-secret-value", "secret-key-value", "jwt-secret-value", "user:password"):
            self.assertNotIn(secret, redacted)

    def test_guard_uses_owner_only_unix_socket_and_no_tcp_socket(self) -> None:
        with tempfile.TemporaryDirectory(prefix="ourwed-guard-test-") as directory:
            os.chmod(directory, 0o700)
            path = os.path.join(directory, "guard.sock")
            server = guard.GuardServer(path, guard.GuardPolicy())
            try:
                os.chmod(path, 0o600)
                self.assertEqual(server.socket.family, socket.AF_UNIX)
                self.assertEqual(stat.S_IMODE(os.stat(directory).st_mode), 0o700)
                self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
                self.assertEqual(os.stat(path).st_uid, os.getuid())
            finally:
                server.server_close()

    def _run_and_assert_temp_removed(self, command: list[str], timeout: float | None = None) -> tuple[int, list[str]]:
        created: list[str] = []
        real_mkdtemp = tempfile.mkdtemp

        def capture_tempdir(*args, **kwargs):
            path = real_mkdtemp(*args, **kwargs)
            created.append(path)
            return path

        old_timeout = guard.STARTUP_TIMEOUT_SECONDS
        if timeout is not None:
            guard.STARTUP_TIMEOUT_SECONDS = timeout
        try:
            with mock.patch.object(guard.tempfile, "mkdtemp", side_effect=capture_tempdir):
                code = guard.run_guarded(command)
        finally:
            guard.STARTUP_TIMEOUT_SECONDS = old_timeout
        self.assertEqual(len(created), 1)
        self.assertFalse(os.path.exists(created[0]))
        return code, created

    def test_cleanup_on_success(self) -> None:
        real_server = guard.GuardServer

        class SuccessfulGuardServer(real_server):
            def __init__(self, socket_path, policy):
                super().__init__(socket_path, policy)
                policy.db_create_count = 1
                policy.auth_initializer_create_count = 1
                policy.auth_service_create_count = 1

        with mock.patch.object(guard, "GuardServer", SuccessfulGuardServer):
            code, _ = self._run_and_assert_temp_removed([sys.executable, "-c", "print('ok')"])
        self.assertEqual(code, 0)

    def test_cleanup_on_child_failure(self) -> None:
        code, _ = self._run_and_assert_temp_removed([sys.executable, "-c", "raise SystemExit(7)"])
        self.assertEqual(code, 7)

    def test_cleanup_on_timeout(self) -> None:
        code, _ = self._run_and_assert_temp_removed([sys.executable, "-c", "import time; time.sleep(5)"], timeout=0.1)
        self.assertEqual(code, 124)

    def test_cleanup_after_protocol_denial(self) -> None:
        child = (
            "import os,socket; "
            "p=os.environ['DOCKER_HOST'][7:]; "
            "s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.connect(p); "
            "s.sendall(b'GET /v1.51/containers/json HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n'); "
            "print(s.recv(128).decode('ascii','replace').splitlines()[0]); s.close()"
        )
        code, _ = self._run_and_assert_temp_removed([sys.executable, "-c", child])
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
