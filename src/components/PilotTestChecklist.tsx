import { useEffect, useState } from 'react'
import { SHARE_URL } from './ShareAppPanel'

// The pilot testing guide, inside the app rather than on a printout.
//
// A tester works through this on the same phone they are testing with, so it
// has to survive being closed and come back where they left off. Ticks live in
// localStorage on that device: this is one person's progress through a run,
// not shared state, and putting it in the database would mean two testers
// overwriting each other's place.
//
// Every step says what to do and what should happen. A step without an
// expected result is not a test, it is an instruction — and a tester who does
// not know what they are looking for will report "it worked".

interface Step {
  do: string
  expect: string
}

interface Run {
  id: string
  title: string
  who: string
  steps: Step[]
}

const RUNS: Run[] = [
  // First, because everything after it is wasted if this is wrong. Four
  // rounds of GPS fixes failed on exactly two things: a phone serving its
  // cached build, and location granted for one visit only.
  {
    id: 'setup',
    title: 'Before you leave the house',
    who: 'Both phones · on wifi, before you go anywhere',
    steps: [
      {
        // Reads the same address the share sheet hands out, so a tester is
        // never told to open one host while the QR beside them points at
        // another — see lib/pilotOrigin.
        do: `Open ${SHARE_URL} on BOTH phones.`,
        expect:
          'Without ?fresh=1 a phone serves its cached copy, and you spend the morning testing last week’s build.',
      },
      {
        do: 'Sign one phone in as the passenger and the other as the driver.',
        expect:
          'Two different accounts. Create the driver one if it does not exist — signup needs no documents while Open driver signup is on.',
      },
      {
        do: 'Allow location on both, choosing "Allow on every visit".',
        expect:
          'The Live location row above the map reads “· allowed”. "Allow this time" makes the browser ask again on every single visit.',
      },
      {
        do: 'On the driver phone, read the GPS banner.',
        expect:
          'Green, with real coordinates and a ± figure. Amber with hundreds of metres means the fix is from wifi — stand outside until it tightens.',
      },
      {
        do: 'Bring a second person.',
        expect: 'Nobody can drive a tricycle and watch two phones. This is the step people skip.',
      },
    ],
  },
  // Two minutes standing still. If the markers are wrong here, driving will
  // not fix them, and you will have learned it before leaving the terminal.
  {
    id: 'baseline',
    title: 'Standing still, before you move',
    who: 'Both phones · at the terminal, engine off',
    steps: [
      {
        do: 'Driver phone: look at where your own tricycle marker is.',
        expect:
          'On you, pulsing, labelled “· live”. If it says “(no GPS)” it has fallen back to the terminal and is not your position.',
      },
      {
        do: 'Passenger phone: find the blue figure for yourself.',
        expect: 'A pulsing 🧍, separate from the green FROM pin, which stays where it was set.',
      },
      {
        do: "Passenger phone: look for the driver's tricycle.",
        expect:
          'A gold circle with a navy tricycle. It only appears if the driver published within the last 3 minutes, so their app must be open.',
      },
      {
        do: 'Stand still for one full minute and watch both markers.',
        expect: 'They hold still. Constant twitching means the movement filter is too loose — report it.',
      },
      {
        do: 'Walk twenty metres, still watching.',
        expect:
          'The marker follows as you walk. If it only moves when you reload the page, that is the bug to report first.',
      },
    ],
  },
  {
    id: 'signup',
    title: 'Sign up with a real code',
    who: 'Passenger · a number that has never registered',
    steps: [
      {
        do: 'Create an account as a Passenger with a real mobile number.',
        expect: 'An SMS arrives from TodaRide within a minute.',
      },
      {
        do: 'Enter the code and finish.',
        expect: 'The account is created — and is still there after the other phone has used the app for a few minutes.',
      },
      {
        do: 'Log out, then use Forgot password on the same number.',
        expect: 'A second real code arrives. Ordinary log-in does NOT text: that path shows the code on screen, to save credits.',
      },
    ],
  },
  {
    id: 'where',
    title: 'Say where you are',
    who: 'Passenger · standing outdoors',
    steps: [
      {
        do: 'Open Book a ride.',
        expect: 'City is filled from the account. FROM, destination, barangay and street are all empty.',
      },
      {
        do: 'Tap My GPS Location and allow location.',
        expect: 'FROM fills with a real address and the barangay follows the pin — not CLSU, unless you are at CLSU.',
      },
      {
        do: 'Tap Confirm Address without typing a landmark.',
        expect: 'It closes. A pin already answers "where exactly", so no landmark is demanded.',
      },
      {
        do: 'Change the city, then open the barangay list at either end.',
        expect: 'The list is that city’s barangays, and nothing is pre-selected.',
      },
      {
        do: 'Try again indoors, or decline the permission once.',
        expect: 'A message naming the cause — permission off, no fix, or timed out. Inside Messenger it says to open in Chrome or Safari.',
      },
    ],
  },
  {
    id: 'request',
    title: 'The request reaches a driver',
    who: 'Both phones · the one that matters most',
    steps: [
      {
        do: 'Passenger sets a destination and taps Book a tricycle.',
        expect: 'Within about 12 seconds the driver’s Home page lists it under "Passengers waiting nearby" — no refresh, no tapping.',
      },
      {
        do: 'If the nearest driver is far, read the warning before continuing.',
        expect: 'It states the distance in km and the wait in minutes, and lets you carry on or move the pickup.',
      },
      {
        do: 'Driver accepts and proposes the fare.',
        expect: 'The passenger sees the approval prompt within about 12 seconds, untouched.',
      },
      {
        do: 'Lock the passenger’s phone for a minute, then wake it.',
        expect: 'It catches up on waking rather than showing a stale screen.',
      },
      {
        do: 'Passenger approves the fare.',
        expect: 'Both phones agree on the same status, and neither reverts to an earlier one.',
      },
    ],
  },
  {
    id: 'moving',
    title: 'On the way',
    who: 'Both phones · driver actually driving',
    steps: [
      {
        do: 'Watch the driver marker as the tricycle moves.',
        expect: 'It follows the real road and keeps up. Needs Simulated tricycle movement switched OFF.',
      },
      {
        do: 'Check the distance and ETA shown to the passenger.',
        expect: 'Distance in km, and a wait that never reads "0 min".',
      },
      {
        do: 'Take a photo from the trip screen, then press SOS.',
        expect: 'The photo attaches to the trip; the SOS reaches Admin and the TODA.',
      },
      {
        do: 'Count how often the tricycle marker jumps forward.',
        expect:
          'Roughly every 30 seconds, in hops rather than a glide. That is the driver publish rate, not a fault — report it only if the hops stop.',
      },
      {
        do: "Put the passenger's phone in a pocket for two minutes, then look.",
        expect:
          'A gap in the trail. A browser stops tracking when the screen locks; this is the limit the installed app exists to remove, and is expected here.',
      },
    ],
  },
  {
    id: 'cancel',
    title: 'Getting out of it',
    who: 'Passenger · before the trip starts',
    steps: [
      {
        do: 'With a driver assigned but not yet arrived, tap Cancel trip.',
        expect: 'It cancels and STAYS cancelled — watch for 30 seconds to be sure the driver’s phone does not revive it.',
      },
      {
        do: 'Book again, and have the driver cancel instead.',
        expect: 'The passenger sees why, and can book again without dismissing anything by hand.',
      },
    ],
  },
  {
    id: 'arrive',
    title: 'Arriving and paying',
    who: 'Both phones',
    steps: [
      {
        do: 'At the destination, passenger taps "I’ve gotten off the tricycle" and confirms.',
        expect: 'The arrival is recorded with the real drop-off point.',
      },
      {
        do: 'Driver completes the trip and records the cash.',
        expect: 'Fare, platform fee and the driver’s share appear on Earnings — on the driver’s Home page as well as the Earnings tab.',
      },
      {
        do: 'Repeat, but have the driver NOT close the trip.',
        expect: 'After the passenger confirms arrival, "Tapusin ang biyahe" appears so they can close it themselves and book again.',
      },
    ],
  },
  {
    id: 'record',
    title: 'Record mo ang Biyahe',
    who: 'Passenger · flagging one down, no booking',
    steps: [
      {
        do: 'Tap the yellow "Track your trip for your safety" strip.',
        expect: 'The tracking page opens with a status line — even with no GPS fix it says what it is waiting for.',
      },
      {
        do: 'Drive off WITHOUT typing anything, and wait 30 to 60 seconds.',
        expect:
          'It starts recording by itself once you and the tricycle have moved together for half a minute. This is the boarding rule reading the phone’s own speed and heading — if it does not self-start, say so, then carry on with the TRC number.',
      },
      {
        do: 'Type the TRC number of the tricycle you are in.',
        expect: 'Recording starts immediately, with no confirmation step.',
      },
      {
        do: 'Now type a plate that is not on the list.',
        expect: 'It offers to record it anyway, saying plainly that the tricycle is not registered and that this will not start by itself.',
      },
      {
        do: 'Tap the Destination tab and set where you are going.',
        expect: 'The boxes open under the tab, fold away when confirmed, and the distance in km appears.',
      },
      {
        do: 'Check the red banner while riding, then tap "Itigil ang pag-record".',
        expect: 'Driver name and plate, with Photo and SOS beside it. Stopping closes the trip with NO payment screen.',
      },
      {
        do: 'Separately: get in a tricycle and simply ride, typing nothing.',
        expect: 'After about 30 seconds of moving together the trip records itself. Needs the driver’s app open and Simulated movement off.',
      },
    ],
  },
  {
    id: 'fares',
    title: 'Fares and taripa',
    who: 'Admin',
    steps: [
      {
        do: 'In Fees & Tariff, set "This taripa applies to" to a city and save a different standard rate.',
        expect: 'The city is marked "own taripa", and a booking that starts there is priced with it.',
      },
      {
        do: 'Do the same for one TODA.',
        expect: 'That TODA’s rides use its own schedule; other TODAs in the same city still use the city’s.',
      },
      {
        do: 'Press "Use the default instead".',
        expect: 'The override is removed and pricing returns to what it inherits.',
      },
      {
        do: 'Switch group pricing to "Set fare per group size" and enter your published figures.',
        expect: 'The preview updates, and a group booking is charged exactly those figures.',
      },
    ],
  },
  {
    id: 'sync',
    title: 'Two phones, one truth',
    who: 'Both phones · the sync check',
    steps: [
      {
        do: 'Register a new passenger on one phone while the other is open and busy.',
        expect: 'The new account survives, and is still there ten minutes later.',
      },
      {
        do: 'Complete a trip on one phone, then look at the other.',
        expect: 'Both show the same status, and nothing reappears that was finished.',
      },
      {
        do: 'In Simulator, clear all rides while both phones are open.',
        expect: 'Both go empty and stay empty.',
      },
    ],
  },
]

const LIMITS: { title: string; body: string }[] = [
  {
    title: 'A sleeping phone hears nothing',
    body: 'Updates arrive while the app is open, or the moment it is woken. There are no push notifications, so a driver with the screen off is not alerted to a new request until they look.',
  },
  {
    title: 'Messenger and Facebook block location',
    body: 'Links opened inside those apps use their own browser, which refuses GPS. Open in Chrome or Safari — the app says so when it can tell.',
  },
  {
    title: 'Old trips keep their old wording',
    body: 'Labels are stamped onto a trip when it is created, so a trip recorded before a change keeps the words it was born with.',
  },
]

const STORAGE_KEY = 'toda-pilot-checklist-v1'

function readTicks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    // A private window, or storage the browser refuses. The checklist still
    // works, it just forgets — which is better than not opening.
    return []
  }
}

export function PilotTestChecklist() {
  const [ticked, setTicked] = useState<string[]>(readTicks)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ticked))
    } catch {
      /* nothing to do — see readTicks */
    }
  }, [ticked])

  const total = RUNS.reduce((n, r) => n + r.steps.length, 0)
  const done = ticked.length
  const pct = total ? Math.round((done / total) * 100) : 0

  function toggle(key: string) {
    setTicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">✅ Pilot testing checklist</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Nine runs, from sign-up to payment. Each step says what to do and what should happen. Ticks are remembered
          on this device.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums text-brand-700">
            {done}
            <span className="text-xs font-medium text-slate-400">/{total}</span>
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </span>
          {done > 0 && (
            <button
              type="button"
              onClick={() => setTicked([])}
              className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
            >
              Clear ticks
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border-2 border-gold-400 bg-gold-50 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-navy-900">Before you start</h3>
        <ul className="mt-1.5 space-y-1 text-xs leading-snug text-slate-700">
          <li>
            <span className="font-semibold">Two phones, two people.</span> Testing both roles on one handset hides
            exactly the bugs this is looking for.
          </li>
          <li>
            <span className="font-semibold">Open it in Chrome or Safari</span>, not from inside Messenger.
          </li>
          <li>
            <span className="font-semibold">Reload both phones once</span> so neither is on a cached build.
          </li>
          <li>
            <span className="font-semibold">Turn off Simulated OTP and Simulated tricycle movement</span> in Super
            Admin. With either on you are testing the simulation, not the app.
          </li>
        </ul>
      </div>

      {RUNS.map((run, runIndex) => {
        const runDone = run.steps.filter((_, i) => ticked.includes(`${run.id}-${i}`)).length
        return (
          <div key={run.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-bold tabular-nums text-gold-600">
                {String(runIndex + 1).padStart(2, '0')}
              </span>
              <h3 className="flex-1 text-sm font-semibold text-slate-800">{run.title}</h3>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                {runDone}/{run.steps.length}
              </span>
            </div>
            <p className="mb-2 ml-6 text-[11px] text-slate-500">{run.who}</p>
            <ul className="ml-6 space-y-2">
              {run.steps.map((step, i) => {
                const key = `${run.id}-${i}`
                const on = ticked.includes(key)
                return (
                  <li key={key} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(key)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-xs ${on ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {step.do}
                      </span>
                      <span className="mt-0.5 block border-l-2 border-emerald-400 pl-2 text-[11px] leading-snug text-slate-500">
                        {step.expect}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wide text-amber-700">Known limits — not bugs</h3>
        <dl className="mt-2 space-y-2">
          {LIMITS.map((l) => (
            <div key={l.title}>
              <dt className="text-xs font-semibold text-slate-700">{l.title}</dt>
              <dd className="text-[11px] leading-snug text-slate-500">{l.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          Report anything that fails with: which run, which phone, and what the screen said.
        </p>
      </div>
    </section>
  )
}
