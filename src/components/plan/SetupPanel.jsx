import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { isAdmin } from '../../data/repository';
import { quarterLabel } from '../../domain/model';
import { Panel, btn, input, Field, ErrorNote } from './ui';

// Organisation setup checklist (docs/design.md section 17). Shows what a new organisation must
// configure before a first session and how complete it is. Each step links to where it is done.
export function SetupPanel({ onGoTo }) {
  const { state, actor, run } = usePlan();
  const s = state.settings;
  const admin = isAdmin(actor);
  const [err, setErr] = useState(null);
  const planning = state.quarters.find((q) => !['closed', 'active'].includes(q.phase));
  const capFor = (q) => state.teams.filter((t) => state.capacity.some((c) => c.teamId === t.id && c.quarterId === q?.id && c.headcount > 0)).length;
  const planners = state.teams.filter((t) => (state.members || []).some((m) => m.teamId === t.id && m.role === 'planner')).length;
  const rankers = (state.members || []).filter((m) => m.role === 'admin' || m.canRank).length;

  const steps = [
    { id: 'org', label: 'Organisation profile', done: !!s.orgName, detail: s.orgName ? `${s.orgName} · planning unit "${s.unitLabel || 'team'}" · ${s.capacityUnit || 'person-weeks'}` : 'Name, what you call a planning unit, capacity unit', where: 'profile' },
    { id: 'teams', label: 'Planning units (teams)', done: state.teams.length >= 2, detail: `${state.teams.length} teams`, where: 'teams' },
    { id: 'members', label: 'People and roles', done: rankers >= 1 && planners >= Math.min(2, state.teams.length), detail: `${(state.members || []).length} members · ${planners}/${state.teams.length} teams have a planner · ${rankers} can set strategic rank`, where: 'members' },
    { id: 'themes', label: 'Strategic themes (top-down)', done: state.themes.length >= 1, detail: `${state.themes.length} themes`, where: 'themes' },
    { id: 'quarters', label: 'Quarters', done: !!planning, detail: planning ? `Planning ${quarterLabel(planning)} (${planning.phase})` : 'No quarter open for planning', where: 'quarters' },
    { id: 'capacity', label: 'Capacity per team for the planning quarter', done: planning && capFor(planning) === state.teams.length, detail: planning ? `${capFor(planning)}/${state.teams.length} teams set` : '–', where: 'capacity' },
    { id: 'epics', label: 'Epics (typed in or imported)', done: state.epics.length > 0, detail: `${state.epics.length} epics, ${state.epics.filter((e) => e.externalSource).length} imported`, where: 'import' },
  ];
  const done = steps.filter((x) => x.done).length;

  return (
    <Panel title={`Organisation setup — ${done}/${steps.length} steps complete`} right={<span className="text-xs text-gray-600">What a new organisation needs before its first session</span>}>
      <ol className="space-y-1.5 text-sm">
        {steps.map((st, i) => (
          <li key={st.id} className="flex items-start gap-2">
            <span aria-hidden="true" className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs ${st.done ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{st.done ? '✓' : i + 1}</span>
            <div className="flex-1">
              <button className="font-medium hover:underline text-left" onClick={() => onGoTo(st.where)}>{st.label}</button>
              <div className="text-xs text-gray-600">{st.detail}</div>
            </div>
          </li>
        ))}
      </ol>
      {admin && (
        <details className="mt-4" open={!s.orgName}>
          <summary className="text-sm font-medium cursor-pointer" id="profile">Organisation profile and defaults</summary>
          <ProfileForm onError={setErr} />
        </details>
      )}
      <ErrorNote error={err} />
    </Panel>
  );
}

function ProfileForm({ onError }) {
  const { state, run } = usePlan();
  const s = state.settings;
  const [form, setForm] = useState({ orgName: s.orgName || '', unitLabel: s.unitLabel || 'team', capacityUnit: s.capacityUnit || 'person-weeks', fiscalYearStartMonth: s.fiscalYearStartMonth || 1,
    defaultWeeks: s.capacityDefaults?.weeks ?? 13, defaultFocus: s.capacityDefaults?.focusFactor ?? 0.65, defaultReserve: s.capacityDefaults?.reservePct ?? 20, staleDays: s.staleDays, noResponseDays: s.noResponseDays ?? 5 });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });
  return (
    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
      <Field l="Organisation name"><input className={input} value={form.orgName} onChange={set('orgName')} placeholder="e.g. Oranje Verzekeringen" /></Field>
      <Field l="What do you call a planning unit?"><select className={input} value={form.unitLabel} onChange={set('unitLabel')}>{['team', 'squad', 'product team', 'department', 'tribe'].map((u) => <option key={u}>{u}</option>)}</select></Field>
      <Field l="Capacity unit"><select className={input} value={form.capacityUnit} onChange={set('capacityUnit')}><option value="person-weeks">person-weeks</option><option value="person-days">person-days (shown as weeks ÷ 5)</option></select></Field>
      <Field l="Fiscal year starts in month"><input type="number" min="1" max="12" className={input} value={form.fiscalYearStartMonth} onChange={set('fiscalYearStartMonth')} /></Field>
      <Field l="Default weeks per quarter"><input type="number" className={input} value={form.defaultWeeks} onChange={set('defaultWeeks')} /></Field>
      <Field l="Default focus factor"><input type="number" step="0.05" className={input} value={form.defaultFocus} onChange={set('defaultFocus')} /></Field>
      <Field l="Default reserve % (run / on-call)"><input type="number" className={input} value={form.defaultReserve} onChange={set('defaultReserve')} /></Field>
      <Field l="Check-in cadence (days)"><input type="number" className={input} value={form.staleDays} onChange={set('staleDays')} /></Field>
      <Field l="Flag unanswered asks after (days)"><input type="number" className={input} value={form.noResponseDays} onChange={set('noResponseDays')} /></Field>
      <div className="col-span-full flex gap-2">
        <button className={btn.primary} onClick={async () => { const r = await run('updateSettings', { orgName: form.orgName, unitLabel: form.unitLabel, capacityUnit: form.capacityUnit, fiscalYearStartMonth: form.fiscalYearStartMonth, staleDays: form.staleDays, noResponseDays: form.noResponseDays, capacityDefaults: { weeks: form.defaultWeeks, focusFactor: form.defaultFocus, reservePct: form.defaultReserve } }); onError(r.ok ? null : r.error); }}>Save profile</button>
      </div>
    </div>
  );
}

// Apply capacity defaults to all teams of a quarter in one go (headcount per team).
export function BulkCapacity() {
  const { state, run, actor } = usePlan();
  const quarters = state.quarters.filter((q) => q.phase !== 'closed');
  const [quarterId, setQuarterId] = useState(quarters.find((q) => !['active'].includes(q.phase))?.id || quarters[0]?.id);
  const [rows, setRows] = useState(() => Object.fromEntries(state.teams.map((t) => { const c = state.capacity.find((x) => x.teamId === t.id && x.quarterId === quarterId); return [t.id, { headcount: c?.headcount ?? '', absenceWeeks: c?.absenceWeeks ?? 0 }]; })));
  const [err, setErr] = useState(null);
  const d = state.settings.capacityDefaults || { weeks: 13, focusFactor: 0.65, reservePct: 20 };
  if (!isAdmin(actor)) return null;
  return (
    <Panel title="Capacity for all teams at once" right={<select aria-label="Quarter" className={`${input} !w-auto`} value={quarterId} onChange={(e) => { const id = e.target.value; setQuarterId(id); setRows(Object.fromEntries(state.teams.map((t) => { const c = state.capacity.find((x) => x.teamId === t.id && x.quarterId === id); return [t.id, { headcount: c?.headcount ?? '', absenceWeeks: c?.absenceWeeks ?? 0 }]; }))); }}>{quarters.map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}</option>)}</select>}>
      <p className="text-xs text-gray-600 mb-2">Uses the organisation defaults ({d.weeks} weeks, focus {d.focusFactor}, reserve {d.reservePct}%). Teams can refine their own assumptions on the board.</p>
      <table className="text-sm">
        <thead className="text-xs text-gray-600 text-left"><tr><th className="py-1 pr-3">Team</th><th className="pr-3">Headcount</th><th>Absence weeks (team total)</th></tr></thead>
        <tbody>{state.teams.map((t) => (
          <tr key={t.id}><td className="py-1 pr-3">{t.name}</td>
            <td className="pr-3"><input type="number" step="0.5" aria-label={`Headcount ${t.name}`} className={`${input} !w-24`} value={rows[t.id]?.headcount ?? ''} onChange={(e) => setRows({ ...rows, [t.id]: { ...rows[t.id], headcount: e.target.value } })} /></td>
            <td><input type="number" step="0.5" aria-label={`Absence weeks ${t.name}`} className={`${input} !w-24`} value={rows[t.id]?.absenceWeeks ?? 0} onChange={(e) => setRows({ ...rows, [t.id]: { ...rows[t.id], absenceWeeks: e.target.value } })} /></td></tr>))}</tbody>
      </table>
      <ErrorNote error={err} />
      <button className={`${btn.primary} mt-3`} onClick={async () => {
        for (const t of state.teams) {
          const r = rows[t.id]; if (r?.headcount === '' || r?.headcount == null) continue;
          const existing = state.capacity.find((x) => x.teamId === t.id && x.quarterId === quarterId);
          const res = await run('upsertCapacity', { teamId: t.id, quarterId, headcount: Number(r.headcount), absenceWeeks: Number(r.absenceWeeks || 0), weeks: existing?.weeks ?? d.weeks, focusFactor: existing?.focusFactor ?? d.focusFactor, reservePct: existing?.reservePct ?? d.reservePct });
          if (!res.ok) { setErr(res.error); return; }
        }
        setErr(null);
      }}>Save capacity for {quarterLabel(state.quarters.find((q) => q.id === quarterId))}</button>
    </Panel>
  );
}

// People and roles. Mock mode: the persona list; Supabase mode: memberships (managed in SQL for now).
export function MembersPanel() {
  const { state, dataSource } = usePlan();
  const members = state.members || [];
  return (
    <Panel title="People and roles" right={<span className="text-xs text-gray-600">admin = facilitator · planner = writes own team · viewer = read · "can rank" = sets strategic priority</span>}>
      {members.length === 0 ? <p className="text-sm text-gray-600">No members loaded.</p> : (
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-600 text-left"><tr><th className="py-1">Name</th><th>Role</th><th>Team</th><th>Can rank</th></tr></thead>
          <tbody>{members.map((m) => <tr key={m.id} className="border-t"><td className="py-1">{m.name}<div className="text-xs text-gray-600">{m.title}</div></td><td>{m.role}</td><td>{state.teams.find((t) => t.id === m.teamId)?.name || '–'}</td><td>{m.canRank ? '✓' : '–'}</td></tr>)}</tbody>
        </table>
      )}
      <p className="text-xs text-gray-600 mt-2">{dataSource === 'mock' ? 'In demo mode these are the personas in the "Viewing as" switcher.' : 'Membership rows live in the memberships table (db/migrations/002); an invite flow is a follow-up (docs/design.md section 17).'}</p>
    </Panel>
  );
}
