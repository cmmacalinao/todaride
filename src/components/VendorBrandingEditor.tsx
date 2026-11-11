import { useState } from 'react'
import { DocumentUploadField } from './DocumentUploadField'
import { removeFlatBackground } from '../lib/photo'
import { VENDOR_THEME_COLORS } from './VendorStorefront'
import { useRides } from '../context/RideContext'
import { VendorSlugEditor } from './VendorSlugEditor'
import type { Pharmacy } from '../types'

// Lets a vendor personalize the things their public page (VendorStorefront.tsx,
// reached from "My Vendor Page" in the portal) can show beyond the generic
// businessType look: a cover photo, a logo, a tagline, and an accent theme
// color.
export function VendorBrandingEditor({ pharmacy }: { pharmacy: Pharmacy }) {
  const { updateVendorBranding } = useRides()
  const [tagline, setTagline] = useState(pharmacy.tagline ?? '')

  function setBranding(
    patch: Partial<{
      coverPhotoDataUrl: string | null
      coverPhotoPosition: { x: number; y: number; scale?: number } | null
      bannerBackgroundDataUrl: string | null
      logoDataUrl: string | null
      logoPosition: { x: number; y: number; scale?: number } | null
      bannerBackgroundPosition: { x: number; y: number; scale?: number } | null
      themeColor: string | null
      tagline: string | null
    }>,
  ) {
    updateVendorBranding({
      pharmacyId: pharmacy.id,
      coverPhotoDataUrl: pharmacy.coverPhotoDataUrl ?? null,
      coverPhotoPosition: pharmacy.coverPhotoPosition ?? null,
      bannerBackgroundDataUrl: pharmacy.bannerBackgroundDataUrl ?? null,
      logoDataUrl: pharmacy.logoDataUrl ?? null,
      logoPosition: pharmacy.logoPosition ?? null,
      bannerBackgroundPosition: pharmacy.bannerBackgroundPosition ?? null,
      themeColor: pharmacy.themeColor ?? null,
      tagline: pharmacy.tagline ?? null,
      ...patch,
    })
  }

  return (
    <>
    <VendorSlugEditor pharmacy={pharmacy} />
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">🎨 Customize your vendor page</h2>
      <DocumentUploadField
        label="Banner background (optional)"
        dataUrl={pharmacy.bannerBackgroundDataUrl ?? null}
        onUpload={(dataUrl) => setBranding({ bannerBackgroundDataUrl: dataUrl })}
        onRemove={() => setBranding({ bannerBackgroundDataUrl: null })}
      />
      {pharmacy.bannerBackgroundDataUrl && (
        <PlacementControl
          label="Banner zoom"
          hint="Drag the banner itself on the page above to choose which part shows."
          min={1}
          max={3}
          value={pharmacy.bannerBackgroundPosition?.scale ?? 1}
          onScale={(scale) =>
            setBranding({ bannerBackgroundPosition: { x: 50, y: 50, ...(pharmacy.bannerBackgroundPosition ?? {}), scale } })
          }
          onReset={() => setBranding({ bannerBackgroundPosition: null })}
        />
      )}
      <DocumentUploadField
        label="Profile photo (optional)"
        dataUrl={pharmacy.coverPhotoDataUrl ?? null}
        onUpload={(dataUrl) => setBranding({ coverPhotoDataUrl: dataUrl })}
        onRemove={() => setBranding({ coverPhotoDataUrl: null })}
        prepare={(dataUrl) => removeFlatBackground(dataUrl, { onlyIfFlat: true })}
      />
      <DocumentUploadField
        label="Logo (optional)"
        dataUrl={pharmacy.logoDataUrl ?? null}
        onUpload={(dataUrl) => setBranding({ logoDataUrl: dataUrl })}
        onRemove={() => setBranding({ logoDataUrl: null })}
        prepare={(dataUrl) => removeFlatBackground(dataUrl, { onlyIfFlat: true })}
      />
      {pharmacy.logoDataUrl && (
        <PlacementControl
          label="Logo size"
          hint="Drag the logo itself on the page above to move it."
          min={0.6}
          max={2}
          value={pharmacy.logoPosition?.scale ?? 1}
          onScale={(scale) => setBranding({ logoPosition: { x: 0, y: 0, ...(pharmacy.logoPosition ?? {}), scale } })}
          onReset={() => setBranding({ logoPosition: null })}
        />
      )}
      <div>
        <p className="mb-1 text-xs font-medium text-slate-700">Tagline (optional)</p>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          onBlur={() => setBranding({ tagline: tagline.trim() || null })}
          placeholder="e.g. Lutong Bahay, Everyday!"
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <VendorThemePicker pharmacy={pharmacy} />
    </section>
    </>
  )
}

// Size here, position on the picture itself.
//
// Splitting it that way is deliberate: dragging the real thing in the real
// header shows exactly what a customer will see, which a second miniature
// preview inside a form never quite does. The slider is here because size is
// awkward to drag on a picture that is already being dragged to move it, and
// Reset is here because it is the one control somebody reaches for after
// making a mess, when the picture is halfway off the screen.
function PlacementControl({
  label,
  hint,
  min,
  max,
  value,
  onScale,
  onReset,
}: {
  label: string
  hint: string
  min: number
  max: number
  value: number
  onScale: (scale: number) => void
  onReset: () => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-slate-400">{Math.round(value * 100)}%</span>
          <button type="button" onClick={onReset} className="text-[11px] font-semibold text-brand-700 hover:underline">
            Reset
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onScale(Number(e.target.value))}
        className="w-full accent-brand-600"
        aria-label={label}
      />
      <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
    </div>
  )
}

// The accent swatches on their own, so the portal's front page can offer
// them right above "View My Page" (see VendorPortalPage.tsx) as well as the
// Customize tab — changing the colour is the one branding tweak a vendor
// does often enough that a trip into the page editor for it is a chore.
// Saves through the same full-field branding update as everything else.
export function VendorThemePicker({ pharmacy }: { pharmacy: Pharmacy }) {
  const { updateVendorBranding } = useRides()

  function pick(key: string) {
    updateVendorBranding({
      pharmacyId: pharmacy.id,
      coverPhotoDataUrl: pharmacy.coverPhotoDataUrl ?? null,
      coverPhotoPosition: pharmacy.coverPhotoPosition ?? null,
      bannerBackgroundDataUrl: pharmacy.bannerBackgroundDataUrl ?? null,
      logoDataUrl: pharmacy.logoDataUrl ?? null,
      logoPosition: pharmacy.logoPosition ?? null,
      bannerBackgroundPosition: pharmacy.bannerBackgroundPosition ?? null,
      themeColor: pharmacy.themeColor === key ? null : key,
      tagline: pharmacy.tagline ?? null,
    })
  }

  // Collapsed by default: a theme is picked once, so the swatches need not
  // take a row of the Store page every day. The header shows the current
  // colour so it reads even when closed.
  const [open, setOpen] = useState(false)
  const current = pharmacy.themeColor ? VENDOR_THEME_COLORS[pharmacy.themeColor] : null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-base font-semibold text-slate-800">Theme selection</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {current && (
            <>
              <span className={`h-4 w-4 rounded-full ${current.swatchClass}`} />
              {current.label}
            </>
          )}
          <span aria-hidden>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
      <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-2">
        {Object.entries(VENDOR_THEME_COLORS).map(([key, color]) => (
          <button key={key} type="button" onClick={() => pick(key)} className="flex flex-col items-center gap-0.5">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${color.swatchClass} ${
                pharmacy.themeColor === key ? 'ring-2 ring-offset-1 ring-slate-400' : ''
              }`}
            >
              {pharmacy.themeColor === key && <span className="text-[10px] font-bold text-white">✓</span>}
            </span>
            <span className="text-[9px] font-medium text-slate-500">{color.label}</span>
          </button>
        ))}
      </div>
      )}
    </div>
  )
}
