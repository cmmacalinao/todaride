// Fare / Arrives / Distance / Time / Trip — one row, the same on the booking
// screen, the passenger's trip and the driver's trip, under the map in normal
// view and above it in full screen. Every figure is passed in already
// formatted; a figure that does not exist yet is '—' rather than a hidden cell,
// so the row never changes shape between booking and arriving.
export function TripDetailsBar({
  fare,
  arrivesLabel = 'Arrives',
  arrives,
  distance,
  time,
  trip,
}: {
  fare: string
  arrivesLabel?: string
  arrives: string
  distance: string
  time: string
  trip: string
}) {
  const cell = (label: string, value: string, accent = false, wide = false) => (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <p className="truncate text-slate-500">{label}</p>
      <p className={`truncate font-bold ${accent ? 'text-brand-700' : 'text-slate-800'}`}>{value}</p>
    </div>
  )
  return (
    <div className="grid grid-cols-6 gap-1.5 text-[11px]">
      {cell('Fare', fare)}
      {cell(arrivesLabel, arrives, true)}
      {cell('Distance', distance)}
      {cell('Time', time)}
      {cell('Trip', trip, false, true)}
    </div>
  )
}
