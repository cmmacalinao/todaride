import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { usePublicOrigin, useRides } from '../context/RideContext'
import { ShareLinkNotice } from './ShareLinkNotice'
import { ShareSheet } from './ShareSheet'
import type { DriverInvite, Pharmacy } from '../types'

// "Register a rider" — a vendor puts a rider they already know into the
// system: name, phone and plate, which is what the vendor has. The rider
// gets a link (or scans the QR at the counter) that opens the driver sign-up
// with those filled in, and finishes it themselves — licence, address, their
// own PIN, documents — since those are theirs to give, not the vendor's.
// Completing it makes them this vendor's trusted rider automatically (see
// REGISTER_DRIVER). Same DriverInvite a TODA uses, tagged with the vendor.
//
// A rider who already has an account does not need any of this: the vendor
// finds them in the list below and taps Add. This is for the ones who are
// not on TODA SafeRide yet.
export function VendorRiderInvite({ vendor }: { vendor: Pharmacy }) {
  const { driverInvites, drivers, createDriverInvite, removeDriverInvite } = useRides()
  const { origin, shareable } = usePublicOrigin()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [plate, setPlate] = useState('')
  const [share, setShare] = useState<{ title: string; url: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [showQr, setShowQr] = useState<string | null>(null)

  const mine = driverInvites.filter((i) => i.pharmacyId === vendor.id)
  const inviteLink = (inv: DriverInvite) => `${origin}/drive?invite=${inv.id}`
  const loginLink = `${origin}/drive?mode=login`
  const canCreate = !!name.trim() && phone.replace(/\D/g, '').length >= 10

  function handleCreate() {
    if (!canCreate) return
    createDriverInvite({
      todaOrgId: null,
      name: name.trim(),
      phone: phone.trim(),
      email: null,
      pharmacyId: vendor.id,
      plateNumber: plate.trim() || null,
    })
    setName('')
    setPhone('')
    setPlate('')
    setOpen(false)
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setShare({ title: 'Copy this link', url })
    }
  }

  const linkButtons = (title: string, url: string) => (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setShare({ title, url })}
        className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
      >
        Share
      </button>
      <button
        type="button"
        onClick={() => void copy(url)}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
      >
        {copied === url ? '✓ Copied' : 'Copy link'}
      </button>
      <button
        type="button"
        onClick={() => setShowQr(showQr === url ? null : url)}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
      >
        {showQr === url ? 'Hide QR' : 'QR code'}
      </button>
    </div>
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">🛺 Register a rider</p>
          <p className="text-[11px] text-slate-500">
            Not on TODA Ride Mobility yet? Put in their name, phone and plate, then send them the link — they finish
            sign-up and set their own PIN, and they're added to your trusted riders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md border border-brand-300 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
        >
          {open ? 'Close' : '＋ New rider'}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rider's full name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09XX-XXX-XXXX"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="Plate / TRC number (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Register & get their link
          </button>
        </div>
      )}

      {mine.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {mine.map((inv) => {
            const driver = inv.usedByDriverId ? drivers.find((d) => d.id === inv.usedByDriverId) : null
            const url = inviteLink(inv)
            return (
              <div key={inv.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium text-slate-700">
                    {inv.name} <span className="font-normal text-slate-400">· {inv.phone}{inv.plateNumber ? ` · ${inv.plateNumber}` : ''}</span>
                  </p>
                  {driver ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      ✓ Registered{driver.verificationStatus === 'approved' ? '' : ' · awaiting approval'}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Waiting for sign-up
                    </span>
                  )}
                </div>
                {!driver && (
                  <div className="mt-1.5">
                    <div className="flex items-start justify-between gap-2">
                      {linkButtons(`Sign-up link for ${inv.name}`, url)}
                      <button
                        type="button"
                        onClick={() => removeDriverInvite(inv.id)}
                        title="Remove this invite"
                        className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        ✕ Remove
                      </button>
                    </div>
                    {showQr === url && (
                      <div className="mt-2 flex justify-center rounded-lg bg-white p-2">
                        <QRCodeSVG value={url} size={144} level="M" marginSize={2} />
                      </div>
                    )}
                  </div>
                )}
                {driver && driver.verificationStatus !== 'approved' && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    The app admin still has to approve their account before they can take deliveries.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-2 border-t border-slate-200 pt-2">
        <p className="mb-1 text-[11px] text-slate-500">Rider already registered? Send them the driver login page:</p>
        {linkButtons('TODA Ride Mobility driver login', loginLink)}
        {showQr === loginLink && (
          <div className="mt-2 flex justify-center rounded-lg bg-white p-2">
            <QRCodeSVG value={loginLink} size={144} level="M" marginSize={2} />
          </div>
        )}
      </div>
      {!shareable && <ShareLinkNotice origin={origin} />}
      {share && <ShareSheet title={share.title} url={share.url} onClose={() => setShare(null)} />}
    </div>
  )
}
