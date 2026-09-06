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
//
// ?recover=1 is the other path that must not mount the app: it reads the copy
// of the shared data this phone holds and offers to send it back to the
// server (see recover.ts). freshStart keeps the parameter across its reload,
// so ?fresh=1&recover=1 first brings the phone onto the build that has this
// screen, then lands on it.
if (wantsFreshStart()) {
  void freshStart()
} else if (new URLSearchParams(window.location.search).has('recover')) {
  void import('./recover').then((m) => m.renderRecovery())
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}
