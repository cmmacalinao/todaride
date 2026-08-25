import { DocumentUploadField } from './DocumentUploadField'
import { useRides } from '../context/RideContext'

// The artwork at the top of the Sakay sa Terminal page — and nowhere else.
//
// Deliberately not part of the banner-ad rotation: those four slots are
// advertising and rotate, this one is a standing instruction about how to
// board at the terminal, and mixing them would mean a fare notice
// disappearing behind a sari-sari store advert. One picture, one place, one
// person who can change it.
export function PilaBannerAdmin() {
  const { pilaBannerDataUrl, setPilaBanner } = useRides()
  const inUse = pilaBannerDataUrl ?? '/ads/sakay-sa-terminal.svg'

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Shown at the top of <span className="font-medium text-slate-700">Record mo ang Biyahe</span>, the page a
        passenger opens when they are already sitting in a tricycle. Changing it here changes only that page —
        the four banner-ad slots and every other screen are untouched.
      </p>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
        <p className="mb-1 text-[11px] font-semibold text-slate-600">
          Currently showing {pilaBannerDataUrl ? '— your uploaded artwork' : '— the built-in TODA SafeRide banner'}
        </p>
        <img src={inUse} alt="Sakay sa Terminal banner" className="w-full rounded-lg border border-slate-200" />
      </div>

      <DocumentUploadField label="Replace the banner" dataUrl={pilaBannerDataUrl} onUpload={setPilaBanner} />

      {pilaBannerDataUrl && (
        <button
          type="button"
          onClick={() => setPilaBanner(null)}
          className="w-full rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Put the built-in banner back
        </button>
      )}

      <p className="text-[11px] leading-snug text-slate-400">
        Landscape artwork works best — it is shown full width above the list of tricycles. Uploads are stored with
        the rest of the app&apos;s data, so keep the file small: a few hundred KB, not a few MB.
      </p>
    </div>
  )
}
