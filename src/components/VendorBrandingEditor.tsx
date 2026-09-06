import { useState } from 'react'
import { DocumentUploadField } from './DocumentUploadField'
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
    patch: Partial<{ coverPhotoDataUrl: string | null; logoDataUrl: string | null; themeColor: string | null; tagline: string | null }>,
  ) {
    updateVendorBranding({
      pharmacyId: pharmacy.id,
      coverPhotoDataUrl: pharmacy.coverPhotoDataUrl ?? null,
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
        label="Cover photo (optional)"
        dataUrl={pharmacy.coverPhotoDataUrl ?? null}
        onUpload={(dataUrl) => setBranding({ coverPhotoDataUrl: dataUrl })}
      />
      <DocumentUploadField
        label="Logo (optional)"
        dataUrl={pharmacy.logoDataUrl ?? null}
        onUpload={(dataUrl) => setBranding({ logoDataUrl: dataUrl })}
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
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-700">Theme color</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(VENDOR_THEME_COLORS).map(([key, color]) => (
            <button
              key={key}
              type="button"
              onClick={() => setBranding({ themeColor: pharmacy.themeColor === key ? null : key })}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${color.swatchClass} ${
                pharmacy.themeColor === key ? 'ring-2 ring-offset-2 ring-slate-400' : ''
              }`}
              title={color.label}
              aria-label={color.label}
            >
              {pharmacy.themeColor === key && <span className="text-xs font-bold text-white">✓</span>}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">Tap a color again to clear it and use the default for your category.</p>
      </div>
    </section>
  )
}
