import { useState } from 'react'
import { DocumentUploadField } from './DocumentUploadField'
import { removeFlatBackground } from '../lib/photo'
import { VENDOR_THEME_COLORS } from './VendorStorefront'
import { useRides } from '../context/RideContext'
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
      logoDataUrl: string | null
      themeColor: string | null
      tagline: string | null
    }>,
  ) {
    updateVendorBranding({
      pharmacyId: pharmacy.id,
      coverPhotoDataUrl: pharmacy.coverPhotoDataUrl ?? null,
      coverPhotoPosition: pharmacy.coverPhotoPosition ?? null,
      logoDataUrl: pharmacy.logoDataUrl ?? null,
      themeColor: pharmacy.themeColor ?? null,
      tagline: pharmacy.tagline ?? null,
      ...patch,
    })
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">🎨 Customize your vendor page</h2>
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
      logoDataUrl: pharmacy.logoDataUrl ?? null,
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
