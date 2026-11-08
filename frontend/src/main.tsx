import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// StrictMode is intentionally off: it mounts the 3D renderer twice in development,
// which doubles world-building time on the large Alliance War maps.
createRoot(document.getElementById('root')!).render(<App />)
