// Repository boundary (docs/design.md D12).
// Every adapter returns the full plan state through load() and applies commands through the same
// method names. Views never talk to Supabase or localStorage directly.
//
// Contract (all async, all take `actor` = { id, name, role, teamId, canRank }):
//   load()                                            -> state
//   upsertEpic(actor, epic)                           -> state
//   deleteEpic(actor, epicId)
//   upsertPlan(actor, plan, reason)                   -> state   (rank change requires canRank + reason)
//   removePlan(actor, planId)
//   reorderPlans(actor, quarterId, orderedPlanIds, reason='') (rank permission; ranks 1..n; one rank_changed event)
//   addDependency(actor, dep) / answerDependency(actor, depId, { response, reason, deferredToQuarterId })
//     reason required only for declined / deferred (REASON_REQUIRED in domain/model.js)
//   setPhase(actor, quarterId, phase, reason)         (admin; lock stores a baseline)
//   castVote(actor, teamId, quarterId, vote, reason)
//   raiseDiscussion(actor, item) / resolveDiscussion(actor, id, outcome)
//   addCheckIn(actor, checkIn)
//   upsertImpediment(actor, impediment) / resolveImpediment(actor, id) / setImpedimentStatus(actor, id, status)
//     impediment carries ownerName (Melder, admin may change), actionOwnerId / actionOwnerName (Actiehouder) and
//     status open | in_progress | resolved; status and action holder changeable by canChangeImpediment() (D92)
//   upsertCapacity(actor, { teamId, quarterId, headcount (FTE), fteVacant, absenceWeeks, reservePct })   (own team; D51)
//   upsertPlan / addDependency / updateDependency accept `size` (S|M|L|XL -> writes the mapped effort range, D50);
//     asks also carry `certainty` (low|medium|high, requester only, D52)
//   lockPlan(actor, quarterId, reason='')              (admin; baseline + phase locked in one step, one phase_changed row; D54)
//   closeQuarter(actor, quarterId, reason='')          (admin; locked/active -> closed)
//   setSignal(actor, depId, signal, note='') / confirmSignal(actor, depId)   (provider team, committed asks only; D55)
//   setDelivered(actor, planId, bool) / carryOver(actor, planId)            (epic team; carryOver is idempotent; D56)
//   followEpic(actor, epicId) / unfollowEpic(actor, epicId)   (any member, own rows only; state.follows = own epic ids
//     in Supabase, { [actorId]: epicId[] } in the mock; domain/follows.js reads both; D67/D68)
//   updateSettings also carries sizeMap { S:[lo,hi], ... } and cadence { mode: 'exception'|'sprint', weeks }
//   upsertTeam / deleteTeam / upsertQuarter
//   upsertTheme(actor, { id?, name, type: 'goal'|'program', must, mustDeadline, archived }) / deleteTheme   (rank permission; D40)
//   upsertEpic also carries themeId, value (jsonb inputs), valueNote, onePager {problem, outcome, outOfScope}, onePagerUrl, externalUrl (D43/D44/D47)
//   updateSettings(actor, patch)
//   importExternalEpics(actor, externalEpics, teamMapping) -> { created, updated }
//   inviteMember(actor, { email, role, teamId, canRank, displayName })   (admin; state.invitations)
//   updateMember(actor, userId, { role, teamId, canRank, displayName }) / removeMember(actor, userId)   (admin)
//   revokeInvitation(actor, invitationId) / sendSignInLink(actor, email) -> { sent, demo }   (admin)
//   subscribe(onState, onStatus) -> unsubscribe       (live updates; onStatus('live' | 'error'))
//   reset()                                           (mock only)
//
// Authorisation is enforced in the adapter (mock: in JS; Supabase: by RLS + triggers, mirrored in JS for UX).

import { MockRepository } from './mockRepository';

let instance;
export function getRepository() {
  if (instance) return instance;
  const source = import.meta.env.VITE_DATA_SOURCE || 'mock';
  if (source === 'supabase') {
    // Lazy import keeps supabase-js out of the mock bundle path at runtime.
    throw new Error('Use createRepository() for async adapter selection');
  }
  instance = new MockRepository();
  return instance;
}

export async function createRepository() {
  if (instance) return instance;
  const source = import.meta.env.VITE_DATA_SOURCE || 'mock';
  if (source === 'supabase') {
    const { SupabaseRepository } = await import('./supabaseRepository');
    instance = new SupabaseRepository();
  } else {
    instance = new MockRepository();
  }
  return instance;
}

export const DATA_SOURCE = import.meta.env.VITE_DATA_SOURCE || 'mock';

// Shared authorisation rules (used by both adapters for consistent errors and UI gating).
export class PermissionError extends Error {}
export class ValidationError extends Error {}

export function canWriteTeam(actor, teamId) {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  return actor.role === 'planner' && actor.teamId === teamId;
}
export const isAdmin = (actor) => actor?.role === 'admin';
export const canRank = (actor) => actor?.role === 'admin' || !!actor?.canRank;
export const isPlanner = (actor) => actor?.role === 'admin' || actor?.role === 'planner';
// Impediments (section 27, D92): the status and the action holder may be changed by the Melder (reporter), the
// Actiehouder (by member id or by name), the planner of the epic's team and admins. Same rule as impediment_guard() (013).
export function canChangeImpediment(actor, imp, epic) {
  if (!actor || !imp) return false;
  if (isAdmin(actor)) return true;
  if (actor.role !== 'planner') return false;
  if (imp.reporterId && imp.reporterId === actor.id) return true;
  if (imp.ownerName && imp.ownerName === actor.name) return true;
  if (imp.actionOwnerId && imp.actionOwnerId === actor.id) return true;
  if (imp.actionOwnerName && imp.actionOwnerName === actor.name) return true;
  return !!epic && canWriteTeam(actor, epic.teamId);
}

// Release B (D51): the four capacity numbers; same texts in both adapters (010 checks them again in SQL).
export function checkCapacity(cap) {
  for (const k of ['headcount', 'fteVacant', 'absenceWeeks']) if (cap[k] != null && !(Number(cap[k]) >= 0)) throw new ValidationError('Capacity cannot be negative');
  if (cap.reservePct != null && !(Number(cap.reservePct) >= 0 && Number(cap.reservePct) <= 80)) throw new ValidationError('Run % is between 0 and 80');
}

// Members and invitations (docs/design.md section 18). Same checks and texts as db/migrations/007.
export const ROLES = ['admin', 'planner', 'viewer'];
export function normaliseEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ValidationError('Enter a valid e-mail address');
  return e;
}
// Returns the team id to store: planners need an existing team, other roles have none.
export function checkRole(role, teamId, teams) {
  if (!ROLES.includes(role)) throw new ValidationError('Unknown role');
  if (role !== 'planner') return null;
  if (!teams.some((t) => t.id === teamId)) throw new ValidationError('A planner needs a team');
  return teamId;
}
// nextRole = null means the member is removed.
export function checkMemberChange(actor, members, target, nextRole) {
  if (!target) throw new ValidationError('Unknown member');
  if (nextRole === null && target.id === actor.id) throw new ValidationError('You cannot remove yourself');
  if (nextRole !== null && target.id === actor.id && nextRole !== target.role) throw new ValidationError('You cannot change your own role; ask another admin');
  if (target.role === 'admin' && nextRole !== 'admin' && !members.some((m) => m.role === 'admin' && m.id !== target.id)) throw new ValidationError('An organisation needs at least one admin');
}
