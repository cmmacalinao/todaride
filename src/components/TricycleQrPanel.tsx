import { useState } from 'react'
import { PILOT_ORIGIN } from '../lib/pilotOrigin'
import { QRCodeSVG } from 'qrcode.react'
import { useRides } from '../context/RideContext'
import { terminalRideIsFree } from '../lib/terminalFee'
import type { Driver } from '../types'

interface TricycleQrPanelProps {
  driver: Driver
}

// The sticker that goes inside the tricycle. A passenger who walked up at the
// terminal scans it instead of typing anything: the app already knows which
// tricycle they are sitting in, so the ride records the driver, the plate and
// the trip without either of them doing setup at the kerb.
export function TricycleQrPanel({ driver }: TricycleQrPanelProps) {
  const { publicBaseUrl, terminalQrFeeWaived, commissionPerRide } = useRides()
  const feeFree = terminalRideIsFree(terminalQrFeeWaived, commissionPerRide)
  const [showBig, setShowBig] = useState(false)

  // publicBaseUrl is what the Super Admin published the app at; without it the
  // QR would encode "localhost", which is unreachable from a passenger's
  // phone — so the driver is told to ask rather than handed a dead code.
  // Falls back to the pilot address itself, not this page (2026-09-23):
  // a code printed from a preview build or the old Netlify address would
  // otherwise send phones somewhere other than the live domain.
  const base = publicBaseUrl || PILOT_ORIGIN
  const scanUrl = `${base}/scan/${driver.id}`
  const usable = !!publicBaseUrl || !/localhost|127\.0\.0\.1/.test(base)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">
        Track your Trip <span className="font-normal text-slate-500">— for your safe ride</span>
      </h2>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Print this and stick it inside your tricycle. A passenger who gets in at the terminal scans it and their
        trip is logged to you — no typing, no waiting for a booking to come through.
      </p>

      <div className="mt-2 flex items-center gap-3 rounded-lg border border-gold-400/60 bg-gold-50 p-3">
        <button
          type="button"
          onClick={() => setShowBig(true)}
          title="Show this big enough to scan"
          className="shrink-0 rounded-lg bg-white p-1.5 shadow-sm"
        >
          <QRCodeSVG value={scanUrl} size={72} level="M" marginSize={1} />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-navy-900">
            {driver.name} · {driver.plateNumber}
          </span>
          {feeFree && (
            <span className="mt-0.5 block text-[11px] font-semibold text-emerald-800">
              ✓ No app fee charged on rides that start with this scan.
            </span>
          )}
          <span className="mt-0.5 block break-all text-[10px] text-slate-500">{scanUrl}</span>
        </span>
      </div>

      {!usable && (
        <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
          This code points at this device only. Ask your App Admin to set the app&apos;s public address in Super
          Admin before printing it — otherwise a passenger&apos;s phone cannot open it.
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowBig(true)}
        className="mt-2 w-full rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        ⬛ Show full screen
      </button>

      {showBig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ride QR code"
          onClick={() => setShowBig(false)}
        >
          {/* Big, white, and nothing else on it — this is held up for a
              passenger's camera, sometimes at night. */}
          <div className="w-full max-w-xs rounded-xl bg-white p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold text-navy-900">Track your Trip</p>
            <p className="text-[11px] font-semibold text-slate-500">for your safe ride</p>
            <div className="mt-3 flex justify-center">
              <QRCodeSVG value={scanUrl} size={220} level="M" marginSize={2} />
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {driver.name} · {driver.plateNumber}
            </p>
            {feeFree && <p className="text-xs font-semibold text-emerald-700">No app fee on this ride</p>}
            <button
              type="button"
              onClick={() => setShowBig(false)}
              className="mt-3 w-full rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
