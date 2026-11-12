import { useEffect, useId, useRef, useState } from 'react'
import { MIN_QUERY, merchantHint, searchMerchants, type SearchableMerchant } from '../lib/merchantSearch'

// THE MERCHANT SEARCH BOX.
//
// One named control, so it can be asked for by name: a text field that
// suggests registered merchants as you type and hands back the one you
// picked. It replaced a tab row plus a dropdown of every business in the
// pilot on the partner login (see AuthGate.tsx) — a merchant should not
// have to know which category the app filed them under, and a visitor
// should not be handed the full roster for opening the page.
//
// Nothing is suggested until MIN_QUERY characters are typed. That is the
// whole privacy of it: an owner who knows their own name finds it in three
// letters, and somebody fishing gets an empty box.
export function MerchantSearchField<T extends SearchableMerchant>({
  merchants,
  selectedId,
  onSelect,
  label = 'Merchant',
  placeholder = 'Type your store name',
  emptyHint,
  renderTag,
}: {
  merchants: T[]
  selectedId: string
  onSelect: (merchant: T | null) => void
  label?: string
  placeholder?: string
  // Shown when a search finds nothing — the caller owns the words because
  // only it knows what the next step is (sign up, try the other portal).
  emptyHint?: (query: string) => React.ReactNode
  // An optional badge beside a name, e.g. "demo" for seeded accounts.
  renderTag?: (merchant: T) => React.ReactNode
}) {
  const selected = merchants.find((m) => m.id === selectedId) ?? null
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  // A selection made elsewhere (or cleared) must show here.
  useEffect(() => {
    if (selected) setQuery(selected.name)
  }, [selected])

  // Tapping away closes the list without choosing anything. Without this the
  // suggestions sat over the PIN field and ate the first tap at it.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const suggestions = open ? searchMerchants(merchants, query) : []
  const searching = query.trim().length >= MIN_QUERY

  function choose(merchant: T) {
    setQuery(merchant.name)
    setOpen(false)
    onSelect(merchant)
  }

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={listId} className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </label>
      <input
        id={listId}
        type="text"
        role="combobox"
        aria-expanded={open && searching}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(0)
          // Typing after choosing means the choice is being changed; drop it
          // so a half-typed name can never log in as the last selection.
          if (selected && e.target.value !== selected.name) onSelect(null)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(i + 1, suggestions.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && open && suggestions[active]) {
            e.preventDefault()
            choose(suggestions[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {/* The confirmation that something is actually selected. Without it a
          typed name that matched nothing looks exactly like a chosen one. */}
      {selected && !open && (
        <p className="mt-1 text-[11px] text-emerald-700">
          ✓ {selected.name}
          {merchantHint(selected) ? ` · ${merchantHint(selected)}` : ''}
        </p>
      )}

      {open && searching && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((merchant, i) => (
            <li key={merchant.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onClick={() => choose(merchant)}
                onPointerEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  i === active ? 'bg-brand-50' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-700">{merchant.name}</span>
                  {merchantHint(merchant) && (
                    <span className="block truncate text-[11px] text-slate-400">{merchantHint(merchant)}</span>
                  )}
                </span>
                {renderTag?.(merchant)}
              </button>
            </li>
          ))}
          {suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">{emptyHint?.(query) ?? 'No store found by that name.'}</li>
          )}
        </ul>
      )}

      {open && !searching && (
        <p className="mt-1 text-[11px] text-slate-400">Type at least {MIN_QUERY} letters of your store name.</p>
      )}
    </div>
  )
}
