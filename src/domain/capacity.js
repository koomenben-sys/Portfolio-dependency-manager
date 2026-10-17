// Capacity maths (docs/design.md D7, D8). Pure functions shared by every adapter and view.

export function availableWeeks(cap) {
  if (!cap) return 0;
  const net = Math.max(0, cap.headcount * cap.weeks * cap.focusFactor - cap.absenceWeeks);
  return net * (1 - cap.reservePct / 100);
}

export function bandFor(pct, available) {
  if (!available) return 'none';
  if (pct <= 80) return 'ok';
  if (pct <= 100) return 'warn';
  return 'over';
}

const round1 = (n) => Math.round(n * 10) / 10;

// Load of one team in one quarter. Own work = plans not 'not_committed'; incoming = accepted/partial asks.
export function teamLoad(state, teamId, quarterId) {
  const cap = state.capacity.find((c) => c.teamId === teamId && c.quarterId === quarterId);
  const available = availableWeeks(cap);
  const epicTeam = new Map(state.epics.map((e) => [e.id, e.teamId]));
  const own = state.plans.filter(
    (p) => p.quarterId === quarterId && epicTeam.get(p.epicId) === teamId && p.commitment !== 'not_committed',
  );
  const incoming = state.dependencies.filter(
    (d) => d.providerTeamId === teamId && d.quarterId === quarterId && ['accepted', 'partial'].includes(d.response),
  );
  const ownLow = own.reduce((s, p) => s + p.effortLow, 0);
  const ownHigh = own.reduce((s, p) => s + p.effortHigh, 0);
  const incLow = incoming.reduce((s, d) => s + d.effortLow, 0);
  const incHigh = incoming.reduce((s, d) => s + d.effortHigh, 0);
  const totalLow = ownLow + incLow;
  const totalHigh = ownHigh + incHigh;
  const pct = available ? Math.round((totalHigh / available) * 100) : 0;
  return {
    cap, available: round1(available),
    ownLow, ownHigh, incLow, incHigh, totalLow, totalHigh,
    pct, pctLow: available ? Math.round((totalLow / available) * 100) : 0,
    band: bandFor(pct, available),
  };
}

// Index (into the rank-sorted, non-'not_committed' list) of the first epic that no longer fits.
// Incoming accepted asks are treated as already-spent capacity. Returns -1 when everything fits.
export function cutLineIndex(sortedPlans, available, incHigh) {
  let cum = incHigh;
  for (let i = 0; i < sortedPlans.length; i += 1) {
    cum += sortedPlans[i].effortHigh;
    if (cum > available) return i;
  }
  return -1;
}
