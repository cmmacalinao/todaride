import { useState } from 'react'
import { DocumentUploadField } from './DocumentUploadField'
import type { PaymentAccountDetails } from '../types'

type Wallet = 'gcash' | 'maya'

const WALLET_LABEL: Record<Wallet, string> = { gcash: 'GCash', maya: 'Maya' }

interface DriverWalletPanelProps {
  driverName: string
  gcashAccount: PaymentAccountDetails | null
  mayaAccount: PaymentAccountDetails | null
  onSave: (wallet: Wallet, details: PaymentAccountDetails | null) => void
}

// The driver's own e-wallet details, and the QR they hold up when the
// passenger's app cannot hand off to GCash for them. Both halves matter: the
// number is what the passenger types, the QR is what they scan — and at a
// kerb at night, scanning is the one that works.
export function DriverWalletPanel({ driverName, gcashAccount, mayaAccount, onSave }: DriverWalletPanelProps) {
  const [showQrFor, setShowQrFor] = useState<Wallet | null>(null)
  const accounts: Record<Wallet, PaymentAccountDetails | null> = { gcash: gcashAccount, maya: mayaAccount }
  const shown = showQrFor ? accounts[showQrFor] : null

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">My e-wallets</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">
        What a passenger paying by GCash or Maya sends to. Add your QR and you can just show it — tap the QR
        button when their app does not open yours by itself.
      </p>

      <div className="mt-2 space-y-2">
        {(['gcash', 'maya'] as Wallet[]).map((wallet) => (
          <WalletRow
            key={wallet}
            wallet={wallet}
            details={accounts[wallet]}
            onSave={(details) => onSave(wallet, details)}
            onShowQr={() => setShowQrFor(wallet)}
          />
        ))}
      </div>

      {showQrFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${WALLET_LABEL[showQrFor]} QR code`}
          onClick={() => setShowQrFor(null)}
        >
          {/* Deliberately big and on a white card: this gets held up at arm's
              length across a tricycle in the dark, and a phone camera needs
              contrast and size more than it needs styling. */}
          <div className="w-full max-w-xs rounded-xl bg-white p-4 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-slate-800">
              {WALLET_LABEL[showQrFor]} — {shown?.accountName ?? driverName}
            </p>
            <p className="text-xs text-slate-500">{shown?.accountNumber ?? 'No number saved'}</p>
            {shown?.qrDataUrl ? (
              <img
                src={shown.qrDataUrl}
                alt={`${WALLET_LABEL[showQrFor]} QR code`}
                className="mx-auto mt-3 aspect-square w-full max-w-[240px] rounded-lg border border-slate-200 object-contain"
              />
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-8 text-xs text-slate-400">
                No QR saved yet. Add one above and it shows here — until then the passenger has to type your
                number.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowQrFor(null)}
              className="mt-3 w-full rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function WalletRow({
  wallet,
  details,
  onSave,
  onShowQr,
}: {
  wallet: Wallet
  details: PaymentAccountDetails | null
  onSave: (details: PaymentAccountDetails | null) => void
  onShowQr: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [accountName, setAccountName] = useState(details?.accountName ?? '')
  const [accountNumber, setAccountNumber] = useState(details?.accountNumber ?? '')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(details?.qrDataUrl ?? null)
  const label = WALLET_LABEL[wallet]

  if (!editing && details) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
        {details.qrDataUrl ? (
          <img src={details.qrDataUrl} alt={`${label} QR`} className="h-10 w-10 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-lg text-slate-300">
            📱
          </div>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-700">
            {label} · {details.accountName}
          </span>
          <span className="block text-[11px] text-slate-400">{details.accountNumber}</span>
        </span>
        <button
          type="button"
          onClick={onShowQr}
          title={`Show my ${label} QR to the passenger`}
          className="shrink-0 rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
        >
          ⬛ QR
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 p-2">
      <p className="text-xs font-medium text-slate-500">{label} account</p>
      <input
        value={accountName}
        onChange={(e) => setAccountName(e.target.value)}
        placeholder="Account name"
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      />
      <input
        value={accountNumber}
        onChange={(e) => setAccountNumber(e.target.value)}
        placeholder="09XXXXXXXXX"
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      />
      <DocumentUploadField label={`${label} QR code (optional)`} dataUrl={qrDataUrl} onUpload={setQrDataUrl} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!accountName.trim() || !accountNumber.trim()}
          onClick={() => {
            onSave({ accountName: accountName.trim(), accountNumber: accountNumber.trim(), qrDataUrl })
            setEditing(false)
          }}
          className="flex-1 rounded-lg border border-brand-300 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        {details && (
          <button
            type="button"
            onClick={() => {
              onSave(null)
              setAccountName('')
              setAccountNumber('')
              setQrDataUrl(null)
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
