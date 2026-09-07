import { useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { captureNativePhoto, compressImageFile, isNativePlatform } from '../lib/photo'
import type { MedicineProduct, Pharmacy, VendorPost } from '../types'
import { ShareSheet } from './ShareSheet'
import { VendorBannerArt, resolveVendorAccent, type VendorAccent } from './VendorStorefront'

// Who is looking at the feed — the account a like, heart or comment is
// recorded under. Null for a visitor who is not logged in: they can read
// everything and share, but not react or comment.
export interface PostViewer {
  id: string
  name: string
}

// Like · Heart · Comment · Share under a post, the way a Facebook post has
// them, plus the comment thread. Shared by the store's own page and the
// Food Express newsfeed. Share opens the same sheet as the store's Share
// button, pointing at the store's public page.
function PostActions({ pharmacy, post, viewer }: { pharmacy: Pharmacy; post: VendorPost; viewer: PostViewer | null | undefined }) {
  const { reactToVendorPost, commentOnVendorPost } = useRides()
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const likes = post.likes ?? []
  const hearts = post.hearts ?? []
  const comments = post.comments ?? []
  const liked = !!viewer && likes.includes(viewer.id)
  const hearted = !!viewer && hearts.includes(viewer.id)
  const shareUrl = `${window.location.origin}/vendor-page/${pharmacy.id}`

  function react(reaction: 'like' | 'heart') {
    if (!viewer) return
    reactToVendorPost(pharmacy.id, post.id, reaction, viewer.id)
  }
  function sendComment() {
    const text = draft.trim()
    if (!text || !viewer) return
    commentOnVendorPost({ pharmacyId: pharmacy.id, postId: post.id, authorId: viewer.id, authorName: viewer.name, text })
    setDraft('')
    setCommentsOpen(true)
  }

  const actionClass = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold transition ${
      active ? 'text-brand-700' : 'text-slate-500 hover:bg-slate-100'
    } disabled:cursor-default disabled:hover:bg-transparent`

  return (
    <div className="border-t border-slate-100 px-2 pb-2 pt-1">
      {(likes.length > 0 || hearts.length > 0 || comments.length > 0) && (
        <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-slate-400">
          <span>
            {likes.length > 0 && `👍 ${likes.length}`}
            {likes.length > 0 && hearts.length > 0 && ' · '}
            {hearts.length > 0 && `❤️ ${hearts.length}`}
          </span>
          {comments.length > 0 && (
            <button type="button" onClick={() => setCommentsOpen((v) => !v)} className="hover:underline">
              {comments.length} comment{comments.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => react('like')}
          disabled={!viewer}
          title={viewer ? (liked ? 'Unlike' : 'Like') : 'Log in to like'}
          className={actionClass(liked)}
        >
          <span aria-hidden>{liked ? '👍' : '👍🏻'}</span> Like
        </button>
        <button
          type="button"
          onClick={() => react('heart')}
          disabled={!viewer}
          title={viewer ? (hearted ? 'Remove heart' : 'Heart') : 'Log in to react'}
          className={actionClass(hearted)}
        >
          <span aria-hidden>{hearted ? '❤️' : '🤍'}</span> Heart
        </button>
        <button type="button" onClick={() => setCommentsOpen((v) => !v)} className={actionClass(commentsOpen)}>
          <span aria-hidden>💬</span> Comment
        </button>
        <button type="button" onClick={() => setShareOpen(true)} className={actionClass(false)}>
          <span aria-hidden>↗</span> Share
        </button>
      </div>
      {commentsOpen && (
        <div className="mt-1.5 space-y-1.5 px-1">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl bg-slate-100 px-2.5 py-1.5">
              <p className="text-[11px] font-semibold text-slate-700">
                {c.authorName} <span className="font-normal text-slate-400">· {timeAgo(c.createdAt)}</span>
              </p>
              <p className="whitespace-pre-line text-xs text-slate-700">{c.text}</p>
            </div>
          ))}
          {viewer ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendComment()
              }}
              className="flex items-center gap-1.5"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a comment…"
                maxLength={500}
                className="min-w-0 flex-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
              >
                Send
              </button>
            </form>
          ) : (
            <p className="text-[11px] text-slate-400">Log in to comment.</p>
          )}
        </div>
      )}
      {shareOpen && (
        <ShareSheet
          title={`${pharmacy.name}: ${post.text.trim().slice(0, 80) || 'see this post'}`}
          url={shareUrl}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

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
  viewer,
  onAdd,
  onOpenMenu,
  onRemove,
}: {
  pharmacy: Pharmacy
  items: MedicineProduct[]
  accent: VendorAccent
  // Who is reading — see PostViewer. The vendor on their own portal
  // passes themselves, so the store can answer comments as itself.
  viewer?: PostViewer | null
  // A customer who can order: the featured dish gets an Add button.
  onAdd?: (productId: string) => void
  // A customer tapping the post itself — the photo, or the featured dish —
  // is taken to the menu to order (the dish, when there is one, goes into
  // the cart on the way). See VendorStorefront.
  onOpenMenu?: (productId: string | null) => void
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
            {post.photoDataUrl &&
              (onOpenMenu ? (
                <button
                  type="button"
                  onClick={() => onOpenMenu(featured?.id ?? null)}
                  title="Open the menu to order"
                  className="mt-2 block w-full"
                >
                  <img src={post.photoDataUrl} alt="" className="block h-auto w-full" loading="lazy" />
                </button>
              ) : (
                <img src={post.photoDataUrl} alt="" className="mt-2 block h-auto w-full" loading="lazy" />
              ))}
            {featured && (
              <div
                role={onOpenMenu ? 'button' : undefined}
                tabIndex={onOpenMenu ? 0 : undefined}
                onClick={onOpenMenu ? () => onOpenMenu(featured.id) : undefined}
                onKeyDown={onOpenMenu ? (e) => e.key === 'Enter' && onOpenMenu(featured.id) : undefined}
                title={onOpenMenu ? 'Open the menu to order' : undefined}
                className={`m-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 ${
                  onOpenMenu ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-100' : ''
                }`}
              >
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
                    onClick={(e) => {
                      e.stopPropagation()
                      onAdd(featured.id)
                    }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white ${accent.solid} ${accent.solidHover}`}
                  >
                    + Add
                  </button>
                )}
              </div>
            )}
            {!featured && !post.photoDataUrl && <div className="pb-2" />}
            <PostActions pharmacy={pharmacy} post={post} viewer={viewer} />
          </article>
        )
      })}
    </div>
  )
}

// The Food Express page as a newsfeed — banners only. One banner per store
// that has posted, newest post first: the store's gradient, logo and name,
// with when it last posted and the first line of that post. Everything
// else — the post itself, its photo, the featured dish, likes and comments
// — lives on the store's own page, which is where a tap on the banner
// goes. Stores that have never posted do not appear here; the search box
// above is how a customer finds those.
export function VendorNewsfeed({
  vendors,
  onOpenVendor,
  limit = 20,
}: {
  vendors: Pharmacy[]
  onOpenVendor: (vendorId: string) => void
  limit?: number
}) {
  const entries = vendors
    .map((vendor) => {
      const latest = [...(vendor.posts ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0]
      return latest ? { vendor, post: latest, count: vendor.posts?.length ?? 0 } : null
    })
    .filter((e): e is { vendor: Pharmacy; post: VendorPost; count: number } => !!e)
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())
    .slice(0, limit)
  if (entries.length === 0) return null
  return (
    <div className="space-y-2">
      {entries.map(({ vendor, post, count }) => {
        const accent = resolveVendorAccent(vendor)
        const snippet = post.text.trim().split('\n')[0] || (post.photoDataUrl ? 'Posted a photo' : 'New post')
        return (
          <button
            key={vendor.id}
            type="button"
            onClick={() => onOpenVendor(vendor.id)}
            title={`Open ${vendor.name}`}
            className={`relative flex w-full items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-br ${accent.gradient} px-3 py-3 text-left text-white shadow-sm transition hover:brightness-105`}
          >
            <VendorBannerArt />
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-white/20 text-lg">
              {vendor.logoDataUrl ? (
                <img src={vendor.logoDataUrl} alt="" className="h-full w-full bg-white object-cover" />
              ) : (
                <span aria-hidden>{accent.icon}</span>
              )}
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate text-base font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{vendor.name}</span>
              <span className="block truncate text-xs text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {timeAgo(post.createdAt)} · {snippet}
              </span>
            </span>
            {count > 1 && (
              <span className="relative shrink-0 rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-semibold">
                {count} posts
              </span>
            )}
            <span aria-hidden className="relative shrink-0 text-white/80">
              ›
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Where the vendor writes a post: a line or two, an optional photo, and
// optionally the dish it is about.
// The "what's on your mind" box, the way a Facebook page has one: the
// store's logo, a "Post on your Feed" line to write in, and under it a row
// of Photo / Feature a dish / Post. A tapped photo is shrunk before it is
// kept (see compressImageFile — 480px wide, WebP) so a 4 MB camera shot
// does not land in the shared state as 4 MB.
function PhotoGalleryIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <rect x="2.5" y="6" width="14" height="15" rx="2.5" transform="rotate(-8 9.5 13.5)" fill="#34a853" opacity="0.55" />
      <rect x="6" y="4" width="15" height="16" rx="2.5" fill="#45bd62" />
      <circle cx="11" cy="9" r="1.8" fill="white" />
      <path d="M8 17.5 L12.2 12.6 L14.6 15.3 L16.4 13.4 L19 17.5 Z" fill="white" />
    </svg>
  )
}

export function VendorFeedComposer({ pharmacy, items }: { pharmacy: Pharmacy; items: MedicineProduct[] }) {
  const { addVendorPost } = useRides()
  const accent = resolveVendorAccent(pharmacy)
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [productId, setProductId] = useState('')
  const [pickingDish, setPickingDish] = useState(false)
  const canPost = text.trim().length > 0 || !!photo
  const featured = productId ? items.find((i) => i.id === productId) : null

  // Web: click the input synchronously — awaiting anything first makes some
  // mobile browsers refuse to open the picker. Native: camera-or-library.
  function handlePhotoTap() {
    if (!isNativePlatform()) {
      inputRef.current?.click()
      return
    }
    setPhotoBusy(true)
    void (async () => {
      try {
        const native = await captureNativePhoto({ source: 'prompt' })
        if (native) {
          setPhoto(native)
          return
        }
        inputRef.current?.click()
      } finally {
        setPhotoBusy(false)
      }
    })()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    try {
      setPhoto(await compressImageFile(file))
    } finally {
      setPhotoBusy(false)
    }
  }

  function handlePost() {
    if (!canPost) return
    addVendorPost({ pharmacyId: pharmacy.id, text, photoDataUrl: photo, productId: productId || null })
    setText('')
    setPhoto(null)
    setProductId('')
    setPickingDish(false)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${accent.gradient} text-base`}
        >
          {pharmacy.logoDataUrl ? (
            <img src={pharmacy.logoDataUrl} alt="" className="h-full w-full bg-white object-cover" />
          ) : (
            <span aria-hidden>{accent.icon}</span>
          )}
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={text || photo ? 3 : 2}
          placeholder="Post on your Feed — a promo, today's special, a new dish…"
          className="min-h-[2.5rem] w-full resize-none rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      </div>

      {photo && (
        <div className="relative mt-2 overflow-hidden rounded-lg border border-slate-200">
          <img src={photo} alt="Post photo" className="block h-auto w-full" />
          <button
            type="button"
            onClick={() => setPhoto(null)}
            aria-label="Remove photo"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white hover:bg-black/75"
          >
            ✕
          </button>
        </div>
      )}
      {featured && (
        <p className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          <span>
            🍽️ Featuring <span className="font-semibold">{featured.name}</span> · ₱{featured.price}
          </span>
          <button type="button" onClick={() => setProductId('')} className="font-semibold hover:underline">
            Remove
          </button>
        </p>
      )}
      {pickingDish && !featured && (
        <select
          autoFocus
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value)
            setPickingDish(false)
          }}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Which dish to feature?</option>
          {items
            .filter((i) => i.visible !== false)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · ₱{i.price}
              </option>
            ))}
        </select>
      )}

      <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
        {/* The photo control is the green gallery icon alone, the way a
            Facebook composer has it — no label; the title and aria-label
            carry the words. */}
        <button
          type="button"
          onClick={handlePhotoTap}
          disabled={photoBusy}
          aria-label={photo ? 'Change photo' : 'Add photo'}
          title={photoBusy ? 'Shrinking the photo…' : photo ? 'Change photo' : 'Add photo'}
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-60 ${photoBusy ? 'animate-pulse' : ''}`}
        >
          <PhotoGalleryIcon />
        </button>
        <button
          type="button"
          onClick={() => setPickingDish((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden className="text-base leading-none">
            🍽️
          </span>
          Feature a dish
        </button>
        <button
          type="button"
          onClick={handlePost}
          disabled={!canPost}
          className="ml-auto rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Post
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400">Photos are shrunk automatically before posting to keep the app light.</p>
    </div>
  )
}
