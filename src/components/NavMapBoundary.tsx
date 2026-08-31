import { Component, type ErrorInfo, type ReactNode } from 'react'

// A wall around the navigation map.
//
// It is the newest and least proven thing on the trip screen: a second map
// engine, WebGL, vector tiles from a free host, and a camera that moves on
// every GPS reading. Any of that can throw on a handset nobody has tested on.
//
// Without this, it throws into the app's top-level error boundary and the
// passenger loses the entire screen — the driver's name, the plate number,
// the SOS button — because a map would not draw. That trade is never worth
// making. Here, the failure costs exactly the heading-up view: onFailed tells
// RealLiveMap to fall back, and the ordinary north-up map takes its place.
export class NavMapBoundary extends Component<
  { children: ReactNode; onFailed: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Nav map failed, falling back to the north-up map', error, info.componentStack)
    this.props.onFailed()
  }

  render() {
    // Renders nothing on failure: onFailed has already told the parent to
    // swap in the other map, so anything drawn here would only flash.
    return this.state.failed ? null : this.props.children
  }
}
