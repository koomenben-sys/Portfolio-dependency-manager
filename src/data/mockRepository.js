// In-memory + localStorage implementation of the repository contract (docs/design.md D12, AC A1-A5).
import { seedState } from './seed';
import { buildBaseline, readiness, phaseAllows } from '../domain/plan';
import { PHASES, isLockedPhase, REASON_REQUIRED } from '../domain/model';
import { PermissionError, ValidationError, canWriteTeam, isAdmin, canRank, isPlanner, normaliseEmail, checkRole, checkMemberChange } from './repository';

const KEY = 'kwartaalplan.mock.v2'; // v2: calmer seed of the 2026-10-17 reset
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const now = () => new Date().toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));

export class MockRepository {
  constructor() {
    this.state = null;
    this.counters = null;
  }

  // ── persistence ────────────────────────────────────────────────────────────
  _persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ state: this.state, counters: this.counters })); } catch { /* ignore */ }
    return clone(this.state);
  }
  async load() {
    if (this.state) return clone(this.state);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const saved = JSON.parse(raw); this.state = saved.state; this.counters = saved.counters; this.state.invitations ||= []; return clone(this.state); }
    } catch { /* fall through */ }
    return this.reset();
  }
  async reset() {
    this.state = { invitations: [], ...seedState() };
    this.counters = { epic: 33, dependency: 21, impediment: 6 };
    return this._persist();
  }
  // Blank organisation for the onboarding wizard (demo mode). Keeps the language choice.
  async resetEmpty(actor, language = 'nl') {
    const seed = seedState();
    this.state = { teams: [], themes: [], quarters: [], capacity: [], epics: [], plans: [], dependencies: [], votes: [], discussions: [], checkIns: [], impediments: [], events: [],
      members: seed.members.filter((m) => m.role === 'admin').map((m) => ({ ...m, teamId: null })), invitations: [],
      settings: { ...seed.settings, language, setupComplete: false, orgName: '' } };
    this.counters = { epic: 1, dependency: 1, impediment: 1 };
    return this._persist();
  }
  // Live updates between browser tabs (demo): another tab's write fires a `storage` event here.
  subscribe(onState, onStatus) {
    if (typeof window === 'undefined') { onStatus?.('error'); return () => {}; }
    const handler = (e) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const saved = JSON.parse(e.newValue);
        this.state = saved.state; this.counters = saved.counters; this.state.invitations ||= [];
        onState(clone(this.state));
      } catch { /* ignore a half-written value */ }
    };
    window.addEventListener('storage', handler);
    onStatus?.('live');
    return () => window.removeEventListener('storage', handler);
  }
  _ref(kind) {
    const n = this.counters[kind]++;
    const prefix = { epic: 'EP', dependency: 'DEP', impediment: 'IMP' }[kind];
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }
  _event(actor, action, entity, entityId, quarterId, reason, before, after) {
    this.state.events.push({ id: uid(), at: now(), actorId: actor?.id, actorName: actor?.name, action, entity, entityId, quarterId, reason: reason || '', before, after });
  }
  _quarter(id) { const q = this.state.quarters.find((x) => x.id === id); if (!q) throw new ValidationError('Unknown quarter'); return q; }
  _guardPhase(quarterId, reason, what) {
    const q = this._quarter(quarterId);
    if (q.phase === 'closed') throw new ValidationError('Quarter is closed');
    if (isLockedPhase(q.phase) && !String(reason || '').trim()) throw new ValidationError(`The quarter is locked: a reason is required to ${what}`);
    return q;
  }
  _epic(id) { const e = this.state.epics.find((x) => x.id === id); if (!e) throw new ValidationError('Unknown epic'); return e; }

  // ── epics and plans ────────────────────────────────────────────────────────
  async upsertEpic(actor, epic) {
    const existing = epic.id && this.state.epics.find((e) => e.id === epic.id);
    const teamId = epic.teamId ?? existing?.teamId;
    if (!canWriteTeam(actor, teamId) || (existing && !canWriteTeam(actor, existing.teamId))) throw new PermissionError('You can only edit epics of your own team');
    if ((!existing || epic.title !== undefined) && !epic.title?.trim()) throw new ValidationError('Title is required');
    if (existing && epic.teamId && epic.teamId !== existing.teamId) {
      const deps = this.state.dependencies.filter((d) => d.epicId === existing.id);
      if (deps.some((d) => d.providerTeamId === epic.teamId)) throw new ValidationError('This epic asks the new team for something; remove that ask first');
      deps.forEach((d) => { d.requesterTeamId = epic.teamId; });
    }
    if (existing) {
      if (existing.externalSource) { // imported fields are mastered by the source (D20)
        epic = { ...epic, title: existing.title, externalSource: existing.externalSource, externalId: existing.externalId, externalUrl: existing.externalUrl };
      }
      Object.assign(existing, epic);
    } else {
      const { id: _ignored, ...fields } = epic; // createEpic passes id: undefined; never let it override the uid
      this.state.epics.push({ id: uid(), refCode: this._ref('epic'), description: '', ownerName: '', label: '', regulatory: false, regulatoryDeadline: null, themeId: null, externalSource: null, externalId: null, externalUrl: null, ...fields });
    }
    return this._persist();
  }
  // Returns the created epic (not the state) so the caller can plan it right away.
  async createEpic(actor, epic) {
    await this.upsertEpic(actor, { ...epic, id: undefined });
    return this.state.epics[this.state.epics.length - 1];
  }
  async deleteEpic(actor, epicId) {
    const e = this._epic(epicId);
    if (!canWriteTeam(actor, e.teamId)) throw new PermissionError('Not your team');
    this.state.epics = this.state.epics.filter((x) => x.id !== epicId);
    this.state.plans = this.state.plans.filter((x) => x.epicId !== epicId);
    this.state.dependencies = this.state.dependencies.filter((x) => x.epicId !== epicId);
    this.state.discussions = this.state.discussions.filter((x) => x.epicId !== epicId);
    this.state.checkIns = this.state.checkIns.filter((x) => x.epicId !== epicId);
    this.state.impediments = this.state.impediments.filter((x) => x.epicId !== epicId);
    return this._persist();
  }

  async upsertPlan(actor, plan, reason = '') {
    const epic = this._epic(plan.epicId);
    const q = this._quarter(plan.quarterId);
    if (q.phase === 'closed') throw new ValidationError('Quarter is closed');
    const existing = this.state.plans.find((p) => p.id === plan.id) || this.state.plans.find((p) => p.epicId === plan.epicId && p.quarterId === plan.quarterId);
    const rankChanged = existing ? plan.rank !== undefined && plan.rank !== existing.rank : plan.rank != null;
    const teamWrite = canWriteTeam(actor, epic.teamId);
    if (rankChanged) {
      if (!canRank(actor)) throw new PermissionError('Changing the strategic rank needs rank permission');
      if (!reason.trim()) throw new ValidationError('A reason is required to change the strategic rank');
    }
    if (!teamWrite && !(canRank(actor) && existing)) throw new PermissionError('You can only plan epics of your own team');
    if (!teamWrite && existing) {
      const other = Object.keys(plan).filter((k) => !['id', 'epicId', 'quarterId', 'rank'].includes(k) && plan[k] !== existing[k]);
      if (other.length) throw new PermissionError('Rank permission lets you change the strategic rank only');
    }
    if (plan.effortLow != null && plan.effortHigh != null && plan.effortHigh < plan.effortLow) throw new ValidationError('High estimate must be at least the low estimate');
    if (existing && isLockedPhase(q.phase) && !reason.trim()) {
      const changed = ['commitment', 'rank', 'effortLow', 'effortHigh'].some((k) => plan[k] !== undefined && plan[k] !== existing[k]);
      if (changed) throw new ValidationError('The quarter is locked: a reason is required for changes');
    }
    if (!existing && isLockedPhase(q.phase) && !reason.trim()) throw new ValidationError('The quarter is locked: a reason is required to add an epic');
    if (existing) {
      if (rankChanged) this._event(actor, 'rank_changed', 'plans', existing.id, q.id, reason, { rank: existing.rank }, { rank: plan.rank });
      if (plan.commitment !== undefined && plan.commitment !== existing.commitment) this._event(actor, 'commitment_changed', 'plans', existing.id, q.id, reason, { commitment: existing.commitment }, { commitment: plan.commitment });
      if ((plan.effortLow !== undefined && plan.effortLow !== existing.effortLow) || (plan.effortHigh !== undefined && plan.effortHigh !== existing.effortHigh)) {
        this._event(actor, 'effort_changed', 'plans', existing.id, q.id, reason, { effortLow: existing.effortLow, effortHigh: existing.effortHigh }, { effortLow: plan.effortLow ?? existing.effortLow, effortHigh: plan.effortHigh ?? existing.effortHigh });
      }
      Object.assign(existing, plan, { updatedAt: now() });
    } else {
      const created = { id: uid(), rank: null, effortLow: 0, effortHigh: 0, commitment: 'draft', confidence: 'medium', ...plan, updatedAt: now() };
      this.state.plans.push(created);
      this._event(actor, 'plan_added', 'plans', created.id, q.id, reason, null, { epicId: plan.epicId });
      if (plan.rank != null) this._event(actor, 'rank_changed', 'plans', created.id, q.id, reason, { rank: null }, { rank: plan.rank });
    }
    return this._persist();
  }
  async removePlan(actor, planId, reason = '') {
    const p = this.state.plans.find((x) => x.id === planId);
    if (!p) return this._persist();
    const e = this._epic(p.epicId);
    if (!canWriteTeam(actor, e.teamId)) throw new PermissionError('Not your team');
    this._guardPhase(p.quarterId, reason, 'remove an epic from the quarter');
    this.state.plans = this.state.plans.filter((x) => x.id !== planId);
    this._event(actor, 'plan_removed', 'plans', planId, p.quarterId, reason, { epicId: p.epicId }, null);
    return this._persist();
  }

  // Drag-and-drop / keyboard reorder of the strategic list (D28): ranks 1..n in the given order, one
  // rank_changed event for the plan that moved furthest (the dragged one), reason optional unless locked.
  async reorderPlans(actor, quarterId, orderedPlanIds, reason = '') {
    if (!canRank(actor)) throw new PermissionError('Changing the strategic rank needs rank permission');
    const q = this._quarter(quarterId);
    if (q.phase === 'closed') throw new ValidationError('Quarter is closed');
    if (isLockedPhase(q.phase) && !reason.trim()) throw new ValidationError('The quarter is locked: a reason is required to change the strategic rank');
    const plans = orderedPlanIds.map((id) => this.state.plans.find((p) => p.id === id && p.quarterId === quarterId));
    if (plans.some((p) => !p)) throw new ValidationError('Unknown plan in the new order');
    let moved = null; let maxShift = 0;
    plans.forEach((p, i) => { const shift = Math.abs((p.rank ?? plans.length + 1) - (i + 1)); if (shift > maxShift) { moved = p; maxShift = shift; } });
    if (!moved) return this._persist();
    const before = moved.rank; const after = plans.indexOf(moved) + 1;
    plans.forEach((p, i) => { if (p.rank !== i + 1) { p.rank = i + 1; p.updatedAt = now(); } });
    this._event(actor, 'rank_changed', 'plans', moved.id, quarterId, reason, { rank: before }, { rank: after });
    return this._persist();
  }

  // ── dependencies ───────────────────────────────────────────────────────────
  async addDependency(actor, dep) {
    const epic = this._epic(dep.epicId);
    if (!canWriteTeam(actor, epic.teamId)) throw new PermissionError('Only the requesting team can add an ask');
    if (dep.providerTeamId === epic.teamId) throw new ValidationError('A team cannot depend on itself');
    if (!dep.ask?.trim()) throw new ValidationError('Describe the ask');
    if ((dep.effortLow || 0) > (dep.effortHigh || 0)) throw new ValidationError('High estimate must be at least the low estimate');
    this._guardPhase(dep.quarterId, dep.reason, 'add an ask');
    const created = { id: uid(), refCode: this._ref('dependency'), requesterTeamId: epic.teamId, requesterName: epic.ownerName || actor.name, ifDeclined: '', neededBy: null, effortLow: 0, effortHigh: 0, grantedLow: null, grantedHigh: null, response: 'proposed', responseReason: '', deferredToQuarterId: null, respondedAt: null, createdAt: now(), ...dep };
    delete created.reason;
    this.state.dependencies.push(created);
    this._event(actor, 'dependency_added', 'dependencies', created.id, dep.quarterId, '', null, { ask: dep.ask });
    return this._persist();
  }
  async answerDependency(actor, depId, { response, reason = '', deferredToQuarterId = null, grantedLow = null, grantedHigh = null }) {
    const d = this.state.dependencies.find((x) => x.id === depId);
    if (!d) throw new ValidationError('Unknown dependency');
    if (!canWriteTeam(actor, d.providerTeamId)) throw new PermissionError('Only the provider team can answer');
    const q = this._quarter(d.quarterId);
    if (!phaseAllows(q.phase, 'answer')) throw new ValidationError(`Answers are open from the Negotiate phase until the quarter closes (now: ${q.phase})`);
    if (REASON_REQUIRED.has(response) && !reason.trim()) throw new ValidationError('A reason is required for this answer');
    if (response === 'deferred' && !deferredToQuarterId) throw new ValidationError('Choose the quarter to defer to');
    if (response === 'partial') {
      if (!(grantedHigh > 0)) throw new ValidationError('Say how much you can do (granted person-weeks)');
      grantedLow = grantedLow ?? 0;
      if (grantedLow > grantedHigh) throw new ValidationError('Granted low cannot exceed granted high');
      if (grantedHigh > d.effortHigh) throw new ValidationError('Granted effort cannot exceed the ask');
    }
    this._event(actor, 'dependency_answered', 'dependencies', d.id, d.quarterId, reason, { response: d.response }, { response, grantedLow, grantedHigh });
    Object.assign(d, { response, responseReason: reason, deferredToQuarterId: response === 'deferred' ? deferredToQuarterId : null,
      grantedLow: response === 'partial' ? grantedLow : null, grantedHigh: response === 'partial' ? grantedHigh : null, respondedAt: response === 'proposed' ? null : now() });
    // A priority call is by definition a discussion item for the session (review: coach).
    if (response === 'needs_priority_call' && !this.state.discussions.some((x) => x.depId === d.id && x.status === 'open')) {
      this.state.discussions.push({ id: uid(), quarterId: d.quarterId, epicId: d.epicId, depId: d.id, reason: `Priority call needed on ${d.refCode}: ${reason}`, ownerName: actor.name, timeboxMin: 10, status: 'open', outcome: '', createdAt: now() });
    }
    return this._persist();
  }
  async acknowledgeDependency(actor, depId) {
    const d = this.state.dependencies.find((x) => x.id === depId);
    if (!d) throw new ValidationError('Unknown dependency');
    if (!canWriteTeam(actor, d.requesterTeamId)) throw new PermissionError('Only the requesting team can acknowledge an answer');
    d.acknowledgedAt = now();
    this._event(actor, 'dependency_acknowledged', 'dependencies', d.id, d.quarterId, '', null, { response: d.response });
    return this._persist();
  }
  async updateDependency(actor, depId, patch) {
    const d = this.state.dependencies.find((x) => x.id === depId);
    if (!d) throw new ValidationError('Unknown dependency');
    if (!canWriteTeam(actor, d.requesterTeamId)) throw new PermissionError('Only the requesting team can edit the ask');
    const { reason, ...rest } = patch;
    this._guardPhase(d.quarterId, reason, 'edit an ask');
    const next = { ...d, ...rest };
    if ((next.effortLow || 0) > (next.effortHigh || 0)) throw new ValidationError('Check the effort estimate');
    const effortChanged = next.effortHigh !== d.effortHigh || next.effortLow !== d.effortLow || next.ask !== d.ask;
    this._event(actor, 'dependency_edited', 'dependencies', d.id, d.quarterId, reason, { ask: d.ask, effortLow: d.effortLow, effortHigh: d.effortHigh }, { ask: next.ask, effortLow: next.effortLow, effortHigh: next.effortHigh });
    Object.assign(d, rest);
    // An answered ask whose scope changed goes back to the provider for a new answer.
    if (effortChanged && d.response !== 'proposed') { d.response = 'proposed'; d.responseReason = ''; d.respondedAt = null; d.grantedLow = null; d.grantedHigh = null; d.resentAt = now(); }
    return this._persist();
  }
  async deleteDependency(actor, depId, reason = '') {
    const d = this.state.dependencies.find((x) => x.id === depId);
    if (d && !canWriteTeam(actor, d.requesterTeamId)) throw new PermissionError('Only the requesting team can remove the ask');
    if (d) { this._guardPhase(d.quarterId, reason, 'remove an ask'); this._event(actor, 'dependency_removed', 'dependencies', d.id, d.quarterId, reason, { ask: d.ask, response: d.response }, null); }
    this.state.dependencies = this.state.dependencies.filter((x) => x.id !== depId);
    return this._persist();
  }

  // ── session ────────────────────────────────────────────────────────────────
  async setPhase(actor, quarterId, phase, reason = '') {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin (facilitator) can change the phase');
    const q = this._quarter(quarterId);
    const from = PHASES.findIndex((p) => p.id === q.phase);
    const to = PHASES.findIndex((p) => p.id === phase);
    if (to < from && !reason.trim()) throw new ValidationError('Rewinding a phase requires a reason');
    if (to > from + 1) throw new ValidationError(`Phases advance one step at a time (next: ${PHASES[from + 1].label})`);
    if (phase === 'locked' && this.state.settings.voteBlocksLock) {
      const low = this.state.votes.filter((v) => v.quarterId === quarterId && v.vote <= 2);
      if (low.length) throw new ValidationError(`${low.length} team(s) voted 2 or lower; resolve before locking (setting: low vote blocks lock)`);
    }
    if (phase === 'locked' && !q.baseline && from < to) {
      // Locking with open items needs an explicit facilitator override (review: coach).
      const open = readiness(this.state, quarterId).filter((r) => !r.ready);
      if (open.length && !reason.trim()) throw new ValidationError(`${open.length} team(s) not ready (${open.map((r) => r.team.name).join(', ')}). Lock anyway by giving a reason.`);
    }
    if (phase === 'locked' && from < to) {
      // Always a fresh baseline when (re)locking after a rewind; the previous one is kept in the event log.
      if (q.baseline) this._event(actor, 'baseline_replaced', 'quarters', q.id, q.id, reason, { takenAt: q.baseline.takenAt }, null);
      q.baseline = buildBaseline(this.state, quarterId); q.lockedAt = now();
    }
    if (to < from && to <= PHASES.findIndex((p) => p.id === 'vote')) q.votesRevealed = false;
    this._event(actor, 'phase_changed', 'quarters', q.id, q.id, reason, { phase: q.phase }, { phase });
    q.phase = phase;
    return this._persist();
  }
  async castVote(actor, teamId, quarterId, vote, reason = '') {
    if (!canWriteTeam(actor, teamId)) throw new PermissionError('You can only vote for your own team');
    if (vote <= 3 && !reason.trim()) throw new ValidationError('A reason is required for a vote of 3 or lower');
    const q = this._quarter(quarterId);
    if (!phaseAllows(q.phase, 'vote')) throw new ValidationError('Voting is open in the Vote phase (and for a re-vote while locked)');
    const existing = this.state.votes.find((v) => v.teamId === teamId && v.quarterId === quarterId);
    if (existing) Object.assign(existing, { vote, reason, votedAt: now() });
    else this.state.votes.push({ id: uid(), teamId, quarterId, vote, reason, votedAt: now() });
    this._event(actor, 'vote_cast', 'votes', teamId, quarterId, reason, null, { vote });
    return this._persist();
  }
  async revealVotes(actor, quarterId) {
    if (!isAdmin(actor)) throw new PermissionError('Only the facilitator reveals votes');
    const q = this._quarter(quarterId);
    q.votesRevealed = true;
    this._event(actor, 'votes_revealed', 'quarters', q.id, q.id, '', null, null);
    return this._persist();
  }
  async raiseDiscussion(actor, item) {
    if (!isPlanner(actor)) throw new PermissionError('Viewers cannot raise discussion items');
    if (!item.reason?.trim()) throw new ValidationError('Say why this needs discussion');
    this.state.discussions.push({ id: uid(), ownerName: actor.name, timeboxMin: 10, status: 'open', outcome: '', createdAt: now(), depId: null, epicId: null, teamId: null, ...item });
    return this._persist();
  }
  async resolveDiscussion(actor, id, outcome) {
    if (!isPlanner(actor)) throw new PermissionError('Viewers cannot resolve discussion items');
    if (!outcome?.trim()) throw new ValidationError('An outcome is required to resolve');
    const d = this.state.discussions.find((x) => x.id === id);
    Object.assign(d, { status: 'resolved', outcome, resolvedAt: now() });
    this._event(actor, 'discussion_resolved', 'discussions', id, d.quarterId, outcome, null, null);
    return this._persist();
  }

  // ── in-quarter ─────────────────────────────────────────────────────────────
  async addCheckIn(actor, checkIn) {
    const e = this._epic(checkIn.epicId);
    if (!canWriteTeam(actor, e.teamId)) throw new PermissionError('Only the epic team can check in');
    if (!checkIn.confidence) throw new ValidationError('Pick a confidence');
    this.state.checkIns.push({ id: uid(), note: '', authorName: actor.name, createdAt: now(), ...checkIn });
    return this._persist();
  }
  async upsertImpediment(actor, imp) {
    if (!isPlanner(actor)) throw new PermissionError('Viewers cannot raise impediments');
    const existing = imp.id && this.state.impediments.find((x) => x.id === imp.id);
    if ((!existing || imp.title !== undefined) && !imp.title?.trim()) throw new ValidationError('Title is required');
    if (!existing && !imp.epicId && !imp.depId) throw new ValidationError('Link the impediment to an epic');
    if (existing) Object.assign(existing, imp);
    else this.state.impediments.push({ id: uid(), refCode: this._ref('impediment'), kind: 'impediment', ownerName: actor.name, status: 'open', roam: null, raisedAt: now(), resolvedAt: null, depId: null, ...imp });
    return this._persist();
  }
  async resolveImpediment(actor, id) {
    if (!isPlanner(actor)) throw new PermissionError('Viewers cannot resolve impediments');
    const i = this.state.impediments.find((x) => x.id === id);
    Object.assign(i, { status: 'resolved', resolvedAt: now(), roam: i.kind === 'risk' ? 'resolved' : null });
    return this._persist();
  }

  // ── setup ──────────────────────────────────────────────────────────────────
  async upsertCapacity(actor, cap) {
    if (!canWriteTeam(actor, cap.teamId)) throw new PermissionError('Not your team');
    const { reason, ...capFields } = cap; cap = capFields;
    this._guardPhase(cap.quarterId, reason, 'change capacity');
    const existing = this.state.capacity.find((c) => c.teamId === cap.teamId && c.quarterId === cap.quarterId);
    if (existing) { this._event(actor, 'capacity_changed', 'capacity', existing.id, cap.quarterId, reason, { ...existing }, { ...existing, ...cap }); Object.assign(existing, cap); }
    // eslint-disable-next-line no-unused-vars
    else this.state.capacity.push({ id: uid(), headcount: 0, weeks: 13, focusFactor: 0.65, absenceWeeks: 0, reservePct: 20, ...cap });
    return this._persist();
  }
  async upsertTeam(actor, team) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    const existing = team.id && this.state.teams.find((t) => t.id === team.id);
    if (existing) Object.assign(existing, team); else this.state.teams.push({ id: uid(), ...team });
    return this._persist();
  }
  async deleteTeam(actor, id) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    if (this.state.epics.some((e) => e.teamId === id)) throw new ValidationError('Move or delete the team\'s epics first');
    if (this.state.dependencies.some((d) => d.providerTeamId === id)) throw new ValidationError('Other teams still have asks for this team; remove or re-route them first');
    (this.state.members || []).forEach((m) => { if (m.teamId === id) m.teamId = null; });
    this.state.teams = this.state.teams.filter((t) => t.id !== id);
    this.state.capacity = this.state.capacity.filter((c) => c.teamId !== id);
    return this._persist();
  }
  async upsertTheme(actor, theme) {
    if (!canRank(actor)) throw new PermissionError('Themes need rank permission');
    const existing = theme.id && this.state.themes.find((t) => t.id === theme.id);
    if (existing) Object.assign(existing, theme); else this.state.themes.push({ id: uid(), position: this.state.themes.length, description: '', ...theme });
    return this._persist();
  }
  async deleteTheme(actor, id) {
    if (!canRank(actor)) throw new PermissionError('Themes need rank permission');
    this.state.themes = this.state.themes.filter((t) => t.id !== id);
    this.state.epics.forEach((e) => { if (e.themeId === id) e.themeId = null; });
    return this._persist();
  }
  async upsertQuarter(actor, quarter) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    const existing = quarter.id && this.state.quarters.find((q) => q.id === quarter.id);
    if (existing) Object.assign(existing, quarter);
    else {
      if (this.state.quarters.some((q) => q.year === quarter.year && q.q === quarter.q)) throw new ValidationError('Quarter exists');
      this.state.quarters.push({ id: uid(), phase: 'prep', baseline: null, ...quarter });
    }
    return this._persist();
  }
  async updateSettings(actor, patch) {
    const onlyLanguage = Object.keys(patch).every((k) => k === 'language');
    if (!onlyLanguage && !isAdmin(actor)) throw new PermissionError('Admin only');
    Object.assign(this.state.settings, patch);
    return this._persist();
  }

  // ── members and invitations (docs/design.md section 18) ────────────────────
  // Demo mode has no e-mail: an invitation is accepted at once and the person appears in "Viewing as".
  async inviteMember(actor, inv) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can invite people');
    const email = normaliseEmail(inv.email);
    const teamId = checkRole(inv.role, inv.teamId, this.state.teams);
    const list = (this.state.invitations ||= []);
    const existing = list.find((i) => i.email === email);
    if (existing && !existing.acceptedAt) throw new ValidationError('This e-mail address has already been invited');
    if (existing) list.splice(list.indexOf(existing), 1); // re-invite after the person was removed
    const displayName = String(inv.displayName || '').trim();
    const invitation = { id: uid(), email, role: inv.role, teamId, canRank: !!inv.canRank, displayName, invitedBy: actor.id, createdAt: now(), acceptedAt: now() };
    list.push(invitation);
    const member = { id: uid(), name: displayName || email.split('@')[0], title: email, email, role: inv.role, teamId, canRank: !!inv.canRank };
    this.state.members.push(member);
    this._event(actor, 'member_invited', 'invitations', invitation.id, null, '', null, { email, role: inv.role, teamId, canRank: !!inv.canRank });
    return this._persist();
  }
  async updateMember(actor, userId, patch) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can change roles');
    const m = this.state.members.find((x) => x.id === userId);
    const role = patch.role ?? m?.role;
    checkMemberChange(actor, this.state.members, m, role);
    const teamId = checkRole(role, patch.teamId !== undefined ? patch.teamId : m.teamId, this.state.teams);
    const next = { role, teamId, canRank: patch.canRank !== undefined ? !!patch.canRank : m.canRank };
    if (patch.displayName !== undefined) {
      if (!String(patch.displayName).trim()) throw new ValidationError('Name is required');
      next.name = String(patch.displayName).trim();
    }
    this._event(actor, 'member_updated', 'memberships', userId, null, '', { role: m.role, teamId: m.teamId, canRank: m.canRank }, { role: next.role, teamId: next.teamId, canRank: next.canRank });
    Object.assign(m, next);
    return this._persist();
  }
  async removeMember(actor, userId) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can remove people');
    const m = this.state.members.find((x) => x.id === userId);
    checkMemberChange(actor, this.state.members, m, null);
    this.state.members = this.state.members.filter((x) => x.id !== userId);
    this._event(actor, 'member_removed', 'memberships', userId, null, '', { role: m.role, teamId: m.teamId, canRank: m.canRank }, null);
    return this._persist();
  }
  async revokeInvitation(actor, invitationId) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can revoke invitations');
    const inv = (this.state.invitations || []).find((i) => i.id === invitationId);
    if (!inv) throw new ValidationError('Unknown invitation');
    this.state.invitations = this.state.invitations.filter((i) => i.id !== invitationId);
    this._event(actor, 'invitation_revoked', 'invitations', invitationId, null, '', { email: inv.email }, null);
    return this._persist();
  }
  // No e-mail in demo mode; the UI shows a notice instead.
  async sendSignInLink(actor, email) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can send sign-in links');
    const e = normaliseEmail(email);
    if (!(this.state.invitations || []).some((i) => i.email === e)) throw new ValidationError('Invite this e-mail address first');
    return { sent: false, demo: true };
  }

  // ── integration import (D19-D22) ───────────────────────────────────────────
  // externalEpics: normalised ExternalEpic[]; teamMapping: { [teamHint]: teamId }
  async importExternalEpics(actor, externalEpics, teamMapping) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    let created = 0; let updated = 0; const suggestions = [];
    const byExt = new Map(this.state.epics.filter((e) => e.externalId).map((e) => [`${e.externalSource}:${e.externalId}`, e]));
    for (const x of externalEpics) {
      const teamId = teamMapping[x.teamHint];
      if (!teamId) continue;
      const key = `${x.source}:${x.externalId}`;
      const existing = byExt.get(key);
      if (existing) { Object.assign(existing, { title: x.title, externalUrl: x.url, externalSyncedAt: now(), externalState: x.state }); updated += 1; }
      else {
        const e = { id: uid(), refCode: this._ref('epic'), teamId, themeId: null, title: x.title, description: '', ownerName: x.ownerName || '', label: '', regulatory: false, regulatoryDeadline: null, externalSource: x.source, externalId: x.externalId, externalUrl: x.url, externalSyncedAt: now(), externalState: x.state };
        this.state.epics.push(e); byExt.set(key, e); created += 1;
      }
    }
    // Dependency suggestions from links between imported epics of different teams (AC G5)
    for (const x of externalEpics) {
      const from = byExt.get(`${x.source}:${x.externalId}`);
      for (const linked of x.linkedExternalIds || []) {
        const to = byExt.get(`${x.source}:${linked}`);
        if (from && to && from.teamId !== to.teamId) suggestions.push({ fromEpicId: from.id, toTeamId: to.teamId, toEpicId: to.id });
      }
    }
    this._event(actor, 'import_run', 'integration', null, null, '', null, { created, updated });
    this._persist();
    return { created, updated, suggestions };
  }
}
