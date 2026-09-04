import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { AppearanceProvider } from '@/features/appearance/AppearanceProvider'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { InterfaceStyleProvider } from '@/features/interface-style/InterfaceStyleProvider'
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
          <AppearanceProvider>
            <InterfaceStyleProvider>
              <ToastProvider>
                <AppRouter />
              </ToastProvider>
            </InterfaceStyleProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
