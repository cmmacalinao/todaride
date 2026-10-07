# Store links and Facebook link previews

Every approved merchant has a public address of its own:

```
https://todaridemobility.com/alingnena
```

The old link keeps working for good — `/vendor-page/<id>` is printed on
things, and a link that stops answering is worse than an ugly one.

## Where the pieces are

| Piece | File |
| --- | --- |
| Slug rules, reserved names, suggestions | `src/lib/vendorSlug.ts` |
| Vendor picks/edits their link | `src/components/VendorSlugEditor.tsx` |
| The public page | `src/pages/VendorGuestPage.tsx` |
| Link previews + the preview picture | `netlify/edge-functions/vendor-og.ts` |
| Reports and the hide switch | `src/components/AdminVendorPageReports.tsx` |

## The rules

- Lowercase letters, numbers and hyphens. 3–30 characters.
- No hyphen at either end, and no `--`.
- Unique across stores.
- Reserved names are refused — every top-level route the app answers on,
  plus words it will plausibly need later (`login`, `account`, `support`…).
  The full list is `RESERVED_SLUGS`.

Two things stop a store shadowing an app page, and both are deliberate: the
reserved list refuses the name at the source, and `/:slug` is matched **last**
in the router, so every real route wins even if a name somehow slipped past.

## Why a store gets no public page

`/alingnena` shows "we could not find that store" when the slug belongs to
nobody, and "this store page is not available" when:

- the store is not **approved** — a public page is the platform vouching for
  a business, and nobody has checked an unapproved one; or
- Admin has **hidden** the page after a report.

A hidden store keeps trading: orders, menu and portal are untouched. Only the
page and its preview stop answering, and the preview stops too — the card is
the page as far as a Messenger thread is concerned.

## Link previews

Facebook, Messenger, Viber and WhatsApp do not run the app. They read the raw
HTML, so without help a shared store link arrives as a blank card.

The edge function at `netlify/edge-functions/vendor-og.ts` runs in front of
the HTML and writes the tags:

- `og:title` — the store name
- `og:description` — tagline, or kind · items · rating · where
- `og:image` — `https://todaridemobility.com/og/<slug>.jpg`
- `og:url` — the canonical `https://todaridemobility.com/<slug>`

`og:url` deliberately uses the slug. If it disagreed with the link people
actually share, Facebook would cache two previews for one page.

### The picture

Vendor images live on the record as **data URLs**, which Facebook cannot
fetch. `/og/<slug>.jpg` decodes one and serves it as a real image, preferring:

1. the banner drawn on the vendor's own device (`bannerThumbDataUrl`, 960×504)
2. the cover photo
3. the logo
4. `/og-image.png` — the app's own card

A store with no photographs still gets a card. A broken image in a Messenger
thread reads as a broken link.

SVG is skipped (Facebook will not render it) and a PNG/JPEG is preferred over
a WebP even when the WebP is the better match, because Facebook's crawler
renders WebP inconsistently.

## Checking it with Facebook's Sharing Debugger

1. Open **https://developers.facebook.com/tools/debug/**
2. Paste the store link — `https://todaridemobility.com/alingnena` — and press
   **Debug**.
3. Read these rows:
   - **og:title** should be the store name, not "TODA Ride Mobility".
   - **og:image** should be `https://todaridemobility.com/og/<slug>.jpg`.
   - **Time Scraped** tells you whether you are looking at a cached answer.
4. Press **Scrape Again** after changing a banner, a tagline or the slug.
   Facebook caches a preview per exact URL and will otherwise keep showing
   the old card for days.
5. **Preview** at the bottom shows the card as it will appear in a feed.

Checking the picture alone: open `https://todaridemobility.com/og/<slug>.jpg`
in a browser. It should be an image, not JSON and not the app.

### If the card is wrong

| What you see | Usually means |
| --- | --- |
| Generic TODA Ride Mobility card | The slug belongs to nobody, or the store is unapproved/hidden |
| Old banner | Facebook's cache — press **Scrape Again** |
| No image at all | The store has no banner, cover or logo; `/og-image.png` should still be served, so check the function ran |
| `og:url` is `/vendor-page/<id>` | That store has no slug yet |

The share sheet appends `?v=<hash>` when the banner changes, which gives
Facebook a URL it has not cached and sidesteps the problem for customers who
would never open a debugger.

## What a vendor can customize

Cover photo and its position, logo, banner image, theme colour, tagline — and
now the link. Nothing else: no free-form layout, no custom HTML, CSS or
scripts. The page stays a template so that every store looks like it belongs
to the same app, and so that one store cannot run code on a page our name is
on.
