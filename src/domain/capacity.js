// Capacity maths (docs/design.md D7, D8). Pure functions shared by every adapter and view.
//
// Load model (after review round 2):
// * own work      = the team's plans in the quarter that are not 'not_committed'
// * incoming      = asks answered accepted (full effort) or partial (granted effort)
// * pending       = asks still 'proposed' - NOT in the load, shown as "if accepted"
// * cut line      = own epics AND accepted incoming asks ranked together by strategic rank of the
//                   (requesting) epic; the first item that no longer fits in `available` is the cut.

export function availableWeeks(cap) {
  if (!cap) return 0;
  // Absence is calendar weeks of people, so the focus factor applies to it too (review: EM).
  const net = Math.max(0, cap.headcount * cap.weeks - cap.absenceWeeks) * cap.focusFactor;
  return net * (1 - cap.reservePct / 100);
}

// Bands use the exact ratio, not the rounded percentage (100.4% is 'over').
export function bandFor(ratio, available) {
  if (!available) return 'none';
  if (ratio <= 0.8) return 'ok';
  if (ratio <= 1) return 'warn';
  return 'over';
}

const round1 = (n) => Math.round(n * 10) / 10;

// Effort an answered ask costs the provider: granted amount for partial, full for accepted.
export function incomingEffort(dep) {
  if (dep.response === 'accepted') return { low: dep.effortLow, high: dep.effortHigh };
  if (dep.response === 'partial') return { low: dep.grantedLow ?? dep.effortLow, high: dep.grantedHigh ?? dep.effortHigh };
  return { low: 0, high: 0 };
}

export function teamLoad(state, teamId, quarterId) {
  const cap = state.capacity.find((c) => c.teamId === teamId && c.quarterId === quarterId);
  const available = availableWeeks(cap);
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
  const items = [...own, ...asks].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || (a.kind === 'epic' ? -1 : 1));
  const available = availableWeeks(state.capacity.find((c) => c.teamId === teamId && c.quarterId === quarterId));
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
