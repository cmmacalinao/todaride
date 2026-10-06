import { useRides } from '../context/RideContext'

// Photos waiting to be shown to passengers.
//
// This is a small queue with a real job. The photo is the one part of a
// driver profile that a driver supplies and a passenger trusts on sight, and
// nothing else in the app checks that the face belongs to the driver, that it
// is a face at all, or that it is something a passenger should be shown. An
// unreviewed photo that went straight through would make the profile sheet
// less trustworthy than no photo, because it would look verified.
//
// Only pending photos appear. An empty queue says so rather than rendering
// nothing, so an admin can tell "nothing to do" from "this panel is broken".
export function AdminDriverPhotoQueue() {
  const { drivers, reviewDriverProfilePhoto } = useRides()
  const waiting = drivers.filter((d) => d.profilePhotoStatus === 'pending' && d.profilePhotoDataUrl)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-800">
        🪪 Driver photos for review{waiting.length > 0 && ` (${waiting.length})`}
      </h2>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        Passengers see this photo when they open their driver profile. Approve a clear photo of the driver, facing
        the camera. Reject anything else — a rejected photo is deleted, not kept.
      </p>

      {waiting.length === 0 ? (
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">No photos waiting.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {waiting.map((d) => (
            <div key={d.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-2">
              <img
                src={d.profilePhotoDataUrl ?? ''}
                alt={`Profile photo submitted by ${d.name}`}
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{d.name}</p>
                <p className="text-[11px] text-slate-500">
                  Plate {d.plateNumber}
                  {d.bodyNumber ? ` · Body No. ${d.bodyNumber}` : ''}
                </p>
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => reviewDriverProfilePhoto(d.id, true, 'Admin')}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewDriverProfilePhoto(d.id, false, 'Admin')}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
