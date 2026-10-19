// Capacity maths (docs/design.md D7, D8). Pure functions shared by every adapter and view.
//
// Load model (after review round 2):
// * own work      = the team's plans in the quarter that are not 'not_committed'
// * incoming      = asks answered accepted (full effort) or partial (granted effort)
// * pending       = asks still 'proposed' - NOT in the load, shown as "if accepted"
// * cut line      = own epics AND accepted incoming asks ranked together by strategic rank of the
//                   (requesting) epic; the first item that no longer fits in `available` is the cut.

//
// Release B (D51): capacity is team-level and calendar-based. `headcount` = FTE ingevuld, `fteVacant`,
// `absenceWeeks` = verlofweken (team total), `reservePct` = run %. Beschikbaar =
// max(0, FTE × werkdagen / 5 − verlofweken) × (1 − run%), werkdagen from domain/holidays.js. The older
// `weeks` / `focusFactor` fields stay readable (legacy formula when no working days are given) but the core
// screens and teamLoad always pass the quarter's working days.
import { workingDays } from './holidays';
const round1 = (n) => Math.round(n * 10) / 10;

export function availableWeeks(cap, workdays = null) {
  if (!cap) return 0;
  if (workdays == null) {
    // Legacy (pre-Release B): absence is calendar weeks of people, so the focus factor applies to it too.
    const net = Math.max(0, cap.headcount * (cap.weeks ?? 13) - cap.absenceWeeks) * (cap.focusFactor ?? 1);
    return net * (1 - cap.reservePct / 100);
  }
  const net = Math.max(0, (Number(cap.headcount) || 0) * workdays / 5 - (Number(cap.absenceWeeks) || 0));
  return net * (1 - (Number(cap.reservePct) || 0) / 100);
}
// "+Y pw als gevuld": the same formula for the vacant FTE, without leave (D51).
export function vacantWeeks(cap, workdays) {
  if (!cap || !(Number(cap.fteVacant) > 0)) return 0;
  return (Number(cap.fteVacant) * workdays / 5) * (1 - (Number(cap.reservePct) || 0) / 100);
}
// Working days of a quarter from the state (fiscal start month from settings).
export function quarterWorkdays(state, quarterId) {
  const q = state.quarters.find((x) => x.id === quarterId);
  return workingDays(q, state.settings?.fiscalYearStartMonth || 1).workingDays;
}
const capOf = (state, teamId, quarterId) => state.capacity.find((c) => c.teamId === teamId && c.quarterId === quarterId) || null;

// The capacity line (L3): available, vacant (+pw), requested (own work + accepted asks), % and band.
export function teamCapacity(state, teamId, quarterId) {
  const cap = capOf(state, teamId, quarterId);
  const workdays = quarterWorkdays(state, quarterId);
  const load = teamLoad(state, teamId, quarterId);
  return { cap, workdays, available: load.available, vacant: round1(vacantWeeks(cap, workdays)), requested: round1(load.totalHigh), pct: load.pct, band: load.band, reservePct: cap ? Number(cap.reservePct) || 0 : null, fteVacant: cap ? Number(cap.fteVacant) || 0 : 0 };
}

// Bands use the exact ratio, not the rounded percentage (100.4% is 'over').
export function bandFor(ratio, available) {
  if (!available) return 'none';
  if (ratio <= 0.8) return 'ok';
  if (ratio <= 1) return 'warn';
  return 'over';
}

// Effort an answered ask costs the provider: granted amount for partial, full for accepted.
export function incomingEffort(dep) {
  if (dep.response === 'accepted') return { low: dep.effortLow, high: dep.effortHigh };
  if (dep.response === 'partial') return { low: dep.grantedLow ?? dep.effortLow, high: dep.grantedHigh ?? dep.effortHigh };
  return { low: 0, high: 0 };
}

export function teamLoad(state, teamId, quarterId) {
  const cap = state.capacity.find((c) => c.teamId === teamId && c.quarterId === quarterId);
  const available = availableWeeks(cap, quarterWorkdays(state, quarterId));
  const epicTeam = new Map(state.epics.map((e) => [e.id, e.teamId]));
  const own = state.plans.filter(
    (p) => p.quarterId === quarterId && epicTeam.get(p.epicId) === teamId && p.commitment !== 'not_committed',
  );
  const asks = state.dependencies.filter((d) => d.providerTeamId === teamId && d.quarterId === quarterId);
  const incoming = asks.filter((d) => ['accepted', 'partial'].includes(d.response));
  // Not yet decided: proposed, or waiting for a priority call.
  const pending = asks.filter((d) => d.response === 'proposed' || d.response === 'needs_priority_call');
  const ownLow = own.reduce((s, p) => s + p.effortLow, 0);
  const ownHigh = own.reduce((s, p) => s + p.effortHigh, 0);
  const incLow = incoming.reduce((s, d) => s + incomingEffort(d).low, 0);
  const incHigh = incoming.reduce((s, d) => s + incomingEffort(d).high, 0);
  const pendingHigh = pending.reduce((s, d) => s + d.effortHigh, 0);
  const totalLow = ownLow + incLow;
  const totalHigh = ownHigh + incHigh;
  const ratio = available ? totalHigh / available : 0;
  return {
    cap, available: round1(available),
    ownLow, ownHigh, incLow, incHigh, pendingHigh, pendingCount: pending.length, totalLow, totalHigh,
    pct: Math.round(ratio * 100), pctLow: available ? Math.round((totalLow / available) * 100) : 0,
    pctIfAllAccepted: available ? Math.round(((totalHigh + pendingHigh) / available) * 100) : 0,
    remaining: round1(available - totalHigh),
    band: bandFor(ratio, available),
  };
}

// Ranked list of everything that costs this team capacity in the quarter, with cumulative high
// estimate and a `fits` flag. Items: { kind: 'epic'|'ask', id, epicId, rank, low, high, cum, fits }.
export function rankedLoad(state, teamId, quarterId) {
  const epics = new Map(state.epics.map((e) => [e.id, e]));
  const planByEpic = new Map(state.plans.filter((p) => p.quarterId === quarterId).map((p) => [p.epicId, p]));
  const own = state.plans
    .filter((p) => p.quarterId === quarterId && epics.get(p.epicId)?.teamId === teamId && p.commitment !== 'not_committed')
    .map((p) => ({ kind: 'epic', id: p.id, epicId: p.epicId, rank: p.rank, low: p.effortLow, high: p.effortHigh }));
  const asks = state.dependencies
    .filter((d) => d.providerTeamId === teamId && d.quarterId === quarterId && ['accepted', 'partial'].includes(d.response))
    .map((d) => { const e = incomingEffort(d); return { kind: 'ask', id: d.id, epicId: d.epicId, rank: planByEpic.get(d.epicId)?.rank ?? null, low: e.low, high: e.high }; });
  const items = [...own, ...asks].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || (a.kind === b.kind ? 0 : a.kind === 'epic' ? -1 : 1));
  const available = availableWeeks(state.capacity.find((c) => c.teamId === teamId && c.quarterId === quarterId), quarterWorkdays(state, quarterId));
  let cum = 0;
  for (const it of items) { cum += it.high; it.cum = round1(cum); it.fits = cum <= available; }
  return { items, available: round1(available) };
}

// Epic id of the first own epic that no longer fits (null when everything fits).
export function cutEpicId(state, teamId, quarterId) {
  const { items } = rankedLoad(state, teamId, quarterId);
  return items.find((it) => it.kind === 'epic' && !it.fits)?.epicId ?? null;
}

// What accepting `dep` (optionally with granted effort) would do to the provider's ranked load:
// where it lands, whether it fits, and which own epics it pushes below the cut line (review: EM).
export function simulateAsk(state, dep, { response = 'accepted', grantedLow = null, grantedHigh = null } = {}) {
  const before = rankedLoad(state, dep.providerTeamId, dep.quarterId);
  const sim = { ...dep, response, grantedLow, grantedHigh };
  const altered = { ...state, dependencies: state.dependencies.filter((d) => d.id !== dep.id).concat(['accepted', 'partial'].includes(response) ? [sim] : []) };
  const after = rankedLoad(altered, dep.providerTeamId, dep.quarterId);
  const me = after.items.find((i) => i.id === dep.id) || null;
  const fitBefore = new Map(before.items.map((i) => [i.id, i.fits]));
  const pushed = after.items.filter((i) => i.kind === 'epic' && !i.fits && fitBefore.get(i.id) === true).map((i) => i.epicId);
  const total = after.items.reduce((s, i) => s + i.high, 0);
  return { item: me, fits: me ? me.fits : true, cum: me?.cum ?? null, pushed, total: Math.round(total * 10) / 10, available: after.available };
}
