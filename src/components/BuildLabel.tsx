// Which build is this phone actually running.
//
// The app reaches testers three ways — the website, a phone that cached the
// website weeks ago, and a sideloaded APK that never updates itself — and
// nothing on screen distinguished them. So "the change isn't showing" could
// mean a stale service worker, an install that silently kept the old app, or
// a deploy that genuinely missed, and telling those apart took a laptop and a
// developer. Now it takes reading the end of one line.
//
// Two parts, both earning their place: the version matches what the phone's
// own Settings > Apps screen shows for the installed app, and the commit is
// what distinguishes two builds sharing one version name — which is every web
// deploy made without rebuilding the APK. A phone showing one commit while
// the website shows another is a phone running behind, visibly.
//
// Rendered inline, on the line that already says this is a prototype: that
// line is where somebody looks to find out what they are holding, and a
// build number belongs with it rather than floating in a corner of its own.
export function BuildLabel() {
  return <span className="font-mono">{__BUILD_LABEL__}</span>
}
