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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
})
