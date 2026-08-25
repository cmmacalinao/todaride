import type { ReactNode } from 'react'
import type { Driver, Terminal, TodaOrganization } from '../types'

interface DriverPilaPageProps {
  org: TodaOrganization
  terminal: Terminal | null
  // Everyone standing in this line, in the order they will be offered work.
  pila: Driver[]
  me: Driver
  onBack: () => void
  onJoin: () => void
  onLeave: () => void
  joining: boolean
  // The other terminals this driver could work out of, so they can see where
  // the shorter line is before deciding to move.
  otherTerminals: { terminal: Terminal; waiting: number }[]
  onSwitchTerminal: (terminalId: string) => void
  // "Prioritize Pabili errands" — a preference about which work reaches you
  // in this line, so it belongs on the page about the line.
  pabiliControl?: ReactNode
}

export function DriverPilaPage({
  org,
  terminal,
  pila,
  me,
  onBack,
  onJoin,
  onLeave,
  joining,
  otherTerminals,
  onSwitchTerminal,
  pabiliControl,
}: DriverPilaPageProps) {
  const myPosition = pila.findIndex((d) => d.id === me.id) + 1
  const inLine = me.queueJoinedAt !== null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          ‹ Back
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
          🚏 {terminal ? terminal.name : org.name}
        </h1>
      </div>

      {/* The one thing a driver opens this page to find out. Everything else
          on the page is detail behind it. */}
      <section className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center">
        {inLine ? (
          <>
            <p className="text-xs font-medium text-brand-700">Your place in line</p>
            <p className="text-3xl font-bold text-brand-800">#{myPosition}</p>
            <p className="mt-0.5 text-[11px] text-brand-700">
              {myPosition === 1
                ? 'You are next — the closest booking comes to you first.'
                : `${myPosition - 1} ahead of you · ${pila.length} in the Pila`}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-700">You are not in this Pila</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {pila.length} {pila.length === 1 ? 'driver is' : 'drivers are'} waiting here. You still get requests
              when you are the nearest driver, but joining the line puts you in the order.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={inLine ? onLeave : onJoin}
          disabled={joining}
          className={`mt-2 w-full rounded-lg py-2 text-xs font-semibold text-white disabled:bg-slate-300 disabled:text-slate-500 ${
            inLine ? 'bg-slate-600 hover:bg-slate-700' : 'bg-brand-600 hover:bg-brand-700'
          }`}
        >
          {joining ? 'Checking location…' : inLine ? 'Leave Pila' : 'Join Pila'}
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold text-slate-700">
          Active Pila — {pila.length} {pila.length === 1 ? 'driver' : 'drivers'}
        </h2>
        {pila.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
            Nobody is in line right now. Join and you are first.
          </p>
        ) : (
          <div className="space-y-1">
            {pila.map((d, i) => (
              <div
                key={d.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                  d.id === me.id ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-600'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    i === 0 ? 'bg-gold-400 text-navy-900' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {d.id === me.id ? 'You' : d.name} · {d.plateNumber}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {d.queueJoinedAt ? new Date(d.queueJoinedAt).toLocaleTimeString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          A booking goes to the nearest driver first. Drivers standing at the same terminal are the same distance
          away, so this order is what decides between them.
        </p>
      </section>

      {pabiliControl && (
        <section className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm">{pabiliControl}</section>
      )}

      {otherTerminals.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="mb-1 text-xs font-semibold text-slate-700">Other terminals in {org.name}</h2>
          <p className="mb-2 text-[11px] text-slate-500">
            Switching takes you out of this line — the place you are holding is at this terminal.
          </p>
          <div className="space-y-1">
            {otherTerminals.map(({ terminal: t, waiting }) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSwitchTerminal(t.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {waiting} in line
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
