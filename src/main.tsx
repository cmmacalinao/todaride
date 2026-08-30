import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { freshStart, wantsFreshStart } from './lib/freshStart'

// A scanned or shared link arrives with ?fresh, meaning: bring this phone up
// to the current build before showing it anything. Nothing is mounted in that
// case — the page is about to be replaced, and mounting the stale app only to
// discard it a moment later is how you get a flash of last week's screen.
if (wantsFreshStart()) {
  void freshStart()
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}
