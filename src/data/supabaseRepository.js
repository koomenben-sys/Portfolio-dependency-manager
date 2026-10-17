// Supabase implementation of the repository contract (docs/design.md D12, schema db/migrations/001-003).
// NOT exercised against a live database in this iteration (owner's dashboard was not accessible):
// written to the schema, authorisation is enforced by RLS + triggers; JS checks mirror them for UX.
//
// Notes:
// * Column mapping: camelCase in the app <-> snake_case in Postgres (see toRow / fromRow maps).
// * Reasons: the DB triggers read current_setting('app.reason'). supabase-js cannot set a GUC per
//   request, so for rank changes we call the RPC `set_reason_and_update_plan` if present and fall
//   back to writing the plan_events row ourselves (the trigger will then reject rank changes
//   without a reason — add the RPC in a follow-up migration; recorded in docs/design.md section 16).
import { supabase } from '../lib/supabase';
import { buildBaseline } from '../domain/plan';
import { PermissionError, ValidationError, canWriteTeam, isAdmin, canRank, isPlanner } from './repository';

const snake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const fromRow = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]));
const toRow = (o, orgId) => ({ ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v])), org_id: orgId });

// app field -> db field where they differ from plain snake_case
const RENAME = { plans: { rank: 'strategic_rank' }, discussions: { depId: 'dependency_id' }, impediments: { depId: 'dependency_id' } };
const TABLES = {
  teams: 'teams', themes: 'themes', quarters: 'quarters', capacity: 'team_capacity', epics: 'epics', plans: 'epic_plans',
  dependencies: 'dependencies', votes: 'confidence_votes', discussions: 'discussion_items', checkIns: 'check_ins',
  impediments: 'impediments', events: 'plan_events',
};

export class SupabaseRepository {
  constructor() { this.orgId = null; this.settings = { staleDays: 14, voteBlocksLock: false }; }

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
  _throw(error) { if (error) throw new ValidationError(error.message); }

  async load() {
    const [teams, themes, quarters, capacity, epics, plans, dependencies, votes, discussions, checkIns, impediments, events] =
      await Promise.all(Object.values(TABLES).map((t) => this._all(t)));
    return {
      teams, themes: themes.sort((a, b) => a.position - b.position), quarters: quarters.sort((a, b) => a.year * 4 + a.q - (b.year * 4 + b.q)),
      capacity, epics,
      plans: plans.map((p) => ({ ...p, rank: p.strategicRank })),
      dependencies, votes, discussions: discussions.map((d) => ({ ...d, depId: d.dependencyId })), checkIns,
      impediments: impediments.map((i) => ({ ...i, depId: i.dependencyId })),
      events: events.map((e) => ({ ...e, actorName: e.actorId })),
      settings: this.settings,
    };
  }

  async _event(actor, action, entity, entityId, quarterId, reason, before, after) {
    await supabase.from('plan_events').insert({ org_id: await this._org(), actor_id: actor.id, action, entity, entity_id: entityId, quarter_id: quarterId, reason: reason || '', before, after });
  }
  async _ref(kind) {
    const { data, error } = await supabase.rpc('next_ref', { _org: await this._org(), _kind: kind });
    this._throw(error);
    return data;
  }

  // ── epics and plans ────────────────────────────────────────────────────────
  async upsertEpic(actor, epic) {
    if (!epic.title?.trim() && !epic.id) throw new ValidationError('Title is required');
    const org = await this._org();
    const row = toRow(epic, org);
    if (!epic.id) row.ref_code = await this._ref('epic');
    const { error } = await supabase.from('epics').upsert(row, { onConflict: 'org_id,id' });
    this._throw(error);
    return this.load();
  }
  async deleteEpic(actor, epicId) { this._throw((await supabase.from('epics').delete().eq('id', epicId)).error); return this.load(); }

  async upsertPlan(actor, plan, reason = '') {
    const org = await this._org();
    const { rank, ...rest } = plan;
    const row = toRow(rest, org);
    if (rank !== undefined) row.strategic_rank = rank;
    if (plan.id) {
      if (rank !== undefined) {
        if (!canRank(actor)) throw new PermissionError('Changing the strategic rank needs rank permission');
        if (!reason.trim()) throw new ValidationError('A reason is required to change the strategic rank');
        const { error } = await supabase.rpc('update_plan_with_reason', { _plan: row, _reason: reason });
        if (error) {
          // RPC not installed yet: write the event ourselves, then update (trigger may reject without GUC)
          await this._event(actor, 'rank_changed', 'epic_plans', plan.id, plan.quarterId, reason, null, { strategic_rank: rank });
          this._throw((await supabase.from('epic_plans').update(row).eq('id', plan.id)).error);
        }
      } else {
        this._throw((await supabase.from('epic_plans').update(row).eq('id', plan.id)).error);
      }
    } else {
      this._throw((await supabase.from('epic_plans').insert(row)).error);
    }
    return this.load();
  }
  async removePlan(actor, planId) { this._throw((await supabase.from('epic_plans').delete().eq('id', planId)).error); return this.load(); }

  // ── dependencies ───────────────────────────────────────────────────────────
  async addDependency(actor, dep) {
    if (!dep.ask?.trim()) throw new ValidationError('Describe the ask');
    const org = await this._org();
    const row = toRow(dep, org); row.ref_code = await this._ref('dependency');
    // requester_team_id is filled by trigger; provide a placeholder to satisfy NOT NULL
    row.requester_team_id = row.requester_team_id || row.provider_team_id;
    this._throw((await supabase.from('dependencies').insert(row)).error);
    return this.load();
  }
  async answerDependency(actor, depId, { response, reason = '', deferredToQuarterId = null }) {
    if (response !== 'accepted' && !reason.trim()) throw new ValidationError('A reason is required for this answer');
    if (response === 'deferred' && !deferredToQuarterId) throw new ValidationError('Choose the quarter to defer to');
    this._throw((await supabase.from('dependencies').update({ response, response_reason: reason, deferred_to_quarter_id: deferredToQuarterId }).eq('id', depId)).error);
    return this.load();
  }
  async updateDependency(actor, depId, patch) { this._throw((await supabase.from('dependencies').update(toRow(patch, await this._org())).eq('id', depId)).error); return this.load(); }
  async deleteDependency(actor, depId) { this._throw((await supabase.from('dependencies').delete().eq('id', depId)).error); return this.load(); }

  // ── session ────────────────────────────────────────────────────────────────
  async setPhase(actor, quarterId, phase, reason = '') {
    if (!isAdmin(actor)) throw new PermissionError('Only an admin can change the phase');
    const patch = { phase };
    if (phase === 'locked') { const s = await this.load(); const q = s.quarters.find((x) => x.id === quarterId); if (!q.baseline) { patch.baseline = buildBaseline(s, quarterId); patch.locked_at = new Date().toISOString(); } }
    this._throw((await supabase.from('quarters').update(patch).eq('id', quarterId)).error);
    if (reason) await this._event(actor, 'phase_reason', 'quarters', quarterId, quarterId, reason, null, { phase });
    return this.load();
  }
  async castVote(actor, teamId, quarterId, vote, reason = '') {
    if (vote <= 3 && !reason.trim()) throw new ValidationError('A reason is required for a vote of 3 or lower');
    this._throw((await supabase.from('confidence_votes').upsert({ org_id: await this._org(), team_id: teamId, quarter_id: quarterId, vote, reason, voted_at: new Date().toISOString() }, { onConflict: 'org_id,team_id,quarter_id' })).error);
    return this.load();
  }
  async raiseDiscussion(actor, item) {
    const { depId, ...rest } = item;
    this._throw((await supabase.from('discussion_items').insert({ ...toRow(rest, await this._org()), dependency_id: depId || null, raised_by: actor.id })).error);
    return this.load();
  }
  async resolveDiscussion(actor, id, outcome) {
    if (!outcome?.trim()) throw new ValidationError('An outcome is required');
    this._throw((await supabase.from('discussion_items').update({ status: 'resolved', outcome, resolved_at: new Date().toISOString() }).eq('id', id)).error);
    return this.load();
  }

  // ── in-quarter ─────────────────────────────────────────────────────────────
  async addCheckIn(actor, c) { this._throw((await supabase.from('check_ins').insert({ ...toRow(c, await this._org()), author_id: actor.id })).error); return this.load(); }
  async upsertImpediment(actor, imp) {
    const { depId, ...rest } = imp; const org = await this._org();
    const row = { ...toRow(rest, org), dependency_id: depId ?? undefined };
    if (!imp.id) row.ref_code = await this._ref('impediment');
    this._throw((await supabase.from('impediments').upsert(row, { onConflict: 'org_id,id' })).error);
    return this.load();
  }
  async resolveImpediment(actor, id) { this._throw((await supabase.from('impediments').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)).error); return this.load(); }

  // ── setup ──────────────────────────────────────────────────────────────────
  async upsertCapacity(actor, cap) { const { id, ...rest } = cap; this._throw((await supabase.from('team_capacity').upsert(toRow(rest, await this._org()), { onConflict: 'org_id,team_id,quarter_id' })).error); return this.load(); }
  async upsertTeam(actor, t) { this._throw((await supabase.from('teams').upsert(toRow(t, await this._org()), { onConflict: 'org_id,id' })).error); return this.load(); }
  async deleteTeam(actor, id) { this._throw((await supabase.from('teams').delete().eq('id', id)).error); return this.load(); }
  async upsertTheme(actor, t) { this._throw((await supabase.from('themes').upsert(toRow(t, await this._org()), { onConflict: 'org_id,id' })).error); return this.load(); }
  async deleteTheme(actor, id) { this._throw((await supabase.from('themes').delete().eq('id', id)).error); return this.load(); }
  async upsertQuarter(actor, q) { this._throw((await supabase.from('quarters').upsert(toRow(q, await this._org()), { onConflict: 'org_id,id' })).error); return this.load(); }
  async updateSettings(actor, patch) { Object.assign(this.settings, patch); return this.load(); } // org settings table: follow-up

  async importExternalEpics(actor, externalEpics, teamMapping) {
    if (!isAdmin(actor)) throw new PermissionError('Admin only');
    const org = await this._org();
    const s = await this.load();
    let created = 0; let updated = 0;
    for (const x of externalEpics) {
      const teamId = teamMapping[x.teamHint]; if (!teamId) continue;
      const cur = s.epics.find((e) => e.externalSource === x.source && e.externalId === x.externalId);
      if (cur) { this._throw((await supabase.from('epics').update({ title: x.title, external_url: x.url, external_synced_at: new Date().toISOString() }).eq('id', cur.id)).error); updated += 1; }
      else {
        this._throw((await supabase.from('epics').insert({ org_id: org, ref_code: await this._ref('epic'), team_id: teamId, title: x.title, owner_name: x.ownerName || '', external_source: x.source, external_id: x.externalId, external_url: x.url, external_synced_at: new Date().toISOString() })).error);
        created += 1;
      }
    }
    return { created, updated, suggestions: [] };
  }
}
