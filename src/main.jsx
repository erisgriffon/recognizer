import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.scaffold.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
