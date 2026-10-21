import React, { useState } from 'react';
import LogoMark from '../components/plan/LogoMark';
import { supabase } from '../lib/supabase';

export function LoginView() {
  const [mode, setMode]       = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      // On success, onAuthStateChange in AuthContext fires and App re-renders automatically
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setMessage(
          'Account created! Check your email for a confirmation link, then sign in. ' +
          'After logging in, contact your administrator to have your role upgraded.'
        );
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-surface-2 flex flex-col">
      {/* Header */}
      <div className="bg-accent-700 text-white p-4">
        <h1 className="text-2xl font-bold flex items-center gap-3"><LogoMark size={32} />Kwartaalplan</h1>
      </div>

      {/* Card */}
      <div className="flex flex-1 items-center justify-center">
        <div className="bg-surface rounded-lg shadow p-8 w-full max-w-sm">
          <h2 className="text-xl font-bold mb-6 text-center">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">
                {error}
              </p>
            )}

            {message && (
              <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-2">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white py-2 rounded hover:bg-accent-600 disabled:opacity-50"
            >
              {loading
                ? 'Please wait…'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-muted">
            {mode === 'signin' ? (
              <>
                No account?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
                  className="text-accent hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('signin'); setError(''); setMessage(''); }}
                  className="text-accent hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
