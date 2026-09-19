import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { armV7LatencyAuditFromUrl } from '@/features/assistant/v7/diagnostics/latencyTrace'
import '@/features/appearance/bootstrapAppearance'
import '@/features/theme/bootstrapTheme'
import './index.css'
import App from './App.tsx'

// Capture ?assistant_latency_audit=1 before SPA routes strip search.
armV7LatencyAuditFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
