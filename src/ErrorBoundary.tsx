import { Component } from 'react'
import type { ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('ArcSite crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#141718',
            color: '#f3f2ee',
            fontFamily: 'monospace',
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 640 }}>
            <h1 style={{ fontSize: 18, marginBottom: 12 }}>⚠ Something crashed</h1>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                color: '#ee8080',
                background: '#24272a',
                border: '1px solid #35342f',
                borderRadius: 8,
                padding: 14,
                fontSize: 12.5,
              }}
            >
              {this.state.error.message}
            </pre>
            <p style={{ color: '#b5afa2' }}>Full details are in the browser console (F12).</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
