export function AlertBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
      <span className="text-base leading-none">⚠</span>
      <span>{message}</span>
    </div>
  )
}
