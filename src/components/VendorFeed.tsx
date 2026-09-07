import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { DocumentUploadField } from './DocumentUploadField'
import type { MedicineProduct, Pharmacy } from '../types'
import { VendorBannerArt, resolveVendorAccent, type VendorAccent } from './VendorStorefront'

// The vendor's page as a feed — the part of a Facebook page people actually
// scroll: a post at a time, newest on top, each with the store's name and
// logo, its text, a photo if there is one, and (when the post is about a
// dish) that dish drawn underneath with its price and an Add button. Reads
// the same list on the vendor's own portal, the customer's ordering page
// and the public link; only what the reader may do with it differs.

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function VendorFeedList({
  pharmacy,
  items,
  accent,
  onAdd,
  onRemove,
}: {
  pharmacy: Pharmacy
  items: MedicineProduct[]
  accent: VendorAccent
  // A customer who can order: the featured dish gets an Add button.
  onAdd?: (productId: string) => void
  // The vendor on their own portal: each post gets a Delete.
  onRemove?: (postId: string) => void
}) {
  const posts = pharmacy.posts ?? []
  if (posts.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-400">
        {onRemove ? 'No posts yet — share a promo or a dish above.' : `${pharmacy.name} hasn't posted yet.`}
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {posts.map((post) => {
        const featured = post.productId ? items.find((i) => i.id === post.productId) : undefined
        return (
          <article key={post.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center gap-2 px-3 pt-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${accent.gradient}`}>
                {pharmacy.logoDataUrl ? (
                  <img src={pharmacy.logoDataUrl} alt="" className="h-full w-full bg-white object-contain" />
                ) : (
                  <span aria-hidden className="text-base">{accent.icon}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{pharmacy.name}</p>
                <p className="text-[11px] text-slate-400">{timeAgo(post.createdAt)}</p>
              </div>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(post.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕ Delete
                </button>
              )}
            </header>
            {post.text && <p className="whitespace-pre-line px-3 pt-2 text-sm leading-snug text-slate-700">{post.text}</p>}
            {post.photoDataUrl && (
              <img src={post.photoDataUrl} alt="" className="mt-2 max-h-80 w-full object-cover" loading="lazy" />
            )}
            {featured && (
              <div className="m-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                {featured.photoDataUrl && (
                  <img src={featured.photoDataUrl} alt={featured.name} className="h-14 w-14 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{featured.name}</p>
                  <p className={`text-sm font-bold ${accent.softText}`}>₱{featured.price}</p>
                  {featured.description && <p className="truncate text-[11px] text-slate-500">{featured.description}</p>}
                </div>
                {onAdd && featured.inStock && featured.visible !== false && (
                  <button
                    type="button"
                    onClick={() => onAdd(featured.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white ${accent.solid} ${accent.solidHover}`}
                  >
                    + Add
                  </button>
                )}
              </div>
            )}
            {!featured && !post.photoDataUrl && <div className="pb-3" />}
            {(featured || post.photoDataUrl) && !featured && <div className="pb-1" />}
          </article>
        )
      })}
    </div>
  )
}

// Every vendor's posts in one scroll — the Food Express page as a newsfeed.
// Each post sits under its own store's banner (gradient, logo, name), so a
// customer browsing sees who is cooking what today without opening each
// store; the banner is the way in, and a featured dish can be ordered
// straight from the post.
export function VendorNewsfeed({
  vendors,
  items,
  onOpenVendor,
  onOrderItem,
  limit = 20,
}: {
  vendors: Pharmacy[]
  items: MedicineProduct[]
  onOpenVendor: (vendorId: string) => void
  onOrderItem: (vendorId: string, productId: string) => void
  limit?: number
}) {
  const entries = vendors
    .flatMap((vendor) => (vendor.posts ?? []).map((post) => ({ vendor, post })))
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())
    .slice(0, limit)
  if (entries.length === 0) return null
  return (
    <div className="space-y-3">
      {entries.map(({ vendor, post }) => {
        const accent = resolveVendorAccent(vendor)
        const featured = post.productId ? items.find((i) => i.id === post.productId) : undefined
        return (
          <article key={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* The store's own banner as the post header — tap it to open
                the store. */}
            <button
              type="button"
              onClick={() => onOpenVendor(vendor.id)}
              className={`relative flex w-full items-center gap-2.5 overflow-hidden bg-gradient-to-br px-3 py-2 text-left ${accent.gradient}`}
            >
              <VendorBannerArt />
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
                {vendor.logoDataUrl ? (
                  <img src={vendor.logoDataUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span aria-hidden className="text-base">{accent.icon}</span>
                )}
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white drop-shadow">{vendor.name}</span>
                <span className="block text-[11px] text-white/80">
                  {timeAgo(post.createdAt)}
                  {vendor.tagline ? ` · ${vendor.tagline}` : ''}
                </span>
              </span>
              <span aria-hidden className="relative text-white/70">
                ›
              </span>
            </button>
            {post.text && <p className="whitespace-pre-line px-3 pt-2.5 text-sm leading-snug text-slate-700">{post.text}</p>}
            {post.photoDataUrl && <img src={post.photoDataUrl} alt="" className="mt-2 max-h-80 w-full object-cover" loading="lazy" />}
            {featured && (
              <div className="m-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                {featured.photoDataUrl && (
                  <img src={featured.photoDataUrl} alt={featured.name} className="h-14 w-14 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{featured.name}</p>
                  <p className={`text-sm font-bold ${accent.softText}`}>₱{featured.price}</p>
                </div>
                {featured.inStock && featured.visible !== false && (
                  <button
                    type="button"
                    onClick={() => onOrderItem(vendor.id, featured.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white ${accent.solid} ${accent.solidHover}`}
                  >
                    Order
                  </button>
                )}
              </div>
            )}
            {!featured && (
              <div className="px-3 pb-3 pt-2">
                <button
                  type="button"
                  onClick={() => onOpenVendor(vendor.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white ${accent.solid} ${accent.solidHover}`}
                >
                  View menu ›
                </button>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

// Where the vendor writes a post: a line or two, an optional photo, and
// optionally the dish it is about.
export function VendorFeedComposer({ pharmacy, items }: { pharmacy: Pharmacy; items: MedicineProduct[] }) {
  const { addVendorPost } = useRides()
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [productId, setProductId] = useState('')
  const canPost = text.trim().length > 0 || !!photo

  function handlePost() {
    if (!canPost) return
    addVendorPost({ pharmacyId: pharmacy.id, text, photoDataUrl: photo, productId: productId || null })
    setText('')
    setPhoto(null)
    setProductId('')
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="What's new at your store? A promo, today's special, a new dish…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-medium text-slate-500">Photo (optional)</p>
          <DocumentUploadField label="Post photo" dataUrl={photo} onUpload={setPhoto} onRemove={() => setPhoto(null)} />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium text-slate-500">Feature a menu item (optional)</p>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">— None —</option>
            {items
              .filter((i) => i.visible !== false)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · ₱{i.price}
                </option>
              ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={handlePost}
        disabled={!canPost}
        className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        📣 Post to my page
      </button>
    </div>
  )
}
