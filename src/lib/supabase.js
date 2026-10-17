import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Wrap fetch with an 8-second timeout so a hanging request (network blip,
// brief server unavailability, etc.) fails fast instead of blocking forever.
function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 8000)

  // Respect any existing abort signal passed by the Supabase client
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort()
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id))
}

// Created lazily: demo mode (VITE_DATA_SOURCE unset / mock) never touches Supabase and must run
// without any env (acceptance criterion A1). Accessing the client without env gives a clear error.
let client = null
function getClient() {
  if (client) return client
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or run with VITE_DATA_SOURCE=mock')
  }
  client = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchWithTimeout } })
  return client
}
export const supabase = new Proxy({}, {
  get(_t, prop) {
    const c = getClient()
    const v = c[prop]
    return typeof v === 'function' ? v.bind(c) : v
  },
})
