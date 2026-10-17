import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { useT, LANGUAGES } from '../../i18n';
import { quarterLabel } from '../../domain/model';
import { btn, input, Field, ErrorNote } from './ui';

// Guided setup for a new organisation (docs/design.md section 17). Shown to admins while
// settings.setupComplete is false. Every step writes through the repository, so leaving halfway keeps progress.
const STEPS = ['Welcome', 'Teams', 'Themes', 'Quarter', 'Capacity', 'Epics', 'Done'];

export function OnboardingWizard({ onDone }) {
  const t = useT();
  const { state, run, reset, dataSource } = usePlan();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState(null);
  const s = state.settings;
  const next = () => setStep((x) => Math.min(STEPS.length - 1, x + 1));
  const prev = () => setStep((x) => Math.max(0, x - 1));
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r.ok; };

  return (
    <div className="max-w-3xl mx-auto">
      <ol className="flex flex-wrap gap-1 text-xs mb-4" aria-label={t('Setup steps')}>
        {STEPS.map((label, i) => <li key={label} className={`px-2 py-1 rounded ${i === step ? 'bg-indigo-600 text-white' : i < step ? 'bg-indigo-50 text-indigo-800' : 'bg-gray-100 text-gray-600'}`}>{i < step ? '✓ ' : ''}{i + 1}. {t(label)}</li>)}
      </ol>
      <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4">
        {step === 0 && <Welcome />}
        {step === 1 && <ListStep title={t('Which teams plan their quarter here?')} hint={t('One per line. A team is anything that owns epics, has capacity and answers asks from others: a squad, a department, a platform team, an external supplier.')} items={state.teams} onAdd={(name) => act('upsertTeam', { name })} onRemove={(id) => act('deleteTeam', id)} placeholder={t('e.g. Payments')} />}
        {step === 2 && <ListStep title={t('Which strategic themes does leadership steer on?')} hint={t('Three to seven themes work best. Epics without a theme are shown as "unaligned", which is useful information in itself.')} items={state.themes} onAdd={(name) => act('upsertTheme', { name })} onRemove={(id) => act('deleteTheme', id)} placeholder={t('e.g. Customer experience')} />}
        {step === 3 && <QuarterStep />}
        {step === 4 && <CapacityStep />}
        {step === 5 && <EpicsStep />}
        {step === 6 && <DoneStep />}
        <ErrorNote error={err} />
        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            {dataSource === 'mock' && <button className={btn.ghost} onClick={async () => { if (confirm(t('Replace everything with the demo organisation?'))) { await reset(); onDone(); } }}>{t('Load the demo organisation instead')}</button>}
          </div>
          <div className="flex gap-2">
            {step > 0 && <button className={btn.secondary} onClick={prev}>{t('Back')}</button>}
            {step < STEPS.length - 1 && <button className={btn.primary} onClick={next} disabled={(step === 1 && state.teams.length < 2) || (step === 3 && state.quarters.length === 0)}>{t('Next')}</button>}
            {step === STEPS.length - 1 && <button className={btn.primary} onClick={async () => { if (await act('updateSettings', { setupComplete: true })) onDone(); }}>{t('Open the board')}</button>}
          </div>
        </div>
      </section>
    </div>
  );

  function Welcome() {
    const [form, setForm] = useState({ language: s.language || 'nl', orgName: s.orgName || '', unitLabel: s.unitLabel || 'team', capacityUnit: s.capacityUnit || 'person-weeks', fiscalYearStartMonth: s.fiscalYearStartMonth || 1 });
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });
    const save = async (patch) => act('updateSettings', patch);
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('Set up your organisation')}</h2>
        <p className="text-sm text-gray-700">{t('Seven short steps: profile, teams, strategic themes, the first quarter, capacity, epics. You can change everything later in Settings.')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field l={t('Language')}><select className={input} value={form.language} onChange={(e) => { set('language')(e); save({ language: e.target.value }); }}>{LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field l={t('Organisation name')}><input className={input} value={form.orgName} onChange={set('orgName')} onBlur={() => save({ orgName: form.orgName })} placeholder={t('e.g. Gemeente Rivierenland')} /></Field>
          <Field l={t('What do you call a planning unit?')}><select className={input} value={form.unitLabel} onChange={(e) => { set('unitLabel')(e); save({ unitLabel: e.target.value }); }}>{['team', 'squad', 'product team', 'department', 'tribe'].map((u) => <option key={u} value={u}>{t(u)}</option>)}</select></Field>
          <Field l={t('Capacity unit')}><select className={input} value={form.capacityUnit} onChange={(e) => { set('capacityUnit')(e); save({ capacityUnit: e.target.value }); }}><option value="person-weeks">{t('person-weeks')}</option><option value="person-days">{t('person-days (shown as weeks ÷ 5)')}</option></select></Field>
          <Field l={t('Fiscal year starts in month')}><input type="number" min="1" max="12" className={input} value={form.fiscalYearStartMonth} onChange={set('fiscalYearStartMonth')} onBlur={() => save({ fiscalYearStartMonth: form.fiscalYearStartMonth })} /></Field>
        </div>
      </div>
    );
  }

  function QuarterStep() {
    const now = new Date(); const curQ = Math.floor(now.getMonth() / 3) + 1;
    const nextQ = curQ === 4 ? { year: now.getFullYear() + 1, q: 1 } : { year: now.getFullYear(), q: curQ + 1 };
    const [year, setYear] = useState(nextQ.year); const [q, setQ] = useState(nextQ.q);
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold">{t('Which quarter are you planning?')}</h2>
        <p className="text-sm text-gray-700">{t('Usually the next quarter. The current quarter can be added later as the "active" one for check-ins.')}</p>
        <div className="flex items-end gap-2">
          <Field l={t('Year')}><input type="number" className={`${input} !w-24`} value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
          <Field l="Q"><select className={`${input} !w-16`} value={q} onChange={(e) => setQ(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <button className={btn.secondary} onClick={() => act('upsertQuarter', { year, q })}>{t('Add quarter')}</button>
        </div>
        <ul className="text-sm">{state.quarters.map((x) => <li key={x.id}>✓ {quarterLabel(x)} — {t(x.phase)}</li>)}</ul>
      </div>
    );
  }

  function CapacityStep() {
    const planning = state.quarters.find((x) => !['closed', 'active'].includes(x.phase)) || state.quarters[0];
    const d = s.capacityDefaults || { weeks: 13, focusFactor: 0.65, reservePct: 20 };
    const [rows, setRows] = useState(() => Object.fromEntries(state.teams.map((tm) => { const c = state.capacity.find((x) => x.teamId === tm.id && x.quarterId === planning?.id); return [tm.id, { headcount: c?.headcount ?? '', absenceWeeks: c?.absenceWeeks ?? 0 }]; })));
    const [defaults, setDefaults] = useState(d);
    if (!planning) return <p className="text-sm">{t('Add a quarter first.')}</p>;
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold">{t('How much capacity does each team have in {q}?', { q: quarterLabel(planning) })}</h2>
        <p className="text-sm text-gray-700">{t('Enter headcount and planned absence (team total, never per person). Available capacity = (headcount × weeks − absence) × focus factor × (1 − reserve). Teams can refine their own assumptions on the board.')}</p>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          <Field l={t('Weeks per quarter')}><input type="number" className={input} value={defaults.weeks} onChange={(e) => setDefaults({ ...defaults, weeks: Number(e.target.value) })} /></Field>
          <Field l={t('Focus factor')}><input type="number" step="0.05" className={input} value={defaults.focusFactor} onChange={(e) => setDefaults({ ...defaults, focusFactor: Number(e.target.value) })} /></Field>
          <Field l={t('Reserve % (run / on-call)')}><input type="number" className={input} value={defaults.reservePct} onChange={(e) => setDefaults({ ...defaults, reservePct: Number(e.target.value) })} /></Field>
        </div>
        <table className="text-sm"><thead className="text-xs text-gray-600 text-left"><tr><th className="pr-3 py-1">{t('Team')}</th><th className="pr-3">{t('Headcount')}</th><th>{t('Absence weeks (team total)')}</th></tr></thead>
          <tbody>{state.teams.map((tm) => <tr key={tm.id}><td className="pr-3 py-1">{tm.name}</td>
            <td className="pr-3"><input type="number" step="0.5" aria-label={`${t('Headcount')} ${tm.name}`} className={`${input} !w-24`} value={rows[tm.id]?.headcount ?? ''} onChange={(e) => setRows({ ...rows, [tm.id]: { ...rows[tm.id], headcount: e.target.value } })} /></td>
            <td><input type="number" step="0.5" aria-label={`${t('Absence weeks')} ${tm.name}`} className={`${input} !w-24`} value={rows[tm.id]?.absenceWeeks ?? 0} onChange={(e) => setRows({ ...rows, [tm.id]: { ...rows[tm.id], absenceWeeks: e.target.value } })} /></td></tr>)}</tbody></table>
        <button className={btn.secondary} onClick={async () => {
          await act('updateSettings', { capacityDefaults: defaults });
          for (const tm of state.teams) { const r = rows[tm.id]; if (r?.headcount === '' || r?.headcount == null) continue;
            if (!await act('upsertCapacity', { teamId: tm.id, quarterId: planning.id, headcount: Number(r.headcount), absenceWeeks: Number(r.absenceWeeks || 0), weeks: defaults.weeks, focusFactor: defaults.focusFactor, reservePct: defaults.reservePct })) return; }
        }}>{t('Save capacity')}</button>
        <p className="text-xs text-gray-600">{t('{n} of {total} teams have capacity for this quarter.', { n: state.teams.filter((tm) => state.capacity.some((c) => c.teamId === tm.id && c.quarterId === planning.id && c.headcount > 0)).length, total: state.teams.length })}</p>
      </div>
    );
  }

  function EpicsStep() {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold">{t('Where do your epics come from?')}</h2>
        <ul className="text-sm space-y-2 list-disc ml-5">
          <li>{t('Type them in on the Board (per team, "+ Add epic"). Give each a strategic rank from the top and a low–high effort estimate.')}</li>
          <li>{t('Import them read-only from Azure DevOps in Settings › Import (demo data available; the real connection runs server-side). Planning fields stay in Kwartaalplan.')}</li>
          <li>{t('Loose epics are fine: a program or portfolio label is only a filter.')}</li>
        </ul>
        <p className="text-sm text-gray-700">{t('Invite people as planners per team and give a few people "can rank" (strategic priority). In demo mode the roles are the personas in "Viewing as"; with a database, memberships drive this.')}</p>
      </div>
    );
  }

  function DoneStep() {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold">{t('Ready for the first session')}</h2>
        <ol className="text-sm list-decimal ml-5 space-y-1">
          <li>{t('Prep: teams enter epics and estimates; leadership sets strategic ranks and themes.')}</li>
          <li>{t('Draft and Negotiate: teams send asks to other teams; providers answer from the intake queue.')}</li>
          <li>{t('Review: the cut line shows what does not fit; the discussion queue is the live agenda.')}</li>
          <li>{t('Vote and Lock: a hidden confidence vote, then a locked baseline. Everything after that carries a reason.')}</li>
          <li>{t('Active: light check-ins and impediments; directors read the Overview.')}</li>
        </ol>
        <p className="text-sm text-gray-700">{t('The facilitator drives the phases from the Session screen. Use "Demo tour" in the header to see each role\'s view.')}</p>
      </div>
    );
  }
}

function ListStep({ title, hint, items, onAdd, onRemove, placeholder }) {
  const t = useT();
  const [text, setText] = useState('');
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-gray-700">{hint}</p>
      <div className="flex gap-2 items-start">
        <textarea className={input} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <button className={btn.secondary} onClick={async () => { for (const name of text.split('\n').map((x) => x.trim()).filter(Boolean)) { if (!await onAdd(name)) return; } setText(''); }}>{t('Add')}</button>
      </div>
      <ul className="flex flex-wrap gap-2 text-sm">{items.map((it) => <li key={it.id} className="bg-gray-100 rounded px-2 py-1 flex items-center gap-2">{it.name}<button className="text-gray-500 hover:text-red-700" aria-label={`${t('Remove')} ${it.name}`} onClick={() => onRemove(it.id)}>×</button></li>)}</ul>
      {items.length === 0 && <p className="text-xs text-gray-600">{t('Nothing added yet.')}</p>}
    </div>
  );
}
