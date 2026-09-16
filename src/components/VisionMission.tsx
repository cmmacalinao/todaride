// TODARide Mobility's vision, mission and purpose, as written by the founders.
// Lives on the Welcome page under "Why Choose", for anyone who scrolls past the
// login to find out what the project is for.

const MISSION_POINTS: { title: string; body: string }[] = [
  {
    title: 'Empowering Drivers',
    body: 'Provide tricycle drivers with digital tools that help them access passengers, increase earning opportunities, manage their work, and participate in the digital economy.',
  },
  {
    title: 'Strengthening TODAs',
    body: "Help TODAs become more organized, connected, and digitally enabled while supporting their members' livelihood and professional development.",
  },
  {
    title: 'Protecting Passengers',
    body: 'Promote safer transportation through verified drivers, trip monitoring, transparent fares, emergency contacts, SOS alerts, crash detection, and community-based safety support.',
  },
  {
    title: 'Supporting Local Economic Development',
    body: 'Connect transportation with local businesses and services, creating opportunities for drivers, entrepreneurs, vendors, and other community stakeholders to participate in the local digital economy.',
  },
  {
    title: 'Promoting Inclusion',
    body: 'Make digital transportation accessible to community-based drivers and passengers, including those who have traditionally had limited access to digital platforms and economic opportunities.',
  },
  {
    title: 'Building Community Partnerships',
    body: 'Work with Rotary clubs, TODAs, local government, businesses, schools, organizations, and community stakeholders to develop sustainable solutions that address local transportation and economic needs.',
  },
  {
    title: 'Advancing Sustainable Mobility',
    body: 'Promote efficient, accessible, and environmentally responsible transportation while supporting long-term livelihood and community development.',
  },
]

const IMPACT_MODEL = [
  'Technology',
  'Empowered Drivers',
  'Safer Transportation',
  'Connected Communities',
  'Greater Economic Opportunity',
  'Stronger Local Economies',
]

function Heading({ children }: { children: string }) {
  return <h3 className="text-center text-xs font-bold uppercase tracking-[0.18em] text-brand-700">{children}</h3>
}

export function VisionMission() {
  return (
    <section className="border-t border-slate-200 bg-slate-50 px-5 py-10">
      <p className="text-center text-sm font-extrabold tracking-wide text-navy-900">TODARIDE MOBILITY</p>
      <h2 className="mt-1 text-center text-lg font-bold tracking-tight text-navy-900">Vision &amp; Mission</h2>

      <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <Heading>Our Vision</Heading>
        <p className="text-sm font-semibold leading-relaxed text-navy-900">
          To empower tricycle drivers and TODA communities through technology, creating safer, more inclusive, and
          sustainable transportation that expands livelihood opportunities, strengthens local economies, and
          contributes to community economic development.
        </p>
        <p className="text-xs leading-relaxed text-slate-600">
          TodaRide Mobility envisions a future where tricycle drivers are empowered with digital tools and greater
          access to passengers, services, and economic opportunities—enabling them to improve their livelihoods and
          participate more actively in the digital economy.
        </p>
        <p className="text-xs leading-relaxed text-slate-600">
          By connecting <span className="font-semibold text-slate-800">drivers, passengers, TODAs, local businesses, and communities</span>,
          TodaRide Mobility aims to create an inclusive transportation ecosystem that supports income generation,
          promotes digital inclusion, strengthens local enterprises, and improves access to essential services.
        </p>
        <div className="rounded-lg bg-brand-600 px-3 py-2.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Vision Tagline</p>
          <p className="mt-0.5 text-sm font-bold italic text-gold-400">
            “Empowering Drivers. Protecting Passengers. Strengthening Communities.”
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <Heading>Our Mission</Heading>
        <p className="text-sm font-semibold leading-relaxed text-navy-900">
          To provide a trusted, technology-enabled mobility platform that empowers tricycle drivers and TODAs,
          protects passengers, connects local businesses, and creates sustainable economic opportunities within the
          communities we serve.
        </p>
        <p className="text-xs text-slate-600">TodaRide Mobility will pursue this mission by:</p>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MISSION_POINTS.map((point, i) => (
            <li key={point.title} className="flex gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-navy-900">{point.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{point.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <Heading>Our Purpose</Heading>
        <p className="text-sm font-semibold leading-relaxed text-navy-900">
          TodaRide Mobility is more than a transportation platform. It is a community economic development initiative
          that uses technology to turn local transportation into an opportunity for livelihood, safety, inclusion, and
          community growth.
        </p>
        <p className="pt-1 text-center text-xs font-bold text-navy-900">Our Impact Model</p>
        <ol className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5">
          {IMPACT_MODEL.map((step, i) => (
            <li key={step} className="flex items-center gap-1">
              <span className="rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-semibold text-navy-900">{step}</span>
              {i < IMPACT_MODEL.length - 1 && (
                <span aria-hidden className="text-xs font-bold text-brand-600">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
