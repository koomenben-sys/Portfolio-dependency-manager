// Volgen (docs/design.md section 23, D67/D68): following is personal and is only a filter.
// Supabase: load() returns `state.follows` as the current user's epic ids (RLS: own rows only).
// Mock: `state.follows` is { [actorId]: epicId[] } so the demo personas keep their own lists.
export function followsOf(state, actorId) {
  const f = state?.follows;
  if (Array.isArray(f)) return new Set(f);
  return new Set((f && actorId && f[actorId]) || []);
}
// "Alleen gevolgd" toggle, remembered per user in this browser (M8); storage may be unavailable.
const key = (actorId) => `kp.followOnly.${actorId}`;
export function readFollowOnly(actorId) { try { return localStorage.getItem(key(actorId)) === '1'; } catch { return false; } }
export function writeFollowOnly(actorId, on) { try { localStorage.setItem(key(actorId), on ? '1' : '0'); } catch { /* per-browser convenience only */ } }
