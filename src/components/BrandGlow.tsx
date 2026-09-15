// The green light on the blue backdrop: a soft glow in the top-left and
// bottom-right corners, each with a couple of thin curved trails running
// through it — the brand green (the logo's road) catching the blue.
//
// Pure CSS, so it costs no image: two radial glows, and circles hung just
// outside each corner whose thin borders are clipped by the parent's
// overflow-hidden into arcs. Sized in pixels, not percentages: a percentage
// of a tall page put the arcs through the middle of the screen, and the
// corners are the one place they belong at any height.
//
// Drop it inside a `relative overflow-hidden` container, after the stripe
// texture and before the content; it is aria-hidden and takes no taps.
export function BrandGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Top-left */}
      <div
        className="absolute -left-[120px] -top-[140px] h-[380px] w-[380px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(52,211,153,0.42), rgba(52,211,153,0) 72%)' }}
      />
      <div
        className="absolute -left-[250px] -top-[260px] h-[460px] w-[460px] rounded-full"
        style={{ border: '3px solid rgba(110,231,183,0.7)', filter: 'blur(3px)' }}
      />
      <div
        className="absolute -left-[210px] -top-[230px] h-[400px] w-[400px] rounded-full"
        style={{ border: '1.5px solid rgba(167,243,208,0.5)', filter: 'blur(1px)' }}
      />
      {/* Bottom-right */}
      <div
        className="absolute -bottom-[150px] -right-[130px] h-[420px] w-[420px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(74,222,128,0.45), rgba(74,222,128,0) 72%)' }}
      />
      <div
        className="absolute -bottom-[270px] -right-[260px] h-[480px] w-[480px] rounded-full"
        style={{ border: '3px solid rgba(110,231,183,0.7)', filter: 'blur(3px)' }}
      />
      <div
        className="absolute -bottom-[240px] -right-[220px] h-[420px] w-[420px] rounded-full"
        style={{ border: '1.5px solid rgba(167,243,208,0.5)', filter: 'blur(1px)' }}
      />
    </div>
  )
}
