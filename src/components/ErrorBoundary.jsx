import { Component } from 'react'

/**
 * Catches errors thrown during rendering. Without this, any thrown error
 * kills the entire React tree and the user sees a blank white page —
 * on mobile, with no dev tools, that's a dead end. With this, we show a
 * readable error message plus a Reset and Reload option.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Crash:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
    if (this.props.onReset) this.props.onReset()
  }

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error?.message || String(this.state.error)
    const stack = this.state.error?.stack || ''

    return (
      <div style={styles.wrap} role="alert">
        <div style={styles.card}>
          <div style={styles.icon} aria-hidden="true">⚠️</div>
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.message}>{message}</p>
          <div style={styles.actions}>
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={this.handleReset}>
              Try Again
            </button>
            <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={this.handleReload}>
              Reload App
            </button>
          </div>
          {stack && (
            <details style={styles.details}>
              <summary style={styles.summary}>Technical details</summary>
              <pre style={styles.stack}>{stack}</pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}

const styles = {
  wrap: {
    position: 'fixed', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
    backgroundColor: 'var(--color-bg, #F2F2F7)',
    color: 'var(--color-label, #000)',
    zIndex: 9999, overflow: 'auto',
  },
  card: {
    maxWidth: '420px', width: '100%',
    backgroundColor: 'var(--color-surface, #fff)',
    borderRadius: '16px', padding: '24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '12px', textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.16)',
  },
  icon: { fontSize: '48px', lineHeight: 1 },
  title: { margin: 0, fontSize: '20px', fontWeight: 600 },
  message: {
    margin: 0, fontSize: '15px',
    color: 'var(--color-label-secondary, #555)',
    lineHeight: 1.4, wordBreak: 'break-word',
  },
  actions: {
    display: 'flex', flexDirection: 'column', gap: '8px',
    width: '100%', marginTop: '8px',
  },
  btn: {
    appearance: 'none', border: 0, borderRadius: '12px',
    padding: '12px 16px', fontSize: '17px', fontWeight: 600,
    cursor: 'pointer', minHeight: '44px',
  },
  btnPrimary: { backgroundColor: 'var(--color-accent, #0A84FF)', color: '#fff' },
  btnSecondary: {
    backgroundColor: 'rgba(120,120,128,0.16)',
    color: 'var(--color-label, #000)',
  },
  details: { width: '100%', marginTop: '8px', textAlign: 'left', fontSize: '13px' },
  summary: { cursor: 'pointer', color: 'var(--color-label-secondary, #555)', padding: '4px' },
  stack: {
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    backgroundColor: 'rgba(120,120,128,0.12)',
    padding: '8px', borderRadius: '8px',
    fontSize: '11px', maxHeight: '160px', overflow: 'auto', margin: 0,
  },
}
