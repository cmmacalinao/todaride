import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { DocumentUploadField } from './DocumentUploadField'
import type { Driver } from '../types'

// What a driver chooses to show the passengers they carry.
//
// A passenger at a terminal does not read a plate — they read the number
// painted on the sidecar and they look at a face. Giving the driver these
// three fields is what lets the passenger find the right tricycle instead of
// approaching the wrong one, and it is the driver who knows what their own
// sidecar looks like.
//
// The photo goes to Admin before any passenger sees it, and a replacement
// goes back for review too (see REVIEW_DRIVER_PROFILE_PHOTO). The body
// number and description do not: they are claims about a vehicle whose plate
// Admin already verified, and a wrong one costs a passenger a minute at a
// terminal, not their safety. Putting a review queue in front of "my roof is
// yellow" would mean nobody keeps it current.
export function DriverProfileEditor({ driver }: { driver: Driver }) {
  const { setDriverProfilePhoto, setDriverVehicleDetails } = useRides()
  const [bodyNumber, setBodyNumber] = useState(driver.bodyNumber ?? '')
  const [description, setDescription] = useState(driver.vehicleDescription ?? '')
  const [saved, setSaved] = useState(false)

  const dirty = bodyNumber !== (driver.bodyNumber ?? '') || description !== (driver.vehicleDescription ?? '')
  const status = driver.profilePhotoStatus

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-800">🪪 Profile na nakikita ng pasahero</h2>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        Ito ang nakikita ng pasahero bago sumakay — para makita nila agad kung alin sa mga traysikel ang sa iyo.
        Hindi lumalabas dito ang numero mo, address, o mga papeles.
      </p>

      <div className="mt-2.5">
        <DocumentUploadField
          label={driver.profilePhotoDataUrl ? 'Palitan ang litrato' : 'Litrato mo (profile photo)'}
          dataUrl={driver.profilePhotoDataUrl ?? null}
          onUpload={(dataUrl) => setDriverProfilePhoto(driver.id, dataUrl)}
        />
        {status === 'pending' && (
          <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-800">
            ⏳ Nirerepaso pa ng Admin. Hindi pa ito nakikita ng pasahero hangga't hindi pa aprubado.
          </p>
        )}
        {status === 'approved' && (
          <p className="mt-1 text-[10px] text-brand-700">✓ Aprubado — ito na ang nakikita ng pasahero.</p>
        )}
        {status === 'rejected' && (
          <p className="mt-1 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] leading-snug text-red-800">
            Hindi ito naaprubahan ng Admin. Mag-upload ng malinaw na litrato ng mukha mo, nakaharap sa kamera.
          </p>
        )}
      </div>

      <label className="mt-2.5 block">
        <span className="block text-[11px] font-semibold text-slate-600">Body number</span>
        <span className="block text-[10px] leading-snug text-slate-400">
          Ang numerong nakapinta sa sidecar — ito ang hinahanap ng pasahero, hindi ang plaka.
        </span>
        <input
          value={bodyNumber}
          onChange={(e) => {
            setBodyNumber(e.target.value)
            setSaved(false)
          }}
          maxLength={12}
          placeholder="hal. 07"
          className="mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>

      <label className="mt-2 block">
        <span className="block text-[11px] font-semibold text-slate-600">Itsura ng traysikel</span>
        <span className="block text-[10px] leading-snug text-slate-400">
          Kulay at anumang madaling makita — hal. "Asul na sidecar, dilaw ang bubong".
        </span>
        <input
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            setSaved(false)
          }}
          maxLength={80}
          placeholder="hal. Asul na sidecar, dilaw ang bubong"
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            setDriverVehicleDetails(driver.id, bodyNumber, description)
            setSaved(true)
          }}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          I-save
        </button>
        {saved && !dirty && <span className="text-[11px] font-medium text-brand-700">✓ Naka-save</span>}
      </div>
    </section>
  )
}
