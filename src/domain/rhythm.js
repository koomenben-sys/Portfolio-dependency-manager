// Release B — Capaciteit & ritme (docs/design.md section 22, D50-D56). Pure functions shared by both
// adapters and every screen: T-shirt sizes, certainty, derived bottlenecks, the "gewijzigd" diff against the
// baseline, commitment signals with the sprint cadence, and predictability for Afsluiten.
import { byId, quarterOrdinal, quarterStart } from './plan';
import { teamLoad } from './capacity';

const DAY = 86400000;
const normAsk = (r) => (r === 'partial' ? 'accepted' : r === 'deferred' ? 'needs_priority_call' : r);

// ── Job size (D50) ───────────────────────────────────────────────────────────
export const SIZES = ['S', 'M', 'L', 'XL'];
export const DEFAULT_SIZE_MAP = { S: [1, 2], M: [2, 4], L: [4, 8], XL: [8, 13] };
export const sizeMapOf = (settings) => ({ ...DEFAULT_SIZE_MAP, ...(settings?.sizeMap || {}) });
// [low, high] in person-weeks for a size, from the organisation's mapping.
export function sizeRange(settings, size) {
  const r = sizeMapOf(settings)[size];
  return r ? [Number(r[0]) || 0, Number(r[1]) || 0] : null;
}
// Shared validation for the size field on plans and asks (same texts in both adapters). Returns the
// effort patch to apply: numbers from the mapping, or {} when the size is cleared (numbers are kept).
export function sizePatch(settings, size, Err = Error) {
  if (size == null || size === '') return { size: null };
  if (!SIZES.includes(size)) throw new Err('Unknown size');
  const [low, high] = sizeRange(settings, size);
  if (high < low) throw new Err('High estimate must be at least the low estimate');
  return { size, effortLow: low, effortHigh: high };
}
export function checkSizeMap(map, Err = Error) {
  for (const s of SIZES) {
    const r = map?.[s];
    if (!Array.isArray(r) || r.length !== 2 || r.some((n) => !(Number(n) >= 0))) throw new Err('Each size needs a low and high estimate');
    if (Number(r[1]) < Number(r[0])) throw new Err('High estimate must be at least the low estimate');
  }
  return Object.fromEntries(SIZES.map((s) => [s, [Number(map[s][0]), Number(map[s][1])]]));
}
// "6–8 pw" for records without a size, "L · 4–8 pw" with one.
export const fmtEffort = (low, high) => (low === high ? `${low}` : `${low}–${high}`);

// ── Certainty (D52): on the ask, set by the requester ────────────────────────
export const CERTAINTIES = ['low', 'medium', 'high'];
export const CERTAINTY_META = { low: { label: 'Low' }, medium: { label: 'Middle' }, high: { label: 'High' } };
export function checkCertainty(c, Err = Error) {
  if (!CERTAINTIES.includes(c)) throw new Err('Unknown certainty');
  return c;
}

// ── Bottlenecks (D53): derived, never stored; one chip, first match wins ─────
export const BOTTLENECK_META = {
  over_capacity: { label: 'Over capacity', tone: 'danger' },
  big_job: { label: 'Big job', tone: 'warn' },
  low_certainty: { label: 'Low certainty', tone: 'neutral' },
};
export const BIG_JOB_PW = 8;
// `loads` is an optional Map cache keyed by `${teamId}|${quarterId}` so Afstemmen computes each team once.
export function bottleneckFor(state, dep, loads = null) {
  const st = normAsk(dep.response);
  if (st !== 'accepted' && st !== 'proposed') return null;
  const key = `${dep.providerTeamId}|${dep.quarterId}`;
  let load = loads?.get(key);
  if (!load) { load = teamLoad(state, dep.providerTeamId, dep.quarterId); loads?.set(key, load); }
  if (load.band === 'over') return 'over_capacity';
  if (dep.size === 'L' || dep.size === 'XL' || (!dep.size && (Number(dep.effortHigh) || 0) >= BIG_JOB_PW)) return 'big_job';
  if (dep.certainty === 'low') return 'low_certainty';
  return null;
}

// ── "gewijzigd" since Plan vastzetten (D54) ──────────────────────────────────
// Map planId -> { changes: [{ kind, from, to }], reason }. Compares rank, commitment, size / effort and the
// epic's asks (answers, added, removed) with quarter.baseline; the reason is the last plan_events reason on the
// plan or one of its asks after lockedAt. Empty map without a baseline.
export function changedSinceBaseline(state, quarterId) {
  const out = new Map();
  const q = state.quarters.find((x) => x.id === quarterId);
  const base = q?.baseline;
  if (!base) return out;
  const since = q.lockedAt || base.takenAt || '';
  const baseDeps = base.dependencies || [];
  for (const p of state.plans.filter((x) => x.quarterId === quarterId)) {
    const b = base.plans.find((x) => x.epicId === p.epicId);
    const changes = [];
    if (!b) changes.push({ kind: 'added' });
    else {
      if ((b.rank ?? null) !== (p.rank ?? null)) changes.push({ kind: 'rank', from: b.rank, to: p.rank });
      if (b.commitment !== p.commitment) changes.push({ kind: 'commitment', from: b.commitment, to: p.commitment });
      if ((b.size ?? null) !== (p.size ?? null) || b.effortLow !== p.effortLow || b.effortHigh !== p.effortHigh) {
        changes.push({ kind: 'size', from: b.size || fmtEffort(b.effortLow, b.effortHigh), to: p.size || fmtEffort(p.effortLow, p.effortHigh) });
      }
    }
    const deps = state.dependencies.filter((d) => d.quarterId === quarterId && d.epicId === p.epicId);
    const bDeps = baseDeps.filter((d) => d.epicId === p.epicId);
    for (const d of deps) {
      const bd = bDeps.find((x) => x.id === d.id);
      if (!bd) changes.push({ kind: 'ask_added', to: d.refCode });
      else if (normAsk(bd.response) !== normAsk(d.response)) changes.push({ kind: 'ask', ref: d.refCode, from: normAsk(bd.response), to: normAsk(d.response), teamId: d.providerTeamId });
    }
    for (const bd of bDeps) if (!deps.some((d) => d.id === bd.id)) changes.push({ kind: 'ask_removed' });
    if (!changes.length) continue;
    const ids = new Set([p.id, ...deps.map((d) => d.id)]);
    const ev = state.events.filter((e) => ids.has(e.entityId) && e.at > since && e.reason).sort((a, b) => b.at.localeCompare(a.at))[0];
    out.set(p.id, { changes, reason: ev?.reason || '' });
  }
  return out;
}

// ── Commitment signals (D55) ─────────────────────────────────────────────────
export const SIGNALS = ['on_track', 'at_risk', 'wont_make'];
export const SIGNAL_META = {
  on_track: { label: 'On track', tone: 'ok', order: 0 },
  at_risk: { label: 'At risk', tone: 'warn', order: 1 },
  wont_make: { label: "Won't make it", tone: 'danger', order: 2 },
};
export const signalOf = (dep) => (SIGNALS.includes(dep?.signal) ? dep.signal : 'on_track');
export const hasSignal = (dep) => normAsk(dep.response) === 'accepted' && signalOf(dep) !== 'on_track';
// Worst signal among the committed asks, or null when everything is on track.
export function worstSignal(deps) {
  let worst = null;
  for (const d of deps) {
    if (!hasSignal(d)) continue;
    if (!worst || SIGNAL_META[signalOf(d)].order > SIGNAL_META[signalOf(worst)].order) worst = d;
  }
  return worst;
}
export const inExecution = (phase) => phase === 'locked' || phase === 'active';

// Cadence (L9): { mode: 'exception' | 'sprint', weeks: 1..4 }.
export const DEFAULT_CADENCE = { mode: 'exception', weeks: 2 };
export const cadenceOf = (settings) => ({ ...DEFAULT_CADENCE, ...(settings?.cadence || {}) });
export function checkCadence(c, Err = Error) {
  const next = { ...DEFAULT_CADENCE, ...c };
  if (!['exception', 'sprint'].includes(next.mode)) throw new Err('Unknown steering mode');
  next.weeks = Number(next.weeks);
  if (!(next.weeks >= 1 && next.weeks <= 4 && Number.isInteger(next.weeks))) throw new Err('Sprint length is 1 to 4 weeks');
  return next;
}
// Start of the current sprint, counted in N-week steps from the quarter start; null before the quarter starts.
export function currentSprintStart(quarter, settings, now = Date.now()) {
  const c = cadenceOf(settings);
  const start = quarterStart(quarter, settings?.fiscalYearStartMonth || 1).getTime();
  if (now < start) return null;
  const len = c.weeks * 7 * DAY;
  return start + Math.floor((now - start) / len) * len;
}
// Sprint mode, Uitvoeren, committed ask whose signal / confirmation predates the current sprint (L9).
export function needsConfirmation(dep, quarter, settings, now = Date.now()) {
  if (cadenceOf(settings).mode !== 'sprint' || !quarter || !inExecution(quarter.phase)) return false;
  if (normAsk(dep.response) !== 'accepted') return false;
  const sprint = currentSprintStart(quarter, settings, now);
  if (sprint == null) return false;
  const last = Math.max(dep.signalAt ? new Date(dep.signalAt).getTime() : 0, dep.confirmedAt ? new Date(dep.confirmedAt).getTime() : 0);
  return last < sprint;
}

// ── Afsluiten (D56) ──────────────────────────────────────────────────────────
// "Toegezegd" = epics whose plan was in the baseline with every ask accepted (or none); without a baseline the
// current committed set. Rows per team: { team, rows: [{ epic, plan, delivered, carried }], committed, delivered, pct }.
export function closeRows(state, quarterId) {
  const q = state.quarters.find((x) => x.id === quarterId);
  if (!q) return [];
  const epics = byId(state.epics);
  const plans = state.plans.filter((p) => p.quarterId === quarterId);
  const base = q.baseline;
  const committedEpicIds = new Set();
  if (base) {
    for (const b of base.plans) {
      if (b.commitment === 'not_committed') continue;
      const asks = (base.dependencies || []).filter((d) => d.epicId === b.epicId);
      if (asks.every((d) => normAsk(d.response) === 'accepted')) committedEpicIds.add(b.epicId);
    }
  } else {
    for (const p of plans) {
      if (p.commitment === 'not_committed') continue;
      const asks = state.dependencies.filter((d) => d.quarterId === quarterId && d.epicId === p.epicId);
      if (asks.every((d) => normAsk(d.response) === 'accepted')) committedEpicIds.add(p.epicId);
    }
  }
  const next = nextQuarter(state, quarterId);
  return state.teams.map((team) => {
    const rows = [...committedEpicIds].map((id) => epics.get(id)).filter((e) => e && e.teamId === team.id).map((epic) => {
      const plan = plans.find((p) => p.epicId === epic.id) || null;
      const baseRank = base?.plans.find((b) => b.epicId === epic.id)?.rank ?? plan?.rank ?? null;
      return { epic, plan, rank: plan?.rank ?? baseRank, delivered: !!plan?.delivered, carried: !!(next && state.plans.some((p) => p.epicId === epic.id && p.quarterId === next.id)) };
    }).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    return { team, rows, ...predictability(rows) };
  });
}
export function predictability(rows) {
  const committed = rows.length; const delivered = rows.filter((r) => r.delivered).length;
  return { committed, delivered, pct: committed ? Math.round((delivered / committed) * 100) : null };
}
// The quarter after `quarterId` in the state (null when it does not exist yet).
export function nextQuarter(state, quarterId) {
  const q = state.quarters.find((x) => x.id === quarterId);
  if (!q) return null;
  return state.quarters.filter((x) => quarterOrdinal(x) > quarterOrdinal(q)).sort((a, b) => quarterOrdinal(a) - quarterOrdinal(b))[0] || null;
}
