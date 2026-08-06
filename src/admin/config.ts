/**
 * Admin app mount detection.
 * Production: admin.ourwed.pl (basename /)
 * Local fallback: http://localhost:5173/admin (basename /admin)
 */
export function resolveAdminMount(): {
  enabled: boolean
  basename: string
  environment: 'production' | 'local'
} {
  if (typeof window === 'undefined') {
    return { enabled: false, basename: '/', environment: 'local' }
  }

  const host = window.location.hostname.toLowerCase()
  const path = window.location.pathname

  if (host === 'admin.ourwed.pl') {
    return { enabled: true, basename: '/', environment: 'production' }
  }

  // Preview / staging admin hosts
  if (host.startsWith('admin.') && host.endsWith('.vercel.app')) {
    return { enabled: true, basename: '/', environment: 'production' }
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    const isLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.local')
    if (isLocalHost) {
      return { enabled: true, basename: '/admin', environment: 'local' }
    }
  }

  return { enabled: false, basename: '/', environment: 'local' }
}

export function adminPath(basename: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (!basename || basename === '/') return normalized
  if (normalized === '/') return basename
  return `${basename}${normalized}`
}
