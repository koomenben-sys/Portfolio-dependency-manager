import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { isAdmin } from '../../data/repository';
import { quarterLabel, PHASES } from '../../domain/model';
import { useT } from '../../i18n';
import { Panel, btn, input, Field, ErrorNote } from './ui';

// Organisation setup checklist (docs/design.md section 17). Shows what a new organisation must
// configure before a first session and how complete it is. Each step links to where it is done.
export function SetupPanel({ onGoTo }) {
  const { state, actor, run } = usePlan();
  const t = useT();
  const s = state.settings;
  const admin = isAdmin(actor);
  const [err, setErr] = useState(null);
  const planning = state.quarters.find((q) => !['closed', 'active'].includes(q.phase));
  const capFor = (q) => state.teams.filter((x) => state.capacity.some((c) => c.teamId === x.id && c.quarterId === q?.id && c.headcount > 0)).length;
  const planners = state.teams.filter((x) => (state.members || []).some((m) => m.teamId === x.id && m.role === 'planner')).length;
  const rankers = (state.members || []).filter((m) => m.role === 'admin' || m.canRank).length;
  const phaseLabel = (q) => t(PHASES.find((p) => p.id === q.phase)?.label || q.phase);

  const steps = [
    { id: 'org', label: t('Organisation profile'), done: !!s.orgName, detail: s.orgName ? `${s.orgName} · ${t('planning unit')} "${s.unitLabel || 'team'}" · ${s.capacityUnit || 'person-weeks'}` : t('Name, what you call a planning unit, capacity unit'), where: 'profile' },
    { id: 'teams', label: t('Planning units (teams)'), done: state.teams.length >= 2, detail: t('{n} teams', { n: state.teams.length }), where: 'teams' },
    { id: 'members', label: t('People and roles'), done: rankers >= 1 && planners >= Math.min(2, state.teams.length), detail: t('{members} members · {planners}/{teams} teams have a planner · {rankers} can set strategic rank', { members: (state.members || []).length, planners, teams: state.teams.length, rankers }), where: 'members' },
    { id: 'themes', label: t('Strategic themes (top-down)'), done: state.themes.length >= 1, detail: t('{n} themes', { n: state.themes.length }), where: 'themes' },
    { id: 'quarters', label: t('Quarters'), done: !!planning, detail: planning ? t('Planning {quarter} ({phase})', { quarter: quarterLabel(planning), phase: phaseLabel(planning) }) : t('No quarter open for planning'), where: 'quarters' },
    { id: 'capacity', label: t('Capacity per team for the planning quarter'), done: planning && capFor(planning) === state.teams.length, detail: planning ? t('{done}/{total} teams set', { done: capFor(planning), total: state.teams.length }) : '–', where: 'capacity' },
    { id: 'epics', label: t('Epics (typed in or imported)'), done: state.epics.length > 0, detail: t('{n} epics, {imported} imported', { n: state.epics.length, imported: state.epics.filter((e) => e.externalSource).length }), where: 'import' },
  ];
  const done = steps.filter((x) => x.done).length;

  return (
    <Panel title={t('Organisation setup — {done}/{total} steps complete', { done, total: steps.length })} right={<span className="text-xs text-gray-600">{t('What a new organisation needs before its first session')}</span>}>
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
          <summary className="text-sm font-medium cursor-pointer" id="profile">{t('Organisation profile and defaults')}</summary>
          <ProfileForm onError={setErr} />
        </details>
      )}
      <ErrorNote error={err} />
    </Panel>
  );
}

function ProfileForm({ onError }) {
  const { state, run } = usePlan();
  const t = useT();
  const s = state.settings;
  const [form, setForm] = useState({ orgName: s.orgName || '', unitLabel: s.unitLabel || 'team', capacityUnit: s.capacityUnit || 'person-weeks', fiscalYearStartMonth: s.fiscalYearStartMonth || 1,
    defaultWeeks: s.capacityDefaults?.weeks ?? 13, defaultFocus: s.capacityDefaults?.focusFactor ?? 0.65, defaultReserve: s.capacityDefaults?.reservePct ?? 20, staleDays: s.staleDays, noResponseDays: s.noResponseDays ?? 5 });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });
  return (
    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
      <Field l={t('Organisation name')}><input className={input} value={form.orgName} onChange={set('orgName')} placeholder={t('e.g. Oranje Verzekeringen')} /></Field>
      <Field l={t('What do you call a planning unit?')}><select className={input} value={form.unitLabel} onChange={set('unitLabel')}>{['team', 'squad', 'product team', 'department', 'tribe'].map((u) => <option key={u} value={u}>{t(u)}</option>)}</select></Field>
      <Field l={t('Capacity unit')}><select className={input} value={form.capacityUnit} onChange={set('capacityUnit')}><option value="person-weeks">{t('person-weeks')}</option><option value="person-days">{t('person-days (shown as weeks ÷ 5)')}</option></select></Field>
      <Field l={t('Fiscal year starts in month')}><input type="number" min="1" max="12" className={input} value={form.fiscalYearStartMonth} onChange={set('fiscalYearStartMonth')} /></Field>
      <Field l={t('Default weeks per quarter')}><input type="number" className={input} value={form.defaultWeeks} onChange={set('defaultWeeks')} /></Field>
      <Field l={t('Default focus factor')}><input type="number" step="0.05" className={input} value={form.defaultFocus} onChange={set('defaultFocus')} /></Field>
      <Field l={t('Default reserve % (run / on-call)')}><input type="number" className={input} value={form.defaultReserve} onChange={set('defaultReserve')} /></Field>
      <Field l={t('Check-in cadence (days)')}><input type="number" className={input} value={form.staleDays} onChange={set('staleDays')} /></Field>
      <Field l={t('Flag unanswered asks after (days)')}><input type="number" className={input} value={form.noResponseDays} onChange={set('noResponseDays')} /></Field>
      <div className="col-span-full flex gap-2">
        <button className={btn.primary} onClick={async () => { const r = await run('updateSettings', { orgName: form.orgName, unitLabel: form.unitLabel, capacityUnit: form.capacityUnit, fiscalYearStartMonth: form.fiscalYearStartMonth, staleDays: form.staleDays, noResponseDays: form.noResponseDays, capacityDefaults: { weeks: form.defaultWeeks, focusFactor: form.defaultFocus, reservePct: form.defaultReserve } }); onError(r.ok ? null : r.error); }}>{t('Save profile')}</button>
      </div>
    </div>
  );
}

// Apply capacity defaults to all teams of a quarter in one go (headcount per team).
export function BulkCapacity() {
  const { state, run, actor } = usePlan();
  const t = useT();
  const quarters = state.quarters.filter((q) => q.phase !== 'closed');
  const [quarterId, setQuarterId] = useState(quarters.find((q) => !['active'].includes(q.phase))?.id || quarters[0]?.id);
  const [rows, setRows] = useState(() => Object.fromEntries(state.teams.map((x) => { const c = state.capacity.find((y) => y.teamId === x.id && y.quarterId === quarterId); return [x.id, { headcount: c?.headcount ?? '', absenceWeeks: c?.absenceWeeks ?? 0 }]; })));
  const [err, setErr] = useState(null);
  const d = state.settings.capacityDefaults || { weeks: 13, focusFactor: 0.65, reservePct: 20 };
  if (!isAdmin(actor)) return null;
  return (
    <Panel title={t('Capacity for all teams at once')} right={<select aria-label={t('Quarter')} className={`${input} !w-auto`} value={quarterId} onChange={(e) => { const id = e.target.value; setQuarterId(id); setRows(Object.fromEntries(state.teams.map((x) => { const c = state.capacity.find((y) => y.teamId === x.id && y.quarterId === id); return [x.id, { headcount: c?.headcount ?? '', absenceWeeks: c?.absenceWeeks ?? 0 }]; }))); }}>{quarters.map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}</option>)}</select>}>
      <p className="text-xs text-gray-600 mb-2">{t('Uses the organisation defaults ({weeks} weeks, focus {focus}, reserve {reserve}%). Teams can refine their own assumptions on the board.', { weeks: d.weeks, focus: d.focusFactor, reserve: d.reservePct })}</p>
      <table className="text-sm">
        <thead className="text-xs text-gray-600 text-left"><tr><th className="py-1 pr-3">{t('Team')}</th><th className="pr-3">{t('Headcount')}</th><th>{t('Absence weeks (team total)')}</th></tr></thead>
        <tbody>{state.teams.map((x) => (
          <tr key={x.id}><td className="py-1 pr-3">{x.name}</td>
            <td className="pr-3"><input type="number" step="0.5" aria-label={`${t('Headcount')} ${x.name}`} className={`${input} !w-24`} value={rows[x.id]?.headcount ?? ''} onChange={(e) => setRows({ ...rows, [x.id]: { ...rows[x.id], headcount: e.target.value } })} /></td>
            <td><input type="number" step="0.5" aria-label={`${t('Absence weeks')} ${x.name}`} className={`${input} !w-24`} value={rows[x.id]?.absenceWeeks ?? 0} onChange={(e) => setRows({ ...rows, [x.id]: { ...rows[x.id], absenceWeeks: e.target.value } })} /></td></tr>))}</tbody>
      </table>
      <ErrorNote error={err} />
      <button className={`${btn.primary} mt-3`} onClick={async () => {
        for (const x of state.teams) {
          const r = rows[x.id]; if (r?.headcount === '' || r?.headcount == null) continue;
          const existing = state.capacity.find((y) => y.teamId === x.id && y.quarterId === quarterId);
          const res = await run('upsertCapacity', { teamId: x.id, quarterId, headcount: Number(r.headcount), absenceWeeks: Number(r.absenceWeeks || 0), weeks: existing?.weeks ?? d.weeks, focusFactor: existing?.focusFactor ?? d.focusFactor, reservePct: existing?.reservePct ?? d.reservePct });
          if (!res.ok) { setErr(res.error); return; }
        }
        setErr(null);
      }}>{t('Save capacity for {quarter}', { quarter: quarterLabel(state.quarters.find((q) => q.id === quarterId)) })}</button>
    </Panel>
  );
}
