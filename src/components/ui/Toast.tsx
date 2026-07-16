import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import styles from './Toast.module.css'

export type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = crypto.randomUUID()
    setItems((prev) => [...prev, { id, message, tone }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 3200)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.viewport} aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`${styles.toast} ${styles[item.tone]}`}
            role="status"
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      showToast: (message) => {
        window.alert(message)
      },
    }
  }
  return ctx
}
