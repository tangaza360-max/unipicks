import { Component } from 'react'
import { reportCrash } from '../lib/monitoring.js'

// Last safety net: if a page throws while rendering, show a calm message with
// a way back instead of a blank white screen. The error is logged to the
// console and reported to Sentry when monitoring is on (see lib/monitoring.js).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('[app] page crashed:', error)
    reportCrash(error)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div role="alert" className="max-w-sm text-center space-y-4">
          <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            Sorry, this page stopped working. Please reload the page. If it keeps happening, go back to the home page.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full bg-primary text-primary-foreground font-semibold rounded-lg py-3 text-sm transition"
            >
              Reload
            </button>
            <a
              href="/dashboard"
              className="w-full border border-border text-muted-foreground hover:text-foreground rounded-lg py-3 text-sm transition"
            >
              Go to home page
            </a>
          </div>
        </div>
      </div>
    )
  }
}
