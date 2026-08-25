// Shown next to any shareable link/QR when the address it's built from
// isn't publicly reachable — see isShareableOrigin in RideContext for what
// counts. Without this the QR looks perfectly fine while silently encoding
// something only the current device can open (a dev server's localhost, or
// a Capacitor webview's https://localhost / capacitor://localhost).
//
// `canFix` separates the two audiences: only the App Admin can set the
// public address, so a TODA/Operator/Franchise admin is told who to ask
// rather than pointed at a setting they can't reach.
export function ShareLinkNotice({ origin, canFix = false }: { origin: string; canFix?: boolean }) {
  return (
    <p className="mt-2 rounded-lg bg-amber-100 p-2 text-[11px] text-amber-900">
      ⚠️ <span className="font-semibold">This link won't open for anyone else yet.</span> It points at{' '}
      <span className="font-mono">{origin || '(unknown)'}</span>, which only works on this device.{' '}
      {canFix
        ? 'Set the real public address under Super Admin → Access links before sharing or printing it.'
        : 'Ask the App Admin to set the public app address, then share it.'}
    </p>
  )
}
