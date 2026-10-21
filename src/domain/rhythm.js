// Release B — Capaciteit & ritme (docs/design.md section 22, D50-D56). Pure functions shared by both
// adapters and every screen: T-shirt sizes, certainty, derived bottlenecks, commitment signals with the sprint
// cadence, the Voortgang selectors (section 23) and the delivered checklist for Resultaat.
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

// ── Commitment signals (D55) ─────────────────────────────────────────────────
export const SIGNALS = ['on_track', 'at_risk', 'wont_make'];
export const SIGNAL_META = {
  on_track: { label: 'On track', tone: 'ok', order: 0 },
  at_risk: { label: 'Deadline at risk', tone: 'warn', order: 1 },
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

// "Toegezegd dit kwartaal" (owner feedback 2026-10-21, item D; docs/design.md section 25, D80). An epic counts as
// committed when its plan commitment is committed or at_risk, or when it has asks and every ask is accepted
// (a draft or discuss plan whose providers all said yes). not_committed never counts; a plan without asks that is
// still draft / discuss does not count either (nobody said yes). closeRows() keeps its baseline-based rule.
export function isCommitted(plan, asks) {
  if (!plan || plan.commitment === 'not_committed') return false;
  if (plan.commitment === 'committed' || plan.commitment === 'at_risk') return true;
  return asks.length > 0 && asks.every((d) => normAsk(d.response) === 'accepted');
}
export function committedEpicIds(state, quarterId) {
  const out = new Set();
  for (const p of state.plans) {
    if (p.quarterId !== quarterId) continue;
    if (isCommitted(p, state.dependencies.filter((d) => d.quarterId === quarterId && d.epicId === p.epicId))) out.add(p.epicId);
  }
  return out;
}

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

// ── Voortgang (section 23, D65) ──────────────────────────────────────────────
// Week n of the quarter, counted from its calendar start; total weeks from the length of the quarter (M5).
export function quarterWeek(quarter, settings, now = Date.now()) {
  const start = quarterStart(quarter, settings?.fiscalYearStartMonth || 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
  const total = Math.round((end - start) / (7 * DAY));
  const week = Math.floor((now - start.getTime()) / (7 * DAY)) + 1;
  return { week: Math.max(1, Math.min(total, week)), total };
}
// Open impediments (kind 'impediment'; risks stay beta) whose epic is planned in the quarter: not Opgelost
// (open or in_progress), escalated ones first, then oldest first (section 27, D93).
export function openImpediments(state, quarterId, now = Date.now()) {
  const planned = new Set(state.plans.filter((p) => p.quarterId === quarterId).map((p) => p.epicId));
  return state.impediments
    .filter((i) => i.status !== 'resolved' && (i.kind || 'impediment') === 'impediment' && planned.has(i.epicId))
    .sort((a, b) => (isEscalated(b, state.settings, now) - isEscalated(a, state.settings, now)) || a.raisedAt.localeCompare(b.raisedAt));
}
// ── Impediments (section 27, D92/D93) ────────────────────────────────────────
// Status Open · In behandeling · Opgelost; who may change it is decided in data/repository.js (canChangeImpediment).
export const IMPEDIMENT_STATUSES = ['open', 'in_progress', 'resolved'];
export const IMPEDIMENT_STATUS_META = { open: { label: 'Open', tone: 'neutral' }, in_progress: { label: 'In progress', tone: 'info' }, resolved: { label: 'Resolved', tone: 'ok' } };
export function checkImpedimentStatus(s, Err = Error) {
  if (!IMPEDIMENT_STATUSES.includes(s)) throw new Err('Unknown impediment status');
  return s;
}
// Escalation threshold in days: an organisation setting (Instellingen), default 7.
export const DEFAULT_ESCALATION_DAYS = 7;
export const escalationDays = (settings) => { const n = Number(settings?.impedimentEscalationDays); return Number.isInteger(n) && n >= 1 ? n : DEFAULT_ESCALATION_DAYS; };
export function checkEscalationDays(n, Err = Error) {
  const v = Number(n);
  if (!(Number.isInteger(v) && v >= 1 && v <= 365)) throw new Err('Escalation is 1 to 365 days');
  return v;
}
// Not Opgelost and older than the threshold: shown red with an "Escalatie" chip and sorted to the top.
export const isEscalated = (imp, settings, now = Date.now()) => imp.status !== 'resolved' && (now - new Date(imp.raisedAt).getTime()) / DAY > escalationDays(settings);
// Asks created after the quarter was locked ("na vastzetten", M3/M5).
export const isPostLock = (dep, quarter) => !!(quarter?.lockedAt && dep?.createdAt && dep.createdAt > quarter.lockedAt);

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
