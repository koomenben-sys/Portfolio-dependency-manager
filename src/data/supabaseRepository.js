// Supabase implementation of the repository contract (docs/design.md D12, schema db/migrations/001-008).
// Live-tested against the owner's project on 2026-10-17; differences from the mock adapter are listed in
// docs/design.md section 16 ("Supabase mode").
//
// Notes:
// * Column mapping: camelCase in the app <-> snake_case in Postgres (toRow / fromRow). Plans expose
//   strategic_rank as `rank`; discussion items and impediments expose dependency_id as `depId`.
// * Authorisation is enforced by RLS + triggers. PostgREST updates zero rows (without an error) when RLS
//   denies an UPDATE, so every command also mirrors the mock's JS checks: same error text in both modes.
// * Phase rules (closed quarter is read-only, locked quarter needs a reason) exist only in JS, in both adapters.
// * Reasons: the triggers read current_setting('app.reason'); supabase-js cannot set a GUC, so writes that
//   carry a reason go through the RPCs update_with_reason / delete_with_reason (005). Events the triggers do
//   not write (plan_added, dependency_added/edited/acknowledged, vote_cast, ...) are inserted by _event().
import { supabase } from '../lib/supabase';
import { buildBaseline, readiness, phaseAllows, ASKS_FIXED, ANSWERS_FIXED } from '../domain/plan';
import { PHASE_INDEX, isLockedPhase, REASON_REQUIRED } from '../domain/model';
import { checkTheme, isHttpUrl } from '../domain/value';
import { sizePatch, checkCertainty, checkSizeMap, checkCadence, SIGNALS, DEFAULT_SIZE_MAP, DEFAULT_CADENCE, DEFAULT_ESCALATION_DAYS, checkImpedimentStatus, checkEscalationDays, nextQuarter } from '../domain/rhythm';
import { PermissionError, ValidationError, canWriteTeam, isAdmin, canRank, isPlanner, canChangeImpediment, normaliseEmail, checkRole, checkMemberChange, checkCapacity } from './repository';

const snake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const fromRow = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]));
const toRow = (o, orgId) => ({ ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v])), org_id: orgId });
const now = () => new Date().toISOString();
const trim = (s) => String(s || '').trim();
// PostgREST returns rows in no particular order; the mock keeps insertion order, so sort by creation time.
const byCreated = (k) => (a, b) => String(a[k] || '').localeCompare(String(b[k] || '')) || String(a.refCode || '').localeCompare(String(b.refCode || ''));

const TABLES = {
  teams: 'teams', themes: 'themes', quarters: 'quarters', capacity: 'team_capacity', epics: 'epics', plans: 'epic_plans',
  dependencies: 'dependencies', votes: 'confidence_votes', discussions: 'discussion_items', checkIns: 'check_ins',
  impediments: 'impediments', events: 'plan_events',
};
// Realtime (008): every table load() reads, filtered on org_id; RLS decides which rows reach the subscriber.
const REALTIME_TABLES = [...Object.values(TABLES), 'memberships', 'org_settings', 'invitations'];
const REALTIME_DEBOUNCE_MS = 400;
// Trigger-written delete events (005 log_delete) use the table name; the app uses the mock's names.
const EVENT_ACTIONS = { epic_plans_removed: 'plan_removed', dependencies_removed: 'dependency_removed' };
const DEFAULT_SETTINGS = {
  language: 'nl', orgName: '', unitLabel: 'team', capacityUnit: 'person-weeks', fiscalYearStartMonth: 1, staleDays: 14, noResponseDays: 5,
  voteBlocksLock: false, capacityDefaults: { weeks: 13, focusFactor: 0.65, reservePct: 20 }, modules: false, valueModel: 'none', skin: 'zakelijk',
  sizeMap: { ...DEFAULT_SIZE_MAP }, cadence: { ...DEFAULT_CADENCE }, impedimentEscalationDays: DEFAULT_ESCALATION_DAYS,
};
// Postgres error texts that users should not have to decode.
function friendly(message) {
  if (/row-level security/i.test(message)) return 'Not allowed for your role or team';
  if (/duplicate key.*quarters_org_id_year_q/i.test(message)) return 'Quarter exists';
  if (/duplicate key.*teams_org_id_name/i.test(message)) return 'A team with that name exists';
  if (/duplicate key.*themes_org_id_name/i.test(message)) return 'A theme with that name exists';
  if (/duplicate key.*invitations_org_id_email/i.test(message)) return 'This e-mail address has already been invited';
  if (/_size_chk/i.test(message)) return 'Unknown size';
  if (/dependencies_certainty_chk/i.test(message)) return 'Unknown certainty';
  if (/dependencies_signal_chk/i.test(message)) return 'Unknown signal';
  return message;
}

export class SupabaseRepository {
  constructor() { this.orgId = null; this.state = null; this.settings = { ...DEFAULT_SETTINGS }; }
  _throw(error) { if (error) throw new ValidationError(friendly(error.message)); }

  // ── plumbing ───────────────────────────────────────────────────────────────
  async _org() {
    if (this.orgId) return this.orgId;
    const { data, error } = await supabase.from('memberships').select('org_id').limit(1).maybeSingle();
    if (error || !data) throw new Error('No organisation membership for this user. Run db/migrations/004_bootstrap.sql.');
    this.orgId = data.org_id;
    return this.orgId;
  }
  async _all(table) {
    const { data, error } = await supabase.from(table).select('*').eq('org_id', await this._org());
    if (error) throw new Error(`${table}: ${error.message}`);
    return data.map(fromRow);
  }
  // Fresh single row (phase and team checks must not rely on a stale screen).
  async _row(table, id, label) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    this._throw(error);
    if (!data) throw new ValidationError(`Unknown ${label || table}`);
    return fromRow(data);
  }
  _epic(id) { return this._row('epics', id, 'epic'); }
  _dep(id) { return this._row('dependencies', id, 'dependency'); }
  _quarter(id) { return this._row('quarters', id, 'quarter'); }
  async _guardPhase(quarterId, reason, what) {
    const q = await this._quarter(quarterId);
    if (q.phase === 'closed') throw new ValidationError('Quarter is closed');
    if (isLockedPhase(q.phase) && !trim(reason)) throw new ValidationError(`The quarter is locked: a reason is required to ${what}`);
    return q;
  }
  // Asks are fixed once the plan is locked (item J, D83): no add, edit or remove in Uitvoering / Afgesloten.
  async _guardAsk(quarterId, reason, what) {
    const q = await this._quarter(quarterId);
    if (isLockedPhase(q.phase)) throw new PermissionError(ASKS_FIXED);
    return this._guardPhase(quarterId, reason, what);
  }
  async _withReason(table, id, patch, reason) {
    const { error } = await supabase.rpc('update_with_reason', { _table: table, _id: id, _patch: patch, _reason: reason || '' });
    this._throw(error);
  }
  async _ref(kind) {
    const { data, error } = await supabase.rpc('next_ref', { _org: await this._org(), _kind: kind });
    this._throw(error);
    return data;
  }
  // History is best-effort: the write itself has already succeeded when this runs.
  async _event(actor, action, entity, entityId, quarterId, reason, before, after) {
    const { error } = await supabase.from('plan_events').insert({
      org_id: await this._org(), actor_id: actor?.id || null, action, entity, entity_id: entityId || null, quarter_id: quarterId || null,
      reason: reason || '', before: before ?? null, after: after ?? null,
    });
    if (error) console.warn(`plan_events (${action}): ${error.message}`);
  }
  async _members(org) {
    // member_directory (006) shows every member's display name to every member; fall back to the own row (002).
    let { data, error } = await supabase.from('member_directory').select('*').eq('org_id', org);
    if (error) ({ data } = await supabase.from('memberships').select('*').eq('org_id', org));
    return (data || []).map(fromRow).map((m) => ({ id: m.userId, name: m.displayName || m.userId, title: '', role: m.role, teamId: m.teamId, canRank: m.canRank }));
  }

  // Volgen (011): RLS returns the current user's rows only; a database without 011 gives an empty list.
  async _follows(org) {
    const { data, error } = await supabase.from('epic_follows').select('epic_id').eq('org_id', org);
    if (error) return [];
    return data.map((r) => r.epic_id);
  }
  // Admins only (RLS, 007); others and databases without 007 get an empty list.
  async _invitations(org) {
    const { data, error } = await supabase.from('invitations').select('*').eq('org_id', org);
    if (error) return [];
    return data.map(fromRow).sort(byCreated('createdAt'));
  }

  async load() {
    const org = await this._org();
    const [rows, members, invitations, follows, osRes, orgRes] = await Promise.all([
      Promise.all(Object.values(TABLES).map((t) => this._all(t))),
      this._members(org),
      this._invitations(org),
      this._follows(org),
      supabase.from('org_settings').select('*').eq('org_id', org).maybeSingle(),
      supabase.from('organisations').select('name').eq('id', org).maybeSingle(),
    ]);
    const [teams, themes, quarters, capacity, epics, plans, dependencies, votes, discussions, checkIns, impediments, events] = rows;
    const names = new Map(members.map((m) => [m.id, m.name]));
    const os = osRes.data;
    const personalLanguage = this.settings.personalLanguage;
    this.settings = {
      ...DEFAULT_SETTINGS, orgName: orgRes.data?.name || '', ...(os?.profile || {}),
      ...(os ? { staleDays: os.stale_days, voteBlocksLock: os.vote_blocks_lock } : {}),
    };
    // Wizard (PR #16): an organisation with teams and a quarter counts as set up unless the profile says otherwise.
    if (this.settings.setupComplete === undefined) this.settings.setupComplete = teams.length > 0 && quarters.length > 0;
    // Language is a personal choice for non-admins (they cannot write org_settings); kept for the session.
    if (personalLanguage) { this.settings.language = personalLanguage; this.settings.personalLanguage = personalLanguage; }
    this.state = {
      teams: teams.sort(byCreated('createdAt')),
      themes: themes.sort((a, b) => a.position - b.position),
      quarters: quarters.sort((a, b) => a.year * 4 + a.q - (b.year * 4 + b.q)),
      // no surrogate key in SQL (PK = org, team, quarter); numeric columns arrive as strings, Release B fields may be absent before 010
      capacity: capacity.map((c) => ({ id: `${c.teamId}:${c.quarterId}`, ...c, headcount: Number(c.headcount) || 0, fteVacant: Number(c.fteVacant) || 0, absenceWeeks: Number(c.absenceWeeks) || 0, reservePct: Number(c.reservePct) || 0, weeks: Number(c.weeks) || 13, focusFactor: Number(c.focusFactor) || 1 })),
      epics: epics.sort(byCreated('createdAt')),
      plans: plans.map((p) => ({ ...p, rank: p.strategicRank, effortLow: Number(p.effortLow) || 0, effortHigh: Number(p.effortHigh) || 0, size: p.size ?? null, delivered: !!p.delivered })),
      dependencies: dependencies.map((d) => ({ ...d, effortLow: Number(d.effortLow) || 0, effortHigh: Number(d.effortHigh) || 0, size: d.size ?? null, certainty: d.certainty || 'medium', signal: d.signal || 'on_track', signalNote: d.signalNote || '', signalAt: d.signalAt ?? null, confirmedAt: d.confirmedAt ?? null })).sort(byCreated('createdAt')),
      votes: votes.map((v) => ({ id: `${v.teamId}:${v.quarterId}`, ...v })),
      discussions: discussions.map((d) => ({ ...d, depId: d.dependencyId })).sort(byCreated('createdAt')),
      checkIns: checkIns.map((c) => ({ ...c, authorName: names.get(c.authorId) || '' })).sort(byCreated('createdAt')),
      impediments: impediments.map((i) => ({ ...i, depId: i.dependencyId, reporterId: i.reporterId ?? null, actionOwnerId: i.actionOwnerId ?? null, actionOwnerName: i.actionOwnerName || '' })).sort(byCreated('raisedAt')),
      events: events
        .map((e) => ({ ...e, id: String(e.id), actorName: e.actorId ? (names.get(e.actorId) || 'former member') : '', action: EVENT_ACTIONS[e.action] || e.action }))
        .sort((a, b) => a.at.localeCompare(b.at)),
      members,
      invitations,
      follows,
      settings: { ...this.settings },
    };
    return this.state;
  }

  // Live updates through Supabase Realtime (008). Events are debounced: one write fires several
  // (row + plan_events), and a reload reads every table. onStatus('live') once subscribed, ('error') when
  // the channel fails or closes; PlanContext then polls instead. Returns an unsubscribe function.
  subscribe(onState, onStatus) {
    let channel = null; let timer = null; let closed = false;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!closed) this.load().then(onState).catch(() => {}); }, REALTIME_DEBOUNCE_MS);
    };
    this._org().then((org) => {
      if (closed) return;
      channel = supabase.channel(`plan-${org}`);
      for (const table of REALTIME_TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${org}` }, reload);
      channel.subscribe((status) => {
        if (closed) return;
        if (status === 'SUBSCRIBED') onStatus?.('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus?.('error');
      });
    }).catch(() => { if (!closed) onStatus?.('error'); });
    return () => { closed = true; clearTimeout(timer); if (channel) supabase.removeChannel(channel); };
  }

  // ── epics and plans ────────────────────────────────────────────────────────
  async upsertEpic(actor, epic) {
    const org = await this._org();
    const existing = epic.id ? await this._epic(epic.id) : null;
    const teamId = epic.teamId ?? existing?.teamId;
    if (!canWriteTeam(actor, teamId) || (existing && !canWriteTeam(actor, existing.teamId))) throw new PermissionError('You can only edit epics of your own team');
    if ((!existing || epic.title !== undefined) && !epic.title?.trim()) throw new ValidationError('Title is required');
    if (epic.onePagerUrl && !isHttpUrl(epic.onePagerUrl)) throw new ValidationError('Enter a link that starts with http(s)://');
    if (epic.externalUrl && !isHttpUrl(epic.externalUrl)) throw new ValidationError('Enter a link that starts with http(s)://');
    if (epic.themeId && !(await this._all('themes')).some((t) => t.id === epic.themeId)) throw new ValidationError('Unknown goal');
    const { id, ...rest } = epic;
    if (existing?.externalSource) { for (const k of ['title', 'externalSource', 'externalId', 'externalUrl']) delete rest[k]; } // mastered by the source (D20)
    const row = toRow(rest, org);
    if (existing) {
      delete row.org_id;
      // The 005 trigger re-routes the epic's asks on a team change and refuses a self-dependency.
      // PostgREST reports no error when RLS filters the row away: check that a row came back.
      if (Object.keys(row).length) {
        const { data, error } = await supabase.from('epics').update(row).eq('id', id).select('id');
        this._throw(error);
        if (!data?.length) throw new PermissionError('Not allowed for your role or team');
      }
    } else {
      row.ref_code = await this._ref('epic');
      const { data, error } = await supabase.from('epics').insert(row).select('id').single();
      this._throw(error);
      this.lastCreatedEpicId = data.id;
    }
    return this.load();
  }
  async createEpic(actor, epic) {
    const s = await this.upsertEpic(actor, { ...epic, id: undefined });
    return s.epics.find((e) => e.id === this.lastCreatedEpicId);
  }
  async deleteEpic(actor, epicId) {
    const e = await this._epic(epicId);
    if (!canWriteTeam(actor, e.teamId)) throw new PermissionError('Not your team');
    // FK cascades remove plans, asks, discussion items, check-ins and impediments; plan_events rows stay.
    this._throw((await supabase.from('epics').delete().eq('id', epicId)).error);
    return this.load();
  }

  async upsertPlan(actor, plan, reason = '') {
    const org = await this._org();
    const epic = await this._epic(plan.epicId);
    const q = await this._quarter(plan.quarterId);
    if (q.phase === 'closed') throw new ValidationError('Quarter is closed');
    const { data: ex, error: exErr } = await supabase.from('epic_plans').select('*').eq('epic_id', plan.epicId).eq('quarter_id', plan.quarterId).maybeSingle();
    this._throw(exErr);
    const existing = ex ? { ...fromRow(ex), rank: ex.strategic_rank } : null;
    const rankChanged = existing ? plan.rank !== undefined && plan.rank !== existing.rank : plan.rank != null;
    const teamWrite = canWriteTeam(actor, epic.teamId);
    if (rankChanged) {
      if (!canRank(actor)) throw new PermissionError('Changing the strategic rank needs rank permission');
      if (!trim(reason)) throw new ValidationError('A reason is required to change the strategic rank');
    }
    if (!teamWrite && !(canRank(actor) && existing)) throw new PermissionError('You can only plan epics of your own team');
    if (!teamWrite && existing) {
      const other = Object.keys(plan).filter((k) => !['id', 'epicId', 'quarterId', 'rank'].includes(k) && plan[k] !== existing[k]);
      if (other.length) throw new PermissionError('Rank permission lets you change the strategic rank only');
    }
    // Release B (D50): a size writes the organisation's range into the effort fields; clearing it keeps the numbers.
    if (plan.size !== undefined) plan = { ...plan, ...sizePatch(this.settings, plan.size, ValidationError) };
    const low = plan.effortLow ?? existing?.effortLow ?? 0; const high = plan.effortHigh ?? existing?.effortHigh ?? 0;
    if (high < low) throw new ValidationError('High estimate must be at least the low estimate');
    if (existing && isLockedPhase(q.phase) && !trim(reason)) {
      const changed = ['commitment', 'rank', 'effortLow', 'effortHigh', 'size'].some((k) => plan[k] !== undefined && plan[k] !== existing[k]);
      if (changed) throw new ValidationError('The quarter is locked: a reason is required for changes');
    }
    if (!existing && isLockedPhase(q.phase) && !trim(reason)) throw new ValidationError('The quarter is locked: a reason is required to add an epic');

    const { id, rank, ...rest } = plan;
    const row = toRow(rest, org);
    if (rank !== undefined) row.strategic_rank = rank;
    if (existing) {
      const { org_id, epic_id, quarter_id, ...patch } = row; // keys never change
      if (!Object.keys(patch).length) return this.load();
      // The 005 trigger logs rank / commitment / effort changes and reads the reason from app.reason.
      if (trim(reason)) await this._withReason('epic_plans', existing.id, patch, reason);
      else this._throw((await supabase.from('epic_plans').update(patch).eq('id', existing.id)).error);
    } else {
      const { data, error } = await supabase.from('epic_plans').insert(row).select('id').single();
      this._throw(error);
      await this._event(actor, 'plan_added', 'epic_plans', data.id, q.id, reason, null, { epicId: plan.epicId });
      if (rank != null) await this._event(actor, 'rank_changed', 'epic_plans', data.id, q.id, reason, { rank: null }, { rank });
    }
    return this.load();
  }
  async removePlan(actor, planId, reason = '') {
    const { data: p } = await supabase.from('epic_plans').select('*').eq('id', planId).maybeSingle();
    if (!p) return this.load();
    const epic = await this._epic(p.epic_id);
    if (!canWriteTeam(actor, epic.teamId)) throw new PermissionError('Not your team');
    await this._guardPhase(p.quarter_id, reason, 'remove an epic from the quarter');
    this._throw((await supabase.rpc('delete_with_reason', { _table: 'epic_plans', _id: planId, _reason: reason })).error);
    return this.load();
  }

  // Reorder (D28). The 005 trigger logs rank_changed per updated row and insists on a reason, so an empty
  // reason becomes 'Herprioritering'; only rows whose rank actually changes are written.
  async reorderPlans(actor, quarterId, orderedPlanIds, reason = '') {
    if (!canRank(actor)) throw new PermissionError('Changing the strategic rank needs rank permission');
    const q = await this._quarter(quarterId);
    if (q.phase === 'closed') throw new ValidationError('Quarter is closed');
    if (isLockedPhase(q.phase) && !trim(reason)) throw new ValidationError('The quarter is locked: a reason is required to change the strategic rank');
    const { data, error } = await supabase.from('epic_plans').select('id, strategic_rank').eq('quarter_id', quarterId).in('id', orderedPlanIds);
    this._throw(error);
    const current = new Map((data || []).map((r) => [r.id, r.strategic_rank]));
    if (orderedPlanIds.some((id) => !current.has(id))) throw new ValidationError('Unknown plan in the new order');
    for (let i = 0; i < orderedPlanIds.length; i += 1) {
      const id = orderedPlanIds[i];
      if (current.get(id) !== i + 1) await this._withReason('epic_plans', id, { strategic_rank: i + 1 }, trim(reason) || 'Herprioritering');
    }
    return this.load();
  }

  // ── dependencies ───────────────────────────────────────────────────────────
  async addDependency(actor, dep) {
    const org = await this._org();
    const epic = await this._epic(dep.epicId);
    if (!canWriteTeam(actor, epic.teamId)) throw new PermissionError('Only the requesting team can add an ask');
    if (dep.providerTeamId === epic.teamId) throw new ValidationError('A team cannot depend on itself');
    if (!dep.ask?.trim()) throw new ValidationError('Describe the ask');
    if (dep.size !== undefined) dep = { ...dep, ...sizePatch(this.settings, dep.size, ValidationError) };
    if (dep.certainty !== undefined) checkCertainty(dep.certainty, ValidationError);
    if ((dep.effortLow || 0) > (dep.effortHigh || 0)) throw new ValidationError('High estimate must be at least the low estimate');
    await this._guardAsk(dep.quarterId, dep.reason, 'add an ask');
    const { reason, ...depFields } = dep;
    const row = toRow(depFields, org);
    row.ref_code = await this._ref('dependency');
    row.requester_name = row.requester_name || epic.ownerName || actor.name || '';
    row.requester_team_id = epic.teamId; // the 003 trigger derives it from the epic as well
    const { data, error } = await supabase.from('dependencies').insert(row).select('id').single();
    this._throw(error);
    await this._event(actor, 'dependency_added', 'dependencies', data.id, dep.quarterId, '', null, { ask: dep.ask });
    return this.load();
  }
  async answerDependency(actor, depId, { response, reason = '', deferredToQuarterId = null, grantedLow = null, grantedHigh = null }) {
    const d = await this._dep(depId);
    if (!canWriteTeam(actor, d.providerTeamId)) throw new PermissionError('Only the provider team can answer');
    const q = await this._quarter(d.quarterId);
    if (isLockedPhase(q.phase)) throw new PermissionError(ANSWERS_FIXED);
    if (!phaseAllows(q.phase, 'answer')) throw new ValidationError(`Answers are open from the Negotiate phase until the plan is locked (now: ${q.phase})`);
    if (REASON_REQUIRED.has(response) && !trim(reason)) throw new ValidationError('A reason is required for this answer');
    if (response === 'deferred' && !deferredToQuarterId) throw new ValidationError('Choose the quarter to defer to');
    if (response === 'partial') {
      if (!(grantedHigh > 0)) throw new ValidationError('Say how much you can do (granted person-weeks)');
      grantedLow = grantedLow ?? 0;
      if (grantedLow > grantedHigh) throw new ValidationError('Granted low cannot exceed granted high');
      if (grantedHigh > d.effortHigh) throw new ValidationError('Granted effort cannot exceed the ask');
    }
    // The 003 trigger sets responded_at and logs dependency_answered (reason = response_reason).
    this._throw((await supabase.from('dependencies').update({
      response, response_reason: reason, deferred_to_quarter_id: response === 'deferred' ? deferredToQuarterId : null,
      granted_low: response === 'partial' ? grantedLow : null, granted_high: response === 'partial' ? grantedHigh : null,
    }).eq('id', depId)).error);
    if (response === 'needs_priority_call') {
      // A priority call is by definition a discussion item for the session (review: coach).
      const { data: open } = await supabase.from('discussion_items').select('id').eq('dependency_id', depId).eq('status', 'open').limit(1);
      if (!open?.length) await this.raiseDiscussion(actor, { quarterId: d.quarterId, epicId: d.epicId, depId, reason: `Priority call needed on ${d.refCode}: ${reason}`, ownerName: actor.name, timeboxMin: 10 });
    }
    return this.load();
  }
  async acknowledgeDependency(actor, depId) {
    const d = await this._dep(depId);
    if (!canWriteTeam(actor, d.requesterTeamId)) throw new PermissionError('Only the requesting team can acknowledge an answer');
    this._throw((await supabase.from('dependencies').update({ acknowledged_at: now() }).eq('id', depId)).error);
    await this._event(actor, 'dependency_acknowledged', 'dependencies', depId, d.quarterId, '', null, { response: d.response });
    return this.load();
  }
  async updateDependency(actor, depId, patch) {
    const d = await this._dep(depId);
    if (!canWriteTeam(actor, d.requesterTeamId)) throw new PermissionError('Only the requesting team can edit the ask');
    let { reason, ...rest } = patch;
    await this._guardAsk(d.quarterId, reason, 'edit an ask');
    if (rest.size !== undefined) rest = { ...rest, ...sizePatch(this.settings, rest.size, ValidationError) };
    if (rest.certainty !== undefined) checkCertainty(rest.certainty, ValidationError);
    const next = { ...d, ...rest };
    if ((next.effortLow || 0) > (next.effortHigh || 0)) throw new ValidationError('Check the effort estimate');
    const effortChanged = next.effortHigh !== d.effortHigh || next.effortLow !== d.effortLow || next.ask !== d.ask;
    const { org_id, ...row } = toRow(rest, await this._org());
    // An answered ask whose scope changed goes back to the provider for a new answer (the trigger clears responded_at).
    if (effortChanged && d.response !== 'proposed') Object.assign(row, { response: 'proposed', response_reason: '', granted_low: null, granted_high: null, resent_at: now() });
    if (trim(reason)) await this._withReason('dependencies', depId, row, reason);
    else this._throw((await supabase.from('dependencies').update(row).eq('id', depId)).error);
    await this._event(actor, 'dependency_edited', 'dependencies', depId, d.quarterId, reason, { ask: d.ask, effortLow: d.effortLow, effortHigh: d.effortHigh }, { ask: next.ask, effortLow: next.effortLow, effortHigh: next.effortHigh });
    return this.load();
  }
  async deleteDependency(actor, depId, reason = '') {
    const { data: row } = await supabase.from('dependencies').select('*').eq('id', depId).maybeSingle();
    if (row) {
      const d = fromRow(row);
      if (!canWriteTeam(actor, d.requesterTeamId)) throw new PermissionError('Only the requesting team can remove the ask');
      await this._guardAsk(d.quarterId, reason, 'remove an ask');
    }
    // The 005 delete trigger logs dependencies_removed with the reason.
    this._throw((await supabase.rpc('delete_with_reason', { _table: 'dependencies', _id: depId, _reason: reason })).error);
    return this.load();
  }

  // ── session ────────────────────────────────────────────────────────────────
  async setPhase(actor, quarterId, phase, reason = '') {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin (facilitator) can change the phase');
    const s = await this.load();
    const q = s.quarters.find((x) => x.id === quarterId);
    if (!q) throw new ValidationError('Unknown quarter');
    const from = PHASE_INDEX[q.phase]; const to = PHASE_INDEX[phase];
    if (to === undefined) throw new ValidationError('Unknown phase');
    if (to < from && !trim(reason)) throw new ValidationError('Rewinding a phase requires a reason');
    if (to > from + 1) throw new ValidationError('Phases advance one step at a time');
    const patch = { phase };
    if (phase === 'locked' && from < to) {
      if (this.settings.voteBlocksLock) {
        const low = s.votes.filter((v) => v.quarterId === quarterId && v.vote <= 2);
        if (low.length) throw new ValidationError(`${low.length} team(s) voted 2 or lower; resolve before locking (setting: low vote blocks lock)`);
      }
      if (!q.baseline) {
        const open = readiness(s, quarterId).filter((r) => !r.ready);
        if (open.length && !trim(reason)) throw new ValidationError(`${open.length} team(s) not ready (${open.map((r) => r.team.name).join(', ')}). Lock anyway by giving a reason.`);
      }
      if (q.baseline) await this._event(actor, 'baseline_replaced', 'quarters', q.id, q.id, reason, { takenAt: q.baseline.takenAt }, null);
      patch.baseline = buildBaseline(s, quarterId); patch.locked_at = now();
    }
    if (to < from && to <= PHASE_INDEX.vote) patch.votes_revealed = false;
    // The 003 trigger logs phase_changed with the reason from app.reason.
    await this._withReason('quarters', quarterId, patch, reason);
    return this.load();
  }
  // Release B (D54): baseline + phase 'locked' in one step; the 003 trigger writes the single phase_changed row.
  async lockPlan(actor, quarterId, reason = '') {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin (facilitator) can change the phase');
    const s = await this.load();
    const q = s.quarters.find((x) => x.id === quarterId);
    if (!q) throw new ValidationError('Unknown quarter');
    if (isLockedPhase(q.phase)) throw new ValidationError('The plan is already locked');
    await this._withReason('quarters', quarterId, { phase: 'locked', baseline: buildBaseline(s, quarterId), locked_at: now() }, reason);
    return this.load();
  }
  // Release B (L10): "Kwartaal afsluiten" from Uitvoeren (locked or active) to closed in one step.
  async closeQuarter(actor, quarterId, reason = '') {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin (facilitator) can change the phase');
    const q = await this._quarter(quarterId);
    if (!['locked', 'active'].includes(q.phase)) throw new ValidationError('Only a running quarter can be closed');
    await this._withReason('quarters', quarterId, { phase: 'closed' }, reason);
    return this.load();
  }
  // Release B (D55): provider-only signal on a committed ask; 010 dependency_guard enforces both again in SQL.
  async setSignal(actor, depId, signal, note = '') {
    const d = await this._dep(depId);
    if (!canWriteTeam(actor, d.providerTeamId)) throw new PermissionError('Only the provider team can set a signal');
    if (!['accepted', 'partial'].includes(d.response)) throw new ValidationError('Signals apply to committed asks only');
    if (!SIGNALS.includes(signal)) throw new ValidationError('Unknown signal');
    const signalNote = trim(note).slice(0, 200);
    const { data, error } = await supabase.from('dependencies').update({ signal, signal_note: signalNote, signal_at: now() }).eq('id', depId).select('id');
    this._throw(error);
    if (!data?.length) throw new PermissionError('Not allowed for your role or team');
    await this._event(actor, 'signal_set', 'dependencies', depId, d.quarterId, signalNote, { signal: d.signal || 'on_track' }, { signal, note: signalNote });
    return this.load();
  }
  async confirmSignal(actor, depId) {
    const d = await this._dep(depId);
    if (!canWriteTeam(actor, d.providerTeamId)) throw new PermissionError('Only the provider team can set a signal');
    if (!['accepted', 'partial'].includes(d.response)) throw new ValidationError('Signals apply to committed asks only');
    const { data, error } = await supabase.from('dependencies').update({ confirmed_at: now() }).eq('id', depId).select('id');
    this._throw(error);
    if (!data?.length) throw new PermissionError('Not allowed for your role or team');
    await this._event(actor, 'signal_confirmed', 'dependencies', depId, d.quarterId, '', null, { signal: d.signal || 'on_track' });
    return this.load();
  }
  // Release B (D56): "Geleverd"; works on a closed quarter too (the 005 trigger only logs rank / commitment / effort).
  async setDelivered(actor, planId, delivered) {
    const { data: row } = await supabase.from('epic_plans').select('*').eq('id', planId).maybeSingle();
    if (!row) throw new ValidationError('Unknown plan');
    const p = fromRow(row);
    const e = await this._epic(p.epicId);
    if (!canWriteTeam(actor, e.teamId)) throw new PermissionError('Only the epic team can mark delivery');
    if (!!p.delivered === !!delivered) return this.load();
    const { data, error } = await supabase.from('epic_plans').update({ delivered: !!delivered }).eq('id', planId).select('id');
    this._throw(error);
    if (!data?.length) throw new PermissionError('Not allowed for your role or team');
    await this._event(actor, 'delivered_changed', 'epic_plans', planId, p.quarterId, '', { delivered: !!p.delivered }, { delivered: !!delivered });
    return this.load();
  }
  // Release B (D56): "Doorschuiven" adds the epic unranked to the next quarter; idempotent.
  async carryOver(actor, planId) {
    const s = await this.load();
    const p = s.plans.find((x) => x.id === planId);
    if (!p) throw new ValidationError('Unknown plan');
    const e = s.epics.find((x) => x.id === p.epicId);
    if (!e) throw new ValidationError('Unknown epic');
    if (!canWriteTeam(actor, e.teamId)) throw new PermissionError('Only the epic team can carry over');
    const next = nextQuarter(s, p.quarterId);
    if (!next) throw new ValidationError('Add the next quarter first');
    if (next.phase === 'closed') throw new ValidationError('Quarter is closed');
    if (s.plans.some((x) => x.epicId === p.epicId && x.quarterId === next.id)) return s;
    const { data, error } = await supabase.from('epic_plans').insert({ org_id: await this._org(), epic_id: p.epicId, quarter_id: next.id, effort_low: p.effortLow, effort_high: p.effortHigh, size: p.size ?? null }).select('id').single();
    this._throw(error);
    await this._event(actor, 'carried_over', 'epic_plans', data.id, next.id, '', { quarterId: p.quarterId }, { epicId: p.epicId, quarterId: next.id });
    return this.load();
  }
  async castVote(actor, teamId, quarterId, vote, reason = '') {
    if (!canWriteTeam(actor, teamId)) throw new PermissionError('You can only vote for your own team');
    if (vote <= 3 && !trim(reason)) throw new ValidationError('A reason is required for a vote of 3 or lower');
    const q = await this._quarter(quarterId);
    if (!phaseAllows(q.phase, 'vote')) throw new ValidationError('Voting is open in the Vote phase (and for a re-vote while locked)');
    this._throw((await supabase.from('confidence_votes').upsert({ org_id: await this._org(), team_id: teamId, quarter_id: quarterId, vote, reason, voted_at: now() }, { onConflict: 'org_id,team_id,quarter_id' })).error);
    await this._event(actor, 'vote_cast', 'confidence_votes', teamId, quarterId, reason, null, { vote });
    return this.load();
  }
  async revealVotes(actor, quarterId) {
    if (!isAdmin(actor)) throw new PermissionError('Only the facilitator reveals votes');
    this._throw((await supabase.from('quarters').update({ votes_revealed: true }).eq('id', quarterId)).error);
    await this._event(actor, 'votes_revealed', 'quarters', quarterId, quarterId, '', null, null);
    return this.load();
  }
  async raiseDiscussion(actor, item) {
    if (!isPlanner(actor)) throw new PermissionError('Viewers cannot raise discussion items');
    if (!item.reason?.trim()) throw new ValidationError('Say why this needs discussion');
    const { depId, ...rest } = item;
    const row = { ...toRow({ ownerName: actor.name, timeboxMin: 10, ...rest }, await this._org()), dependency_id: depId || null, raised_by: actor.id };
    this._throw((await supabase.from('discussion_items').insert(row)).error);
    return this.load();
  }
  async resolveDiscussion(actor, id, outcome) {
    if (!isPlanner(actor)) throw new PermissionError('Viewers cannot resolve discussion items');
    if (!outcome?.trim()) throw new ValidationError('An outcome is required to resolve');
    const d = await this._row('discussion_items', id, 'discussion item');
    this._throw((await supabase.from('discussion_items').update({ status: 'resolved', outcome, resolved_at: now() }).eq('id', id)).error);
    await this._event(actor, 'discussion_resolved', 'discussion_items', id, d.quarterId, outcome, null, null);
    return this.load();
  }

  // ── in-quarter ─────────────────────────────────────────────────────────────
  async addCheckIn(actor, c) {
    const e = await this._epic(c.epicId);
    if (!canWriteTeam(actor, e.teamId)) throw new PermissionError('Only the epic team can check in');
    if (!c.confidence) throw new ValidationError('Pick a confidence');
    const { authorName, ...fields } = c;
    this._throw((await supabase.from('check_ins').insert({ ...toRow(fields, await this._org()), author_id: actor.id })).error);
    return this.load();
  }
  // Section 27 (D92): same rules as the mock; impediment_guard() (013) enforces them again in SQL.
  async upsertImpediment(actor, imp) {
    if (!isPlanner(actor)) throw new PermissionError('Viewers cannot raise impediments');
    const { id, depId, ...fields } = imp;
    if (fields.status !== undefined) checkImpedimentStatus(fields.status, ValidationError);
    if (fields.actionOwnerName !== undefined) fields.actionOwnerName = trim(fields.actionOwnerName);
    if (fields.ownerName !== undefined) fields.ownerName = trim(fields.ownerName);
    const org = await this._org();
    if (id) {
      const existing = await this._row('impediments', id, 'impediment');
      if (fields.title !== undefined && !fields.title?.trim()) throw new ValidationError('Title is required');
      if ((fields.ownerName !== undefined && fields.ownerName !== existing.ownerName) || (fields.reporterId !== undefined && fields.reporterId !== existing.reporterId)) {
        if (!isAdmin(actor)) throw new PermissionError('Only an admin can change the reporter');
      }
      const statusChanged = fields.status !== undefined && fields.status !== existing.status;
      const holderChanged = (fields.actionOwnerId !== undefined && (fields.actionOwnerId || null) !== (existing.actionOwnerId || null)) || (fields.actionOwnerName !== undefined && fields.actionOwnerName !== (existing.actionOwnerName || ''));
      if (statusChanged || holderChanged) {
        const epic = existing.epicId ? await this._epic(existing.epicId) : null;
        if (!canChangeImpediment(actor, existing, epic)) throw new PermissionError('Only the reporter, the action holder, the epic team or an admin can change the status');
      }
      if (statusChanged) {
        fields.resolvedAt = fields.status === 'resolved' ? now() : null;
        if (existing.kind === 'risk') fields.roam = fields.status === 'resolved' ? 'resolved' : existing.roam;
      }
      const row = toRow(fields, org); delete row.org_id;
      if (depId !== undefined) row.dependency_id = depId;
      if (Object.keys(row).length) {
        const { data, error } = await supabase.from('impediments').update(row).eq('id', id).select('id');
        this._throw(error);
        if (!data?.length) throw new PermissionError('Not allowed for your role or team');
      }
      if (statusChanged) {
        const { data: plan } = await supabase.from('epic_plans').select('quarter_id').eq('org_id', org).eq('epic_id', existing.epicId).limit(1).maybeSingle();
        await this._event(actor, 'impediment_status_changed', 'impediments', id, plan?.quarter_id || null, '', { status: existing.status }, { status: fields.status });
      }
    } else {
      if (!fields.title?.trim()) throw new ValidationError('Title is required');
      if (!fields.epicId && !depId) throw new ValidationError('Link the impediment to an epic');
      const row = { ...toRow({ kind: 'impediment', ownerName: actor.name, reporterId: actor.id, actionOwnerId: null, actionOwnerName: '', ...fields }, org), dependency_id: depId || null, ref_code: await this._ref('impediment') };
      if (row.kind !== 'risk') row.roam = null;
      this._throw((await supabase.from('impediments').insert(row)).error);
    }
    return this.load();
  }
  async setImpedimentStatus(actor, id, status) {
    if (!isPlanner(actor)) throw new PermissionError('Viewers cannot resolve impediments');
    return this.upsertImpediment(actor, { id, status: checkImpedimentStatus(status, ValidationError) });
  }
  async resolveImpediment(actor, id) { return this.setImpedimentStatus(actor, id, 'resolved'); }

  // ── Volgen (section 23, D67): own rows only, enforced again by the 011 policies ──
  async followEpic(actor, epicId) {
    if (!actor?.id) throw new PermissionError('Sign in to follow epics');
    await this._epic(epicId);
    this._throw((await supabase.from('epic_follows').upsert({ org_id: await this._org(), user_id: actor.id, epic_id: epicId }, { onConflict: 'org_id,user_id,epic_id', ignoreDuplicates: true })).error);
    return this.load();
  }
  async unfollowEpic(actor, epicId) {
    if (!actor?.id) throw new PermissionError('Sign in to follow epics');
    this._throw((await supabase.from('epic_follows').delete().eq('org_id', await this._org()).eq('user_id', actor.id).eq('epic_id', epicId)).error);
    return this.load();
  }

  // ── setup ──────────────────────────────────────────────────────────────────
  async upsertCapacity(actor, cap) {
    if (!canWriteTeam(actor, cap.teamId)) throw new PermissionError('Not your team');
    const { id, reason, orgId, ...rest } = cap;
    await this._guardPhase(cap.quarterId, reason, 'change capacity');
    checkCapacity(rest);
    const org = await this._org();
    const { data: before } = await supabase.from('team_capacity').select('*').eq('team_id', cap.teamId).eq('quarter_id', cap.quarterId).maybeSingle();
    this._throw((await supabase.from('team_capacity').upsert(toRow(rest, org), { onConflict: 'org_id,team_id,quarter_id' })).error);
    if (before) { const b = fromRow(before); await this._event(actor, 'capacity_changed', 'team_capacity', null, cap.quarterId, reason, b, { ...b, ...rest }); }
    return this.load();
  }
  async upsertTeam(actor, t) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    if (!t.name?.trim()) throw new ValidationError('Name is required');
    this._throw((await supabase.from('teams').upsert(toRow(t, await this._org()), { onConflict: 'org_id,id' })).error);
    return this.load();
  }
  async deleteTeam(actor, id) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    const s = await this.load();
    if (s.epics.some((e) => e.teamId === id)) throw new ValidationError('Move or delete the team\'s epics first');
    if (s.dependencies.some((d) => d.providerTeamId === id)) throw new ValidationError('Other teams still have asks for this team; remove or re-route them first');
    // memberships.team_id is set to null and team_capacity rows are removed by the FKs in 001.
    this._throw((await supabase.from('teams').delete().eq('id', id)).error);
    return this.load();
  }
  // Goals and programmes (D40). 009 checks type and "deadline needs Moet" again in SQL.
  async upsertTheme(actor, t) {
    if (!canRank(actor)) throw new PermissionError('Themes need rank permission');
    const existing = t.id ? await this._row('themes', t.id, 'goal') : null;
    const next = checkTheme(t, existing || undefined, ValidationError);
    const patch = { ...t };
    if (patch.name !== undefined) patch.name = String(patch.name).trim();
    if (next.must === false || !next.must) patch.mustDeadline = null;
    const row = toRow(patch, await this._org());
    if (!t.id) row.position = (this.state?.themes.length) ?? 0;
    const { data, error } = await supabase.from('themes').upsert(row, { onConflict: 'org_id,id' }).select('id');
    this._throw(error);
    if (!data?.length) throw new PermissionError('Not allowed for your role or team');
    return this.load();
  }
  async deleteTheme(actor, id) {
    if (!canRank(actor)) throw new PermissionError('Themes need rank permission');
    // epics.theme_id is set to null by the FK in 001.
    this._throw((await supabase.from('themes').delete().eq('id', id)).error);
    return this.load();
  }
  async upsertQuarter(actor, q) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    this._throw((await supabase.from('quarters').upsert(toRow(q, await this._org()), { onConflict: 'org_id,id' })).error);
    return this.load();
  }
  async updateSettings(actor, patch) {
    if (Object.keys(patch).every((k) => k === 'language') && !isAdmin(actor)) {
      this.settings = { ...this.settings, language: patch.language, personalLanguage: patch.language };
      this.state = { ...this.state, settings: { ...this.settings } };
      return this.state;
    }
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    if (patch.sizeMap !== undefined) patch = { ...patch, sizeMap: checkSizeMap(patch.sizeMap, ValidationError) };
    if (patch.cadence !== undefined) patch = { ...patch, cadence: checkCadence(patch.cadence, ValidationError) };
    if (patch.impedimentEscalationDays !== undefined) patch = { ...patch, impedimentEscalationDays: checkEscalationDays(patch.impedimentEscalationDays, ValidationError) };
    const org = await this._org();
    const next = { ...this.settings, ...patch };
    const { staleDays, voteBlocksLock, personalLanguage, ...profile } = next;
    // stale_days / vote_blocks_lock are columns (005); the organisation profile is a jsonb document (006).
    this._throw((await supabase.from('org_settings').upsert({ org_id: org, stale_days: staleDays, vote_blocks_lock: voteBlocksLock, profile })).error);
    if (patch.orgName !== undefined) this._throw((await supabase.from('organisations').update({ name: patch.orgName }).eq('id', org)).error);
    this.settings = next;
    return this.load();
  }

  // ── members and invitations (007, docs/design.md section 18) ────────────────
  // Same checks and texts as the mock; 007 enforces the guards again in SQL (trigger + RLS).
  async inviteMember(actor, inv) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can invite people');
    const org = await this._org();
    const email = normaliseEmail(inv.email);
    const teamId = checkRole(inv.role, inv.teamId, await this._all('teams'));
    const { data: existing, error } = await supabase.from('invitations').select('id, accepted_at').eq('org_id', org).eq('email', email).maybeSingle();
    this._throw(error);
    if (existing && !existing.accepted_at) throw new ValidationError('This e-mail address has already been invited');
    if (existing) this._throw((await supabase.from('invitations').delete().eq('org_id', org).eq('id', existing.id)).error); // re-invite after removal
    const row = { org_id: org, email, role: inv.role, team_id: teamId, can_rank: !!inv.canRank, display_name: trim(inv.displayName), invited_by: actor.id };
    const { data, error: insErr } = await supabase.from('invitations').insert(row).select('id').single();
    this._throw(insErr);
    await this._event(actor, 'member_invited', 'invitations', data.id, null, '', null, { email, role: inv.role, teamId, canRank: !!inv.canRank });
    return this.load();
  }
  async updateMember(actor, userId, patch) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can change roles');
    const org = await this._org();
    const members = await this._members(org);
    const m = members.find((x) => x.id === userId);
    const role = patch.role ?? m?.role;
    checkMemberChange(actor, members, m, role);
    const teamId = checkRole(role, patch.teamId !== undefined ? patch.teamId : m.teamId, await this._all('teams'));
    const row = { role, team_id: teamId, can_rank: patch.canRank !== undefined ? !!patch.canRank : m.canRank };
    if (patch.displayName !== undefined) {
      if (!trim(patch.displayName)) throw new ValidationError('Name is required');
      row.display_name = trim(patch.displayName);
    }
    // PostgREST reports no error when RLS filters the row away: check that a row came back.
    const { data, error } = await supabase.from('memberships').update(row).eq('org_id', org).eq('user_id', userId).select('user_id');
    this._throw(error);
    if (!data?.length) throw new PermissionError('Not allowed for your role or team');
    await this._event(actor, 'member_updated', 'memberships', userId, null, '', { role: m.role, teamId: m.teamId, canRank: m.canRank }, { role, teamId, canRank: row.can_rank });
    return this.load();
  }
  async removeMember(actor, userId) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can remove people');
    const org = await this._org();
    const members = await this._members(org);
    const m = members.find((x) => x.id === userId);
    checkMemberChange(actor, members, m, null);
    const { data, error } = await supabase.from('memberships').delete().eq('org_id', org).eq('user_id', userId).select('user_id');
    this._throw(error);
    if (!data?.length) throw new PermissionError('Not allowed for your role or team');
    await this._event(actor, 'member_removed', 'memberships', userId, null, '', { role: m.role, teamId: m.teamId, canRank: m.canRank }, null);
    return this.load();
  }
  async revokeInvitation(actor, invitationId) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can revoke invitations');
    const org = await this._org();
    const { data, error } = await supabase.from('invitations').delete().eq('org_id', org).eq('id', invitationId).select('id, email');
    this._throw(error);
    if (!data?.length) throw new ValidationError('Unknown invitation');
    await this._event(actor, 'invitation_revoked', 'invitations', invitationId, null, '', { email: data[0].email }, null);
    return this.load();
  }
  // Sends a magic link (creates the auth user if needed). Only on an admin's click, only for invited addresses.
  // The redirect URL must be listed under Auth > URL configuration in Supabase. Does not touch the admin's session.
  async sendSignInLink(actor, email) {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can send sign-in links');
    const org = await this._org();
    const e = normaliseEmail(email);
    const { data: inv, error } = await supabase.from('invitations').select('id').eq('org_id', org).eq('email', e).maybeSingle();
    this._throw(error);
    if (!inv) throw new ValidationError('Invite this e-mail address first');
    const emailRedirectTo = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`;
    const { error: otpErr } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true, emailRedirectTo } });
    this._throw(otpErr);
    await this._event(actor, 'sign_in_link_sent', 'invitations', inv.id, null, '', null, { email: e });
    return { sent: true, demo: false };
  }

  // ── integration import (D19-D22) ───────────────────────────────────────────
  async importExternalEpics(actor, externalEpics, teamMapping) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    const org = await this._org();
    const s = await this.load();
    const byExt = new Map(s.epics.filter((e) => e.externalId).map((e) => [`${e.externalSource}:${e.externalId}`, e]));
    let created = 0; let updated = 0; const suggestions = [];
    for (const x of externalEpics) {
      const teamId = teamMapping[x.teamHint]; if (!teamId) continue;
      const key = `${x.source}:${x.externalId}`;
      const cur = byExt.get(key);
      const synced = { title: x.title, external_url: x.url, external_synced_at: now(), external_state: x.state };
      if (cur) { this._throw((await supabase.from('epics').update(synced).eq('id', cur.id)).error); updated += 1; }
      else {
        const { data, error } = await supabase.from('epics').insert({ org_id: org, ref_code: await this._ref('epic'), team_id: teamId, owner_name: x.ownerName || '', external_source: x.source, external_id: x.externalId, ...synced }).select('id').single();
        this._throw(error);
        byExt.set(key, { id: data.id, teamId }); created += 1;
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
    await this._event(actor, 'import_run', 'integration', null, null, '', null, { created, updated });
    await this.load();
    return { created, updated, suggestions };
  }
}
