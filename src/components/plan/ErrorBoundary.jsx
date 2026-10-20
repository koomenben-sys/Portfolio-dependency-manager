import React from 'react';

// Last line of defence: never a white screen. Offers reload and (demo mode) a data reset.
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI error', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-6">
        <div className="bg-surface border border-red-200 rounded-lg shadow-sm p-6 max-w-lg text-sm">
          <h1 className="font-semibold text-red-800 mb-2">Something went wrong in the interface</h1>
          <p className="text-ink-2 mb-3">The error has been logged to the browser console. Your data is not affected.</p>
          <pre className="text-xs bg-surface-2 border rounded p-2 overflow-auto max-h-32 mb-3">{String(this.state.error?.message || this.state.error)}</pre>
          <div className="flex gap-2">
            <button className="bg-accent text-white px-3 py-1.5 rounded" onClick={() => window.location.reload()}>Reload</button>
            <button className="border px-3 py-1.5 rounded" onClick={() => { try { localStorage.removeItem('kwartaalplan.mock.v1'); } catch { /* ignore */ } window.location.reload(); }}>Reset demo data and reload</button>
          </div>
        </div>
      </div>
    );
  }
}
