import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { queryClient } from '@/lib/queryClient'
import { AppRouter } from '@/routes'
import { AdminApp, resolveAdminMount } from '@/admin'

export default function App() {
  const adminMount = resolveAdminMount()

  if (adminMount.enabled) {
    return (
      <QueryClientProvider client={queryClient}>
        <AdminApp />
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppRouter />
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
