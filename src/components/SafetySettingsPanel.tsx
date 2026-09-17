import type { SafetySettings } from '../types'

// Every dial the Safety & Emergency Alert System has (see lib/safety.ts's
// SAFETY_DEFAULTS for what each one does at rest). One panel, so Super
// Admin can see the whole system's behaviour in one place rather than
// finding pieces of it scattered through other settings screens.

function ToggleRow({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string
  description: string
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} ${enabled ? 'on' : 'off'}`}
        onClick={() => onChange(!enabled)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? 'bg-brand-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function NumberRow({
  label,
  description,
  value,
  onChange,
  min = 0,
  max,
  suffix,
}: {
  label: string
  description: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  suffix: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(Math.max(min, max !== undefined ? Math.min(max, n) : n))
          }}
          className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-xs"
        />
        <span className="text-[11px] text-slate-500">{suffix}</span>
      </div>
    </div>
  )
}

export function SafetySettingsPanel({ value, onChange }: { value: SafetySettings; onChange: (patch: Partial<SafetySettings>) => void }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">🆘 Safety & Emergency Alert System</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          What SOS does, who it tells, and the automatic crash detector — see the App Admin Safety desk for
          incidents themselves.
        </p>
      </div>

      <NumberRow
        label="SOS confirmation countdown"
        description="How long SEND SOS counts down before it actually sends, with a cancel — stops a stray tap from raising a real alert. 0 sends instantly."
        value={value.sosCountdownSeconds}
        onChange={(n) => onChange({ sosCountdownSeconds: n })}
        min={0}
        max={10}
        suffix="seconds"
      />

      <div className="rounded-lg border border-slate-200 p-2.5">
        <p className="text-xs font-semibold text-slate-700">Notify the registered TODA</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Which kinds of incident reach the driver's own TODA, on top of the App Admin who always sees everything.</p>
        <div className="mt-2 space-y-1.5">
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={value.notifyTodaOn.passengerSos} onChange={(e) => onChange({ notifyTodaOn: { ...value.notifyTodaOn, passengerSos: e.target.checked } })} />
            Passenger SOS
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={value.notifyTodaOn.driverSos} onChange={(e) => onChange({ notifyTodaOn: { ...value.notifyTodaOn, driverSos: e.target.checked } })} />
            Driver SOS
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={value.notifyTodaOn.possibleCrash} onChange={(e) => onChange({ notifyTodaOn: { ...value.notifyTodaOn, possibleCrash: e.target.checked } })} />
            Automatic crash detection, when nobody answers
          </label>
        </div>
      </div>

      <ToggleRow
        label="Notify guardian accounts"
        description="A passenger's linked, consented parent/guardian account sees the alert on their own screen."
        enabled={value.notifyGuardian}
        onChange={(enabled) => onChange({ notifyGuardian: enabled })}
      />
      <ToggleRow
        label="Notify the other seat on the trip"
        description="A driver's SOS is shown to the passenger with them, and a possible crash to both. A passenger's own SOS is never shown to the driver — they may be the danger."
        enabled={value.notifyCounterpart}
        onChange={(enabled) => onChange({ notifyCounterpart: enabled })}
      />

      <ToggleRow
        label="Alert nearby TODA drivers"
        description="Verified, on-duty drivers close to the incident get a limited in-app notice — no names, just that help may be needed."
        enabled={value.nearbyDriversEnabled}
        onChange={(enabled) => onChange({ nearbyDriversEnabled: enabled })}
      />
      {value.nearbyDriversEnabled && (
        <>
          <NumberRow
            label="Nearby alert radius"
            description="How far from the incident a driver's last position can be and still count as nearby."
            value={value.nearbyRadiusMeters}
            onChange={(n) => onChange({ nearbyRadiusMeters: n })}
            min={100}
            max={10000}
            suffix="meters"
          />
          <NumberRow
            label="Maximum nearby recipients"
            description="At most this many of the closest drivers are told, even if more are in range."
            value={value.nearbyMaxRecipients}
            onChange={(n) => onChange({ nearbyMaxRecipients: n })}
            min={1}
            max={50}
            suffix="drivers"
          />
          <NumberRow
            label="Position must be fresh within"
            description="A driver whose last shared position is older than this does not count as nearby."
            value={value.nearbyMaxFixAgeMinutes}
            onChange={(n) => onChange({ nearbyMaxFixAgeMinutes: n })}
            min={1}
            max={120}
            suffix="minutes"
          />
        </>
      )}

      <div className="rounded-lg border border-slate-200 p-2.5">
        <p className="text-xs font-semibold text-slate-700">Notification channels</p>
        <p className="mt-0.5 text-[11px] text-slate-500">How an emergency notice reaches someone.</p>
        <div className="mt-2 space-y-1.5">
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={value.channels.inApp} onChange={(e) => onChange({ channels: { ...value.channels, inApp: e.target.checked } })} />
            In-app (the safety desk, the TODA admin page, a guardian's own screen)
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={value.channels.sms} onChange={(e) => onChange({ channels: { ...value.channels, sms: e.target.checked } })} />
            SMS to emergency contacts (via Semaphore, same account as login codes)
          </label>
          {value.channels.sms && (
            <p className="ml-6 text-[11px] text-slate-400">
              Off by default and still one-tap: a contact who opted in gets a text queued on the safety desk, and someone there has to tap Send — nothing here goes out on its own.
            </p>
          )}
        </div>
      </div>

      <ToggleRow
        label="Automatic crash detection"
        description="Uses the phone's motion sensor during a trip to ask 'Possible accident detected — are you OK?'. Off by default: a tricycle on a real road bounces a lot, and this needs tuning before it should escalate on its own."
        enabled={value.crashDetectionEnabled}
        onChange={(enabled) => onChange({ crashDetectionEnabled: enabled })}
      />
      {value.crashDetectionEnabled && (
        <>
          <div className="rounded-lg border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-700">Sensitivity</p>
            <p className="mt-0.5 text-[11px] text-slate-500">How hard an impact has to be before the prompt shows. Lower catches more, and more false alarms.</p>
            <div className="mt-2 flex gap-1.5">
              {(['low', 'medium', 'high'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ crashSensitivity: s })}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold capitalize ${
                    value.crashSensitivity === s ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <NumberRow
            label="Response timeout"
            description="How long the 'Are you OK?' prompt waits before escalating on its own with no answer."
            value={value.crashTimeoutSeconds}
            onChange={(n) => onChange({ crashTimeoutSeconds: n })}
            min={10}
            max={120}
            suffix="seconds"
          />
        </>
      )}
    </section>
  )
}
