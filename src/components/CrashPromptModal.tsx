import { useEffect, useState } from 'react'

// "Possible accident detected. Are you OK?" — the one screen a sensor spike
// is allowed to put in front of someone. Three answers, and a countdown
// that answers FOR them if they cannot: I'M OK logs the possible crash and
// nothing more, SEND SOS raises the same incident a manual SOS would, and
// silence for the whole timeout escalates on its own (see DriverPage/
// TripMonitor's onTimeout, which fires the real SOS with the automatic
// trigger source — never a 911 call, that stays a human decision always).
export function CrashPromptModal({
  timeoutSeconds,
  onOk,
  onSendSos,
  onTimeout,
}: {
  timeoutSeconds: number
  onOk: () => void
  onSendSos: () => void
  onTimeout: () => void
}) {
  const [remaining, setRemaining] = useState(timeoutSeconds)

  useEffect(() => {
    if (remaining <= 0) {
      onTimeout()
      return
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4" role="alertdialog" aria-modal="true" aria-label="Possible accident detected">
      <div className="w-full max-w-sm rounded-2xl border-2 border-amber-400 bg-white p-5 shadow-2xl">
        <p className="text-center text-4xl">⚠️</p>
        <p className="mt-2 text-center text-lg font-extrabold text-slate-900">Possible accident detected.</p>
        <p className="text-center text-base font-semibold text-slate-700">Are you OK?</p>
        <p className="mt-2 text-center text-[11px] text-slate-500">
          Your phone felt a hard jolt. This is only a guess from its motion sensor, not a confirmed accident.
        </p>
        <p className="mt-1 text-center text-xs font-semibold text-amber-700">
          Sending SOS automatically in {remaining}s if nobody answers.
        </p>

        <div className="mt-4 space-y-2">
          <button type="button" onClick={onOk} className="w-full rounded-xl bg-emerald-600 py-3 text-base font-bold text-white hover:bg-emerald-700">
            🙆 I&apos;M OK
          </button>
          <button type="button" onClick={onSendSos} className="w-full rounded-xl bg-danger-600 py-3 text-base font-bold text-white hover:bg-danger-700">
            🆘 SEND SOS
          </button>
          <a href="tel:911" className="block w-full rounded-xl border-2 border-danger-600 py-2.5 text-center text-sm font-bold text-danger-800 hover:bg-danger-50">
            🚑 CALL 911
          </a>
        </div>
      </div>
    </div>
  )
}
