import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { queryClient } from '@/lib/queryClient'
import { AppRouter } from '@/routes'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
