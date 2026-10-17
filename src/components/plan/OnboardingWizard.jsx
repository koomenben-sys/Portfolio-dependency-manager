import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { usePlan } from '../../context/PlanContext';
import { useT, LANGUAGES } from '../../i18n';
import { quarterLabel } from '../../domain/model';
import { cls, ErrorLine } from './core';

// Three steps to a first ranked list (docs/design.md section 19, D32): organisation, teams, quarter + first
// epics. Every step writes through the repository, so leaving halfway keeps progress. Themes, capacity and
// fiscal-year settings live in Instellingen / the extended modules, not here.
const STEPS = ['Organisation', 'Teams', 'Quarter and epics'];

export function OnboardingWizard({ onDone }) {
  const t = useT();
  const { state, run, reset, dataSource } = usePlan();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState(null);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const finish = async (target) => { const r = await act('updateSettings', { setupComplete: true }); if (r.ok) onDone(target); };

  return (
    <div className="max-w-2xl mx-auto mt-6">
      <ol className="flex items-center gap-2 text-caption mb-5" aria-label={t('Setup steps')}>
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-full tnum ${i === step ? 'bg-accent text-accent-fg font-medium' : i < step ? 'bg-accent-50 text-accent-700' : 'bg-surface-2 text-muted'}`}>{i < step ? <Check size={12} aria-hidden="true" /> : <span>{i + 1}</span>}{t(label)}</span>
            {i < STEPS.length - 1 && <span className="w-6 border-t border-border" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <section className={`${cls.card} p-6 space-y-5`}>
        {step === 0 && <OrgStep state={state} act={act} t={t} />}
        {step === 1 && <TeamsStep state={state} act={act} t={t} />}
        {step === 2 && <QuarterStep state={state} act={act} t={t} setErr={setErr} finish={finish} />}
        <ErrorLine error={err} />
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div>{dataSource === 'mock' && <button className={cls.quiet} onClick={async () => { if (confirm(t('Replace everything with the demo organisation?'))) { await reset(); onDone('prioriteren'); } }}>{t('Load the demo organisation instead')}</button>}</div>
          <div className="flex gap-2">
            {step > 0 && <button className={cls.secondary} onClick={() => setStep(step - 1)}>{t('Back')}</button>}
            {step < 2 && <button className={cls.primary} onClick={() => setStep(step + 1)} disabled={step === 1 && state.teams.length < 2}>{t('Next')}</button>}
          </div>
        </div>
      </section>
    </div>
  );
}

function OrgStep({ state, act, t }) {
  const s = state.settings;
  return (
    <div className="space-y-4">
      <h1 className="text-title">{t('Your organisation')}</h1>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={cls.label}>{t('Name')}</span><input className={cls.input} defaultValue={s.orgName || ''} placeholder={t('e.g. Gemeente Rivierenland')} onBlur={(e) => e.target.value !== (s.orgName || '') && act('updateSettings', { orgName: e.target.value })} /></label>
        <label className="block"><span className={cls.label}>{t('Language')}</span><select className={cls.input} value={s.language || 'nl'} onChange={(e) => act('updateSettings', { language: e.target.value })}>{LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
    </div>
  );
}

function TeamsStep({ state, act, t }) {
  const [text, setText] = useState('');
  const add = async () => { for (const name of text.split('\n').map((x) => x.trim()).filter(Boolean)) { const r = await act('upsertTeam', { name }); if (!r.ok) return; } setText(''); };
  return (
    <div className="space-y-4">
      <h1 className="text-title">{t('Which teams plan here?')}</h1>
      <div className="flex gap-2 items-start">
        <textarea className={cls.textarea} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('One team per line')} aria-label={t('Teams')} />
        <button className={cls.secondary} onClick={add} disabled={!text.trim()}>{t('Add')}</button>
      </div>
      <ul className="flex flex-wrap gap-2">{state.teams.map((x) => <li key={x.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-surface-2 text-label">{x.name}<button className={`${cls.icon} !w-6 !h-6`} aria-label={`${t('Remove')} ${x.name}`} onClick={() => act('deleteTeam', x.id)}><X size={12} /></button></li>)}</ul>
      {state.teams.length < 2 && <p className="text-caption text-muted">{t('At least two teams.')}</p>}
    </div>
  );
}

function QuarterStep({ state, act, t, setErr, finish }) {
  const now = new Date(); const curQ = Math.floor(now.getMonth() / 3) + 1;
  const nextQ = curQ === 4 ? { year: now.getFullYear() + 1, q: 1 } : { year: now.getFullYear(), q: curQ + 1 };
  const existing = state.quarters.find((x) => !['closed', 'active'].includes(x.phase));
  const [year, setYear] = useState(existing?.year ?? nextQ.year);
  const [q, setQ] = useState(existing?.q ?? nextQ.q);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const teamByName = new Map(state.teams.map((x) => [x.name.toLowerCase(), x.id]));

  const go = async () => {
    setBusy(true);
    try {
      let quarter = state.quarters.find((x) => x.year === Number(year) && x.q === Number(q));
      if (!quarter) {
        const r = await act('upsertQuarter', { year: Number(year), q: Number(q) }); if (!r.ok) return;
        quarter = r.result.quarters.find((x) => x.year === Number(year) && x.q === Number(q));
      }
      const lines = text.split('\n').map((x) => x.trim()).filter(Boolean);
      const parsed = lines.map((line) => { const m = line.match(/^(.+?)\s*:\s*(.+)$/); return m ? { team: m[1].trim(), title: m[2].trim() } : { team: null, title: line }; });
      const unknown = parsed.find((p) => !p.team || !teamByName.has(p.team.toLowerCase()));
      if (unknown) { setErr(t('Unknown team in "{line}". Use "Team: title".', { line: unknown.team ? `${unknown.team}: ${unknown.title}` : unknown.title })); return; }
      const planIds = [];
      for (const p of parsed) {
        const r = await act('createEpic', { teamId: teamByName.get(p.team.toLowerCase()), title: p.title }); if (!r.ok) return;
        const r2 = await act('upsertPlan', { epicId: r.result.id, quarterId: quarter.id, commitment: 'draft', effortLow: 0, effortHigh: 0 }); if (!r2.ok) return;
        const plan = r2.result.plans.find((x) => x.epicId === r.result.id && x.quarterId === quarter.id); if (plan) planIds.push(plan.id);
      }
      if (planIds.length) { const r = await act('reorderPlans', quarter.id, planIds, t('First entry')); if (!r.ok) return; }
      await finish('prioriteren');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-title">{t('Quarter and first epics')}</h1>
      <div className="flex items-end gap-2">
        <label className="block"><span className={cls.label}>{t('Year')}</span><input type="number" className={`${cls.input} !w-24 tnum`} value={year} onChange={(e) => setYear(e.target.value)} /></label>
        <label className="block"><span className={cls.label}>Q</span><select className={`${cls.input} !w-16`} value={q} onChange={(e) => setQ(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        {existing && <span className="text-caption text-muted pb-2">{t('Existing: {q}', { q: quarterLabel(existing) })}</span>}
      </div>
      <label className="block"><span className={cls.label}>{t('First epics')}</span>
        <textarea className={`${cls.textarea} font-mono text-label`} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={`${state.teams[0]?.name || 'Team'}: ${t('Example epic')}\n${state.teams[1]?.name || 'Team'}: …`} />
      </label>
      <p className="text-caption text-muted">{t('One per line, "Team: title".')}</p>
      <div className="flex items-center justify-between">
        <button className={cls.quiet} onClick={() => finish('instellingen')}>{t('Import from Azure DevOps (demo)')}</button>
        <button className={cls.primary} onClick={go} disabled={busy}>{t('Go to Prioritise')}</button>
      </div>
    </div>
  );
}
