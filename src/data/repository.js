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
//   addDependency(actor, dep) / answerDependency(actor, depId, { response, reason, deferredToQuarterId })
//   setPhase(actor, quarterId, phase, reason)         (admin; lock stores a baseline)
//   castVote(actor, teamId, quarterId, vote, reason)
//   raiseDiscussion(actor, item) / resolveDiscussion(actor, id, outcome)
//   addCheckIn(actor, checkIn)
//   upsertImpediment(actor, impediment) / resolveImpediment(actor, id)
//   upsertCapacity(actor, capacity)
//   upsertTeam / deleteTeam / upsertTheme / deleteTheme / upsertQuarter
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
