// Selectors and derived views over the plan state. Pure functions; every screen uses these so the
// Overview, Board and Attention numbers cannot drift apart (docs/design.md D11, AC E5).
import { teamLoad, cutLineIndex } from './capacity';
import {
  PHASES, PHASE_INDEX, RESPONSE_META, NO_RESPONSE_DAYS, IMPEDIMENT_AGING_DAYS, STALE_TEAM_DAYS,
} from './model';

const DAY = 86400000;
export const daysSince = (iso, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : null);
export const daysUntil = (iso, now = Date.now()) => (iso ? Math.ceil((new Date(iso).getTime() - now) / DAY) : null);
export const byId = (list) => new Map(list.map((x) => [x.id, x]));
export const quarterOrdinal = (q) => q.year * 4 + q.q;

export function planFor(state, epicId, quarterId) {
  return state.plans.find((p) => p.epicId === epicId && p.quarterId === quarterId) || null;
}

// Rank-sorted plans of one team in a quarter (unranked last).
export function teamPlans(state, teamId, quarterId) {
  const epics = byId(state.epics);
  return state.plans
    .filter((p) => p.quarterId === quarterId && epics.get(p.epicId)?.teamId === teamId)
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
}

// Cut line position within the team's ranked plans (excluding not_committed ones), as epic id of first epic below the line.
export function teamCutEpicId(state, teamId, quarterId) {
  const load = teamLoad(state, teamId, quarterId);
  const active = teamPlans(state, teamId, quarterId).filter((p) => p.commitment !== 'not_committed');
  const idx = cutLineIndex(active, load.available, load.incHigh);
  return idx >= 0 ? active[idx].epicId : null;
}

// Dependency badges of an epic in a quarter: outgoing (we need), incoming (asked of our team via epic's team)
export function epicDeps(state, epicId, quarterId) {
  return state.dependencies.filter((d) => d.epicId === epicId && d.quarterId === quarterId);
}
export function worstResponse(deps) {
  if (!deps.length) return null;
  return deps.reduce((w, d) => (RESPONSE_META[d.response].severity > RESPONSE_META[w.response].severity ? d : w)).response;
}
export function incomingForTeam(state, teamId, quarterId) {
  return state.dependencies.filter((d) => d.providerTeamId === teamId && d.quarterId === quarterId);
}

// Timing conflict (AC C7): needed in a later quarter than the epic is planned, or deferred beyond.
export function timingConflict(state, dep) {
  const quarters = byId(state.quarters);
  const need = quarters.get(dep.quarterId);
  if (dep.response === 'deferred' && dep.deferredToQuarterId) {
    const to = quarters.get(dep.deferredToQuarterId);
    return !!(to && need && quarterOrdinal(to) > quarterOrdinal(need));
  }
  const epicPlanQuarters = state.plans.filter((p) => p.epicId === dep.epicId).map((p) => quarters.get(p.quarterId));
  const earliest = epicPlanQuarters.filter(Boolean).sort((a, b) => quarterOrdinal(a) - quarterOrdinal(b))[0];
  return !!(earliest && need && quarterOrdinal(need) > quarterOrdinal(earliest));
}

export function noResponseDays(dep, now = Date.now()) {
  if (dep.response !== 'proposed') return null;
  const d = daysSince(dep.createdAt, now);
  return d >= NO_RESPONSE_DAYS ? d : null;
}

export function latestCheckIn(state, epicId) {
  return state.checkIns.filter((c) => c.epicId === epicId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}
export function isStale(state, epicId, now = Date.now()) {
  const ci = latestCheckIn(state, epicId);
  const days = daysSince(ci?.createdAt, now);
  return days === null || days >= state.settings.staleDays ? { days } : null;
}

export function lastTeamUpdate(state, teamId) {
  const epicIds = new Set(state.epics.filter((e) => e.teamId === teamId).map((e) => e.id));
  const times = [
    ...state.plans.filter((p) => epicIds.has(p.epicId)).map((p) => p.updatedAt),
    ...state.checkIns.filter((c) => epicIds.has(c.epicId)).map((c) => c.createdAt),
    ...state.events.filter((e) => epicIds.has(e.entityId)).map((e) => e.at),
  ].filter(Boolean);
  return times.sort().pop() || null;
}

// ── Baseline / diff (AC D6) ─────────────────────────────────────────────────
export function buildBaseline(state, quarterId) {
  return {
    takenAt: new Date().toISOString(),
    plans: state.plans.filter((p) => p.quarterId === quarterId).map((p) => ({
      epicId: p.epicId, rank: p.rank, commitment: p.commitment, effortLow: p.effortLow, effortHigh: p.effortHigh,
    })),
    dependencies: state.dependencies.filter((d) => d.quarterId === quarterId).map((d) => ({
      id: d.id, response: d.response, providerTeamId: d.providerTeamId, epicId: d.epicId,
    })),
    capacity: state.capacity.filter((c) => c.quarterId === quarterId).map((c) => ({ ...c })),
  };
}

export function lastReason(state, entityId, actions) {
  const ev = state.events.filter((e) => e.entityId === entityId && (!actions || actions.includes(e.action)))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return ev?.reason || '';
}

export function diffAgainstBaseline(state, quarterId) {
  const q = state.quarters.find((x) => x.id === quarterId);
  const base = q?.baseline;
  if (!base) return [];
  const out = [];
  const epics = byId(state.epics);
  const title = (id) => `${epics.get(id)?.refCode ?? ''} ${epics.get(id)?.title ?? ''}`.trim();
  const curPlans = state.plans.filter((p) => p.quarterId === quarterId);
  for (const p of curPlans) {
    const b = base.plans.find((x) => x.epicId === p.epicId);
    if (!b) { out.push({ kind: 'epic added', epicId: p.epicId, text: `${title(p.epicId)} added after lock`, reason: lastReason(state, p.id) }); continue; }
    if (b.commitment !== p.commitment) out.push({ kind: 'commitment', epicId: p.epicId, text: `${title(p.epicId)}: ${b.commitment} → ${p.commitment}`, reason: lastReason(state, p.id, ['commitment_changed']) });
    if (b.rank !== p.rank) out.push({ kind: 'rank', epicId: p.epicId, text: `${title(p.epicId)}: rank ${b.rank ?? '-'} → ${p.rank ?? '-'}`, reason: lastReason(state, p.id, ['rank_changed']) });
    if (b.effortHigh !== p.effortHigh || b.effortLow !== p.effortLow) out.push({ kind: 'effort', epicId: p.epicId, text: `${title(p.epicId)}: effort ${b.effortLow}–${b.effortHigh} → ${p.effortLow}–${p.effortHigh} pw`, reason: lastReason(state, p.id, ['effort_changed']) });
  }
  for (const b of base.plans) {
    if (!curPlans.some((p) => p.epicId === b.epicId)) out.push({ kind: 'epic dropped', epicId: b.epicId, text: `${title(b.epicId)} dropped from the quarter`, reason: '' });
  }
  const curDeps = state.dependencies.filter((d) => d.quarterId === quarterId);
  for (const d of curDeps) {
    const b = base.dependencies.find((x) => x.id === d.id);
    if (!b) out.push({ kind: 'dependency added', epicId: d.epicId, text: `New ask ${d.refCode} added after lock`, reason: '' });
    else if (b.response !== d.response) out.push({ kind: 'dependency', epicId: d.epicId, text: `${d.refCode}: ${b.response} → ${d.response}`, reason: d.responseReason });
  }
  return out;
}
export function changedSinceBaseline(state, epicId, quarterId) {
  return diffAgainstBaseline(state, quarterId).some((d) => d.epicId === epicId);
}

// ── Readiness (AC D3) ─────────────────────────────────────────────────────────
export function readiness(state, quarterId) {
  return state.teams.map((t) => {
    const reasons = [];
    const plans = teamPlans(state, t.id, quarterId);
    if (!plans.length) reasons.push('No epics planned');
    const load = teamLoad(state, t.id, quarterId);
    if (!load.cap || !load.available) reasons.push('Capacity not set');
    const open = incomingForTeam(state, t.id, quarterId).filter((d) => d.response === 'proposed').length;
    if (open) reasons.push(`${open} unanswered ask${open > 1 ? 's' : ''}`);
    if (!state.votes.some((v) => v.teamId === t.id && v.quarterId === quarterId)) reasons.push('No confidence vote');
    return { team: t, ready: reasons.length === 0, reasons };
  });
}

// ── Overview KPIs and flags (AC E1-E4) ─────────────────────────────────────────
export function overview(state, quarterId, now = Date.now()) {
  const epics = byId(state.epics);
  const plans = state.plans.filter((p) => p.quarterId === quarterId);
  const ranked = plans.filter((p) => p.rank != null).sort((a, b) => a.rank - b.rank);
  const topN = ranked.slice(0, 10);
  const topCommitted = topN.filter((p) => p.commitment === 'committed').length;
  const loads = state.teams.map((t) => ({ team: t, ...teamLoad(state, t.id, quarterId) }));
  const overTeams = loads.filter((l) => l.band === 'over');
  const regulatory = plans.filter((p) => epics.get(p.epicId)?.regulatory);
  const regRisk = regulatory.filter((p) => ['at_risk', 'not_committed', 'discuss', 'draft'].includes(p.commitment) && p.commitment !== 'committed');
  const openAsks = state.dependencies.filter((d) => d.quarterId === quarterId && d.response === 'proposed');
  const oldestAsk = Math.max(0, ...openAsks.map((d) => daysSince(d.createdAt, now)));
  const openImp = state.impediments.filter((i) => i.status === 'open');
  const oldestImp = Math.max(0, ...openImp.map((i) => daysSince(i.raisedAt, now)));
  const votes = state.votes.filter((v) => v.quarterId === quarterId);
  const avgVote = votes.length ? votes.reduce((s, v) => s + v.vote, 0) / votes.length : null;

  // Theme coverage
  const themeRows = state.themes.map((th) => {
    const ps = plans.filter((p) => epics.get(p.epicId)?.themeId === th.id);
    const committed = ps.filter((p) => p.commitment === 'committed');
    return {
      theme: th, epics: ps.length, committed: committed.length,
      weeks: committed.reduce((s, p) => s + p.effortHigh, 0),
      uncovered: committed.length === 0,
    };
  });
  const unaligned = plans.filter((p) => !epics.get(p.epicId)?.themeId).length;

  // Red flags
  const flags = [];
  for (const p of topN) {
    if (!['committed'].includes(p.commitment)) {
      flags.push({ key: `top-${p.id}`, severity: 3, kind: 'Top priority not committed', epicId: p.epicId,
        text: `${epics.get(p.epicId).refCode} ${epics.get(p.epicId).title} (rank ${p.rank}) is ${p.commitment.replace('_', ' ')}`,
        owner: epics.get(p.epicId).ownerName, age: daysSince(p.updatedAt, now) });
    }
  }
  for (const p of regRisk) {
    const e = epics.get(p.epicId);
    flags.push({ key: `reg-${p.id}`, severity: 4, kind: 'Regulatory at risk', epicId: p.epicId,
      text: `${e.refCode} ${e.title}: ${p.commitment.replace('_', ' ')}, ${daysUntil(e.regulatoryDeadline, now)} days to deadline`,
      owner: e.ownerName, age: daysSince(p.updatedAt, now) });
  }
  for (const d of state.dependencies.filter((x) => x.quarterId === quarterId && ['declined', 'needs_priority_call'].includes(x.response))) {
    const p = planFor(state, d.epicId, quarterId);
    if (p && p.rank != null && p.rank <= 10) {
      flags.push({ key: `dep-${d.id}`, severity: 3, kind: 'Ask unresolved on top epic', epicId: d.epicId,
        text: `${d.refCode} for ${epics.get(d.epicId).title}: ${RESPONSE_META[d.response].label}`,
        owner: epics.get(d.epicId).ownerName, age: daysSince(d.respondedAt || d.createdAt, now) });
    }
  }
  for (const i of openImp) {
    const age = daysSince(i.raisedAt, now);
    if (age > IMPEDIMENT_AGING_DAYS) {
      flags.push({ key: `imp-${i.id}`, severity: 2, kind: i.kind === 'risk' ? 'Aging risk' : 'Aging impediment', epicId: i.epicId,
        text: `${i.refCode} ${i.title}`, owner: i.ownerName, age });
    }
  }
  flags.sort((a, b) => b.severity - a.severity || (b.age ?? 0) - (a.age ?? 0));

  const teamFreshness = state.teams.map((t) => {
    const last = lastTeamUpdate(state, t.id);
    const d = daysSince(last, now);
    return { team: t, last, days: d, stale: d === null || d > STALE_TEAM_DAYS };
  });
  const asOf = [...state.plans.map((p) => p.updatedAt), ...state.checkIns.map((c) => c.createdAt), ...state.events.map((e) => e.at)]
    .filter(Boolean).sort().pop();

  return {
    topN: topN.length, topCommitted, overTeams, loads, regulatoryCount: regulatory.length, regRisk,
    openAsks: openAsks.length, oldestAsk, openImp: openImp.length, oldestImp, avgVote, voteCount: votes.length,
    themeRows, unaligned, flags, teamFreshness, asOf,
  };
}

// ── My attention (AC F4) ────────────────────────────────────────────────────────
export function attention(state, user, quarterId, now = Date.now()) {
  const items = [];
  const epics = byId(state.epics);
  const teams = byId(state.teams);
  const myTeam = user?.teamId;
  if (!myTeam) return items;
  const lastSeen = user.lastSeen ? new Date(user.lastSeen).getTime() : 0;
  for (const d of state.dependencies.filter((x) => x.providerTeamId === myTeam)) {
    if (d.response === 'proposed') {
      const age = daysSince(d.createdAt, now);
      items.push({ key: `ask-${d.id}`, group: 'Asks waiting for your answer', depId: d.id, epicId: d.epicId,
        text: `${d.refCode} from ${teams.get(d.requesterTeamId)?.name}: ${d.ask}`, meta: `${age} day${age === 1 ? '' : 's'} open` });
    }
  }
  for (const d of state.dependencies.filter((x) => x.requesterTeamId === myTeam && x.response !== 'proposed')) {
    items.push({ key: `ans-${d.id}`, group: 'Answers on your asks', depId: d.id, epicId: d.epicId,
      text: `${d.refCode} to ${teams.get(d.providerTeamId)?.name}: ${RESPONSE_META[d.response].label}${d.responseReason ? ` – ${d.responseReason}` : ''}`,
      meta: d.respondedAt && new Date(d.respondedAt).getTime() > lastSeen ? 'new' : `${daysSince(d.respondedAt, now)} days ago` });
  }
  const activeQ = state.quarters.find((q) => q.phase === 'active');
  if (activeQ) {
    for (const p of state.plans.filter((x) => x.quarterId === activeQ.id)) {
      const e = epics.get(p.epicId);
      if (e?.teamId !== myTeam) continue;
      const st = isStale(state, e.id, now);
      if (st) items.push({ key: `stale-${e.id}`, group: 'Epics without a recent check-in', epicId: e.id,
        text: `${e.refCode} ${e.title}`, meta: st.days === null ? 'Never checked in' : `No check-in for ${st.days} days` });
    }
  }
  for (const i of state.impediments.filter((x) => x.status === 'open')) {
    const e = epics.get(i.epicId);
    if (e?.teamId === myTeam || i.ownerName === user.name) {
      const age = daysSince(i.raisedAt, now);
      items.push({ key: `imp-${i.id}`, group: 'Open impediments and risks', epicId: i.epicId,
        text: `${i.refCode} ${i.title}`, meta: `${age} days${age > IMPEDIMENT_AGING_DAYS ? ' - aging' : ''}` });
    }
  }
  for (const di of state.discussions.filter((x) => x.status === 'open' && x.ownerName === user.name)) {
    items.push({ key: `disc-${di.id}`, group: 'Discussion items you own', epicId: di.epicId, text: di.reason, meta: di.timeboxMin ? `${di.timeboxMin} min` : '' });
  }
  return items;
}

export function phaseAllows(phase, what) {
  const i = PHASE_INDEX[phase];
  if (what === 'answer') return i >= PHASE_INDEX.negotiate && phase !== 'closed';
  if (what === 'edit') return phase !== 'closed';
  if (what === 'vote') return phase !== 'prep' && phase !== 'closed';
  return true;
}
export { PHASES };
