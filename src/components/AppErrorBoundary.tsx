import { Component, type ErrorInfo, type ReactNode } from 'react'

// Catches a crash so it shows as something rather than nothing.
//
// React unmounts the whole tree when a render throws, and an unmounted tree
// is a white screen. No message, no button, no way back — the app simply
// stops existing, and the person holding the phone has nothing to report
// beyond "it went white", which is the least diagnosable bug there is.
//
// The failure this exists for is a chunk that will not load. The app is split
// into per-screen files whose names carry a content hash, so a phone holding
// a cached index.html from an older deploy asks for a file the server no
// longer has. The import rejects, React tears the tree down, and the screen
// goes white — on exactly the phones that have used the pilot before.
//
// That case is worth handling rather than reporting, because the fix is
// mechanical: fetch the page again and the new index.html names files that
// exist. So it reloads once, guarded, and only tells the user something has
// gone wrong if reloading did not help.
const RELOAD_MARKER = 'toda-chunk-reload'

function isChunkLoadFailure(error: Error): boolean {
  const text = `${error.name} ${error.message}`
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk/i.test(text) ||
    /dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /error loading dynamically imported/i.test(text)
  )
}

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
  reloading: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, reloading: false }

  static getDerivedStateFromError(): State {
    return { failed: true, reloading: false }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left in deliberately. This is the only trace of a crash that reaches
    // anybody, and a pilot tester cannot open a console.
    console.error('TODA SafeRide crashed:', error, info.componentStack)

    if (!isChunkLoadFailure(error)) return
    // Once per session. A reload loop is worse than the white screen it is
    // trying to fix, because it never stops long enough to be read.
    let alreadyTried = false
    try {
      alreadyTried = sessionStorage.getItem(RELOAD_MARKER) === '1'
      sessionStorage.setItem(RELOAD_MARKER, '1')
    } catch {
      // Private windows refuse sessionStorage. Without somewhere to record
      // the attempt there is no way to guarantee one reload rather than
      // many, so do not reload at all — the message below still works.
      return
    }
    if (alreadyTried) return
    this.setState({ reloading: true })
    window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <img src="/logo.webp" alt="TODA Ride Mobility" className="w-36 max-w-[60vw]" />
        {this.state.reloading ? (
          <p className="text-sm text-slate-600">Kinukuha ang pinakabagong bersyon…</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-navy-900">Nagka-aberya ang app.</p>
            <p className="max-w-xs text-xs leading-relaxed text-slate-600">
              Subukan itong buksan muli. Kung paulit-ulit ito, i-scan muli ang QR code — kinukuha nito ang
              pinakabagong bersyon.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.removeItem(RELOAD_MARKER)
                } catch {
                  /* nothing to clear */
                }
                window.location.replace('/?fresh=1')
              }}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white"
            >
              Buksan muli
            </button>
          </>
        )}
      </div>
    )
  }
}
