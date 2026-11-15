import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { DevAgentation } from './app/DevAgentation'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DevAgentation />
  </StrictMode>,
)
