// Release B — Capaciteit & ritme (docs/design.md section 22, D50-D56). Pure functions shared by both
// adapters and every screen: T-shirt sizes, certainty, derived bottlenecks, the stand per toezegging with the
// bijwerkmoment cadence (section 28), the Voortgang selectors (section 23) and the delivered checklist for Resultaat.
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

// ── Commitment signals (D55) — retired by section 28 (D100): the columns stay, nothing writes them ─────────
export const inExecution = (phase) => phase === 'locked' || phase === 'active';

// ── Stand per toezegging (section 28, D100-D102) ─────────────────────────────
// Stored: dependencies.progress not_started | started | done (provider team). Derived on top: blocked (an open
// impediment is linked to the ask) and escalated (such an impediment was escalated). Done wins over everything.
export const PROGRESS = ['not_started', 'started', 'done'];
export const STAND_META = {
  not_started: { label: 'Not started', tone: 'neutral', order: 0 },
  started: { label: 'Started', tone: 'info', order: 1 },
  blocked: { label: 'Blocked', tone: 'warn', order: 2 },
  escalated: { label: 'Escalated', tone: 'danger', order: 3 },
  done: { label: 'Done', tone: 'ok', order: 4 },
};
export function checkProgress(p, Err = Error) {
  if (!PROGRESS.includes(p)) throw new Err('Unknown progress');
  return p;
}
export const progressOf = (dep) => (PROGRESS.includes(dep?.progress) ? dep.progress : 'not_started');
const isOpenImp = (i) => i.status !== 'resolved' && (i.kind || 'impediment') === 'impediment';
// Open impediments linked to one ask (depId) or, with depId null, to the epic itself.
export const impedimentsOf = (state, { depId = null, epicId = null }) => state.impediments.filter((i) => isOpenImp(i) && (depId ? i.depId === depId : i.epicId === epicId && !i.depId));
export function depStand(state, dep) {
  const p = progressOf(dep);
  if (p === 'done') return 'done';
  const imps = impedimentsOf(state, { depId: dep.id });
  if (imps.some((i) => i.escalatedAt)) return 'escalated';
  if (imps.length) return 'blocked';
  return p;
}
// Epic stand (D101): Gestart as soon as one committed ask is started (or the epic sets it), Klaar when every committed
// ask is Klaar (or the epic sets it when it has none). Blocked / escalated come from impediments on the asks or the epic.
export function epicStand(state, epicId, quarterId) {
  const plan = state.plans.find((p) => p.epicId === epicId && p.quarterId === quarterId) || null;
  const deps = state.dependencies.filter((d) => d.quarterId === quarterId && d.epicId === epicId && normAsk(d.response) === 'accepted');
  const stands = deps.map((d) => depStand(state, d));
  const override = PROGRESS.includes(plan?.progressOverride) ? plan.progressOverride : null;
  const done = stands.filter((s) => s === 'done').length;
  const started = stands.filter((s) => s !== 'not_started').length;
  const blocked = stands.filter((s) => s === 'blocked' || s === 'escalated').length;
  const own = impedimentsOf(state, { epicId });
  const escalated = stands.some((s) => s === 'escalated') || own.some((i) => i.escalatedAt);
  let stand = 'not_started';
  if (override === 'done' || (deps.length > 0 && done === deps.length)) stand = 'done';
  else if (escalated) stand = 'escalated';
  else if (blocked || own.length) stand = 'blocked';
  else if (started || override === 'started') stand = 'started';
  return { stand, deps, done, started, blocked, total: deps.length, impediments: own, override };
}
// Delivered on Afsluiten (D103): the manual flag or a derived Klaar.
export const isDelivered = (state, plan) => !!plan && (!!plan.delivered || epicStand(state, plan.epicId, plan.quarterId).stand === 'done');
// Warning (D102): a committed ask that is not started while its size no longer fits before the deadline:
// upper pw of its size (or effort_high) >= remaining whole weeks. Deadline: needed_by, else the epic's (Moet, asks, quarter end).
export function startWarning(state, dep, quarter, mustOf, now = Date.now()) {
  if (normAsk(dep.response) !== 'accepted' || depStand(state, dep) !== 'not_started') return null;
  const upper = dep.size ? sizeRange(state.settings, dep.size)?.[1] : Number(dep.effortHigh) || 0;
  if (!upper) return null;
  const dl = dep.neededBy ? new Date(dep.neededBy) : epicDeadline(state, dep.epicId, quarter, mustOf).date;
  const weeks = Math.max(0, Math.floor((dl.getTime() - now) / (7 * DAY)));
  return upper >= weeks ? { size: dep.size || `${upper} pw`, weeks } : null;
}
// "Laatst gewijzigd": the latest event on a record (both adapters' entity names), { at, name, action } or null.
const ENTITY_ALIASES = { plans: ['plans', 'epic_plans'], epic_plans: ['plans', 'epic_plans'] };
export function lastChange(state, entity, id) {
  const names = ENTITY_ALIASES[entity] || [entity];
  let best = null;
  for (const e of state.events) if (e.entityId === id && names.includes(e.entity) && (!best || e.at > best.at)) best = e;
  return best ? { at: best.at, name: best.actorName || '', action: best.action } : null;
}

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

// ── Ritme / bijwerkmoment (section 28, D104) ─────────────────────────────────
// cadence: { mode: 'exception' | 'confirm', frequency: 'weekly' | 'biweekly' | 'sprint', weeks: 1..4 (sprint length),
// days: [1..7] (ISO weekdays), time: 'HH:MM' }. The older { mode: 'sprint', weeks } (L9) reads as confirm + sprint.
export const DEFAULT_CADENCE = { mode: 'exception', frequency: 'weekly', weeks: 2, days: [1], time: '12:00' };
export const FREQUENCIES = ['weekly', 'biweekly', 'sprint'];
export const FREQUENCY_LABEL = { weekly: 'Weekly', biweekly: 'Every two weeks', sprint: 'Per sprint' };
export const CADENCE_MODES = ['exception', 'confirm'];
export const CADENCE_MODE_LABEL = { exception: 'Exceptions only', confirm: 'Confirm every period' };
export const cadenceOf = (settings) => {
  const c = { ...DEFAULT_CADENCE, ...(settings?.cadence || {}) };
  if (c.mode === 'sprint') { c.mode = 'confirm'; c.frequency = 'sprint'; }
  if (!Array.isArray(c.days) || !c.days.length) c.days = [1];
  return c;
};
export function checkCadence(c, Err = Error) {
  const next = cadenceOf({ cadence: c });
  if (!CADENCE_MODES.includes(next.mode)) throw new Err('Unknown steering mode');
  if (!FREQUENCIES.includes(next.frequency)) throw new Err('Unknown frequency');
  next.weeks = Number(next.weeks);
  if (!(next.weeks >= 1 && next.weeks <= 4 && Number.isInteger(next.weeks))) throw new Err('Sprint length is 1 to 4 weeks');
  next.days = [...new Set(next.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();
  if (!next.days.length) throw new Err('Pick at least one day');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.time || '')) throw new Err('Time is HH:MM');
  return next;
}
export const periodWeeks = (c) => (c.frequency === 'weekly' ? 1 : c.frequency === 'biweekly' ? 2 : c.weeks);
// Start of the current period, counted in N-week steps from the quarter start; null before the quarter starts.
export function currentSprintStart(quarter, settings, now = Date.now()) {
  const c = cadenceOf(settings);
  const start = quarterStart(quarter, settings?.fiscalYearStartMonth || 1).getTime();
  if (now < start) return null;
  const len = periodWeeks(c) * 7 * DAY;
  return start + Math.floor((now - start) / len) * len;
}
const isoDay = (d) => ((d.getDay() + 6) % 7) + 1;
const atTime = (d, time) => { const [h, m] = String(time).split(':').map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
// Next bijwerkmoment after `now`: the first configured weekday + time ahead ("bijwerken vóór ma 12:00").
export function nextUpdateMoment(settings, now = Date.now()) {
  const c = cadenceOf(settings);
  for (let i = 0; i < 8; i += 1) {
    const d = atTime(new Date(now + i * DAY), c.time);
    if (c.days.includes(isoDay(d)) && d.getTime() > now) return d;
  }
  return atTime(new Date(now + DAY), c.time);
}
// Last bijwerkmoment at or before `now`: the latest configured weekday + time inside the current period, else the
// one before the period started. Weekly: the latest occurrence in the past seven days.
export function lastUpdateMoment(quarter, settings, now = Date.now()) {
  const c = cadenceOf(settings);
  const latestBefore = (limit) => {
    for (let i = 0; i < 8; i += 1) {
      const d = atTime(new Date(limit - i * DAY), c.time);
      if (c.days.includes(isoDay(d)) && d.getTime() <= limit) return d.getTime();
    }
    return null;
  };
  if (c.frequency === 'weekly' || !quarter) return latestBefore(now);
  const ps = currentSprintStart(quarter, settings, now);
  if (ps == null) return null;
  const inPeriod = latestBefore(now);
  return inPeriod != null && inPeriod >= ps ? inPeriod : latestBefore(ps - 1);
}
// Confirm mode, Uitvoeren, committed ask not Klaar and not touched (progress, confirmation, any event) since the last bijwerkmoment.
export function needsConfirmation(state, dep, quarter, now = Date.now()) {
  if (cadenceOf(state.settings).mode !== 'confirm' || !quarter || !inExecution(quarter.phase)) return false;
  if (normAsk(dep.response) !== 'accepted' || progressOf(dep) === 'done') return false;
  const last = lastUpdateMoment(quarter, state.settings, now);
  if (last == null) return false;
  const touched = Math.max(0, ...[dep.confirmedAt, dep.startedAt, dep.doneAt, lastChange(state, 'dependencies', dep.id)?.at].filter(Boolean).map((x) => new Date(x).getTime()));
  return touched < last;
}
// Weekafsluiting (D105): what changed in the quarter since `since` (ISO or null), grouped per epic in rank order.
const DIGEST_ACTIONS = new Set(['progress_set', 'progress_confirmed', 'impediment_raised', 'impediment_status_changed', 'impediment_escalated']);
export function changesSince(state, quarterId, since) {
  const epics = byId(state.epics); const deps = byId(state.dependencies); const imps = byId(state.impediments); const plans = byId(state.plans);
  const planOf = (epicId) => state.plans.find((p) => p.epicId === epicId && p.quarterId === quarterId);
  const rows = [];
  for (const e of state.events) {
    if (!DIGEST_ACTIONS.has(e.action) || (since && e.at <= since)) continue;
    let epicId; let subject;
    if (e.entity === 'dependencies') { const d = deps.get(e.entityId); if (!d || d.quarterId !== quarterId) continue; epicId = d.epicId; subject = d.ask; }
    else if (e.entity === 'impediments') { const i = imps.get(e.entityId); if (!i || (e.quarterId && e.quarterId !== quarterId)) continue; epicId = i.epicId; subject = i.title; }
    else { const p = plans.get(e.entityId); if (!p || p.quarterId !== quarterId) continue; epicId = p.epicId; subject = epics.get(p.epicId)?.title || ''; }
    const plan = planOf(epicId);
    if (!plan) continue;
    rows.push({ id: e.id, at: e.at, name: e.actorName || '', action: e.action, entity: e.entity, epicId, subject, before: e.before || {}, after: e.after || {} });
  }
  rows.sort((a, b) => a.at.localeCompare(b.at));
  const groups = [];
  for (const r of rows) {
    let g = groups.find((x) => x.epicId === r.epicId);
    if (!g) { g = { epicId: r.epicId, rank: planOf(r.epicId)?.rank ?? null, title: epics.get(r.epicId)?.title || '', rows: [] }; groups.push(g); }
    g.rows.push(r);
  }
  return groups.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
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
// Quarter bar (section 27, D96): weeks are quarter-relative ("week 3 van 13", same count as quarterWeek), not ISO
// weeks. The deadline of an epic: its Moet deadline (own or inherited from the programme), else the latest
// needed_by of its asks in the quarter, else the end of the quarter. `weekOf` maps a date onto 1..total.
export function quarterEnd(quarter, settings) {
  const s = quarterStart(quarter, settings?.fiscalYearStartMonth || 1);
  return new Date(s.getFullYear(), s.getMonth() + 3, 0);
}
export function weekOf(date, quarter, settings) {
  const { total } = quarterWeek(quarter, settings);
  const start = quarterStart(quarter, settings?.fiscalYearStartMonth || 1).getTime();
  const w = Math.floor((new Date(date).getTime() - start) / (7 * DAY)) + 1;
  return Math.max(1, Math.min(total, w));
}
export function epicDeadline(state, epicId, quarter, mustOf) {
  const epic = byId(state.epics).get(epicId);
  const must = epic && mustOf ? mustOf(epic) : null;
  if (must?.deadline) return { date: new Date(must.deadline), source: 'must' };
  const needed = state.dependencies.filter((d) => d.quarterId === quarter.id && d.epicId === epicId && d.neededBy).map((d) => d.neededBy).sort();
  if (needed.length) return { date: new Date(needed[needed.length - 1]), source: 'ask' };
  return { date: quarterEnd(quarter, state.settings), source: 'quarter' };
}
// "Nieuw ongepland werk" (section 27, D97): epics whose plan was added to the quarter after the lock, by rank.
export function newSinceLock(state, quarter) {
  if (!quarter?.lockedAt) return [];
  return state.plans.filter((p) => p.quarterId === quarter.id && p.createdAt && p.createdAt > quarter.lockedAt).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
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
      return { epic, plan, rank: plan?.rank ?? baseRank, delivered: isDelivered(state, plan), derivedDone: !!plan && epicStand(state, plan.epicId, quarterId).stand === 'done', carried: !!(next && state.plans.some((p) => p.epicId === epic.id && p.quarterId === next.id)) };
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
