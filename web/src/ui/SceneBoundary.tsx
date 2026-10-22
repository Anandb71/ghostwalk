import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Keeps the panels alive if the 3D view throws (no WebGL, lost context, a scene bug): every number
 * on screen comes from the worker, so the KPI card, slot map, race and anneal panels still work.
 */
export default class SceneBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3D scene crashed', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="absolute inset-0 grid place-items-center bg-ink">
        <div className="max-w-sm px-6 text-center">
          <div className="text-sm font-semibold text-white/80">The 3D view could not start</div>
          <p className="mt-1.5 break-words text-xs text-white/50">{error.message || 'WebGL error'}</p>
          <p className="mt-1.5 text-[11px] text-white/40">The simulator and every panel still work; the 2D slot map is in Slot mode.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-md border border-white/15 px-3 py-1 text-xs text-white/75 hover:bg-white/10"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
