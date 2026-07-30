import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/features/theme/bootstrapTheme'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
