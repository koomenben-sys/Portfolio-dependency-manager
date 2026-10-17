import React, { useState } from 'react';
import { Check, Circle } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { isAdmin, canRank } from '../data/repository';
import { PHASES, quarterLabel } from '../domain/model';
import { useT, LANGUAGES } from '../i18n';
import { cls, ViewHeader, ErrorLine } from '../components/plan/core';
import { Field, input, btn, ErrorNote } from '../components/plan/ui';
import { mapWorkItems, previewImport } from '../integrations/azureDevOps/mapper';
import { MOCK_ADO_RESPONSE } from '../integrations/azureDevOps/mock';
import { fetchEpics } from '../integrations/azureDevOps/client';
import { BulkCapacity } from '../components/plan/SetupPanel';
import { MembersAdmin } from '../components/plan/MembersAdmin';

// Instellingen (docs/design.md section 19): plain sections — Organisatie · Teams · Kwartalen · Mensen & rollen ·
// Import · Demo · Uitgebreide modules (beta). The setup checklist shows only the three essentials, only while
// incomplete. Themes, capacity and cadence appear only when the extended modules are on.
export function SettingsView() {
  const { state, actor, run, reset, dataSource } = usePlan();
  const t = useT();
  const [err, setErr] = useState(null);
  const admin = isAdmin(actor);
  const modules = !!state.settings.modules;
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const planning = state.quarters.find((q) => !['closed', 'active'].includes(q.phase)) || state.quarters[0];
  const essentials = [
    { id: 'teams', label: t('Teams'), done: state.teams.length >= 2 },
    { id: 'quarters', label: t('Quarter'), done: !!planning },
    { id: 'epics', label: t('Epics'), done: !!planning && state.plans.some((p) => p.quarterId === planning.id), href: '#prioriteren' },
  ];
  const incomplete = essentials.some((e) => !e.done);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kwartaalplan-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };

  return (
    <div className="max-w-3xl">
      <ViewHeader title={t('Settings')} meta={dataSource === 'mock' ? 'Demo' : 'Supabase'} />
      <ErrorLine error={err} />
      {incomplete && (
        <ol className={`${cls.card} p-3 mb-5 flex flex-wrap gap-4 text-label`} aria-label={t('Setup')}>
          {essentials.map((e) => <li key={e.id} className="inline-flex items-center gap-1.5">{e.done ? <Check size={14} className="text-ok" aria-hidden="true" /> : <Circle size={14} className="text-faint" aria-hidden="true" />}<a className={e.done ? 'text-muted' : 'text-accent hover:underline'} href={e.href || `#${e.id}`} onClick={(ev) => { if (!e.href) { ev.preventDefault(); document.getElementById(e.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }}>{e.label}</a></li>)}
        </ol>
      )}

      <div className="space-y-8">
        <Section id="organisation" title={t('Organisation')}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={cls.label}>{t('Name')}</span><input className={cls.input} defaultValue={state.settings.orgName || ''} disabled={!admin} onBlur={(e) => e.target.value !== (state.settings.orgName || '') && act('updateSettings', { orgName: e.target.value })} /></label>
            <label className="block"><span className={cls.label}>{t('Language')}</span><select className={cls.input} value={state.settings.language || 'nl'} onChange={(e) => act('updateSettings', { language: e.target.value })}>{LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
        </Section>

        <Section id="teams" title={t('Teams')} meta={state.teams.length}>
          <ul className="divide-y divide-border">
            {state.teams.map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-1.5">
                <input className={`${cls.input} max-w-sm`} defaultValue={x.name} disabled={!admin} aria-label={t('Team')} onBlur={(e) => e.target.value.trim() && e.target.value !== x.name && act('upsertTeam', { id: x.id, name: e.target.value.trim() })} />
                {admin && <button className={`${cls.quiet} text-danger-fg`} onClick={() => act('deleteTeam', x.id)}>{t('remove')}</button>}
              </li>
            ))}
          </ul>
          {admin && <AddRow placeholder={t('New team')} onAdd={(name) => act('upsertTeam', { name })} />}
        </Section>

        <Section id="quarters" title={t('Quarters')}>
          <ul className="divide-y divide-border">{state.quarters.map((q) => <li key={q.id} className="flex justify-between py-1.5 text-body"><span className="tnum">{quarterLabel(q)}</span>{modules && <span className="text-caption text-muted">{t(PHASES.find((p) => p.id === q.phase)?.label || q.phase)}{q.baseline ? ` · ${t('baseline')}` : ''}</span>}</li>)}</ul>
          {admin && <NewQuarter onAdd={(year, q) => act('upsertQuarter', { year, q })} />}
        </Section>

        <Section id="members" title={t('People and roles')}><MembersAdmin /></Section>

        {admin && <Section id="import" title={t('Import')}><AdoImport /></Section>}

        <Section id="demo" title={dataSource === 'mock' ? t('Demo') : t('Data')}>
          <div className="flex flex-wrap gap-2">
            <button className={cls.secondary} onClick={exportJson}>{t('Export JSON')}</button>
            {admin && dataSource === 'mock' && <button className={cls.secondary} onClick={() => confirm(t('Reset all demo data to the seed?')) && reset()}>{t('Reset demo data')}</button>}
            {admin && dataSource === 'mock' && <button className={cls.secondary} onClick={async () => { if (confirm(t('Start with an empty organisation? The demo data is removed from this browser.'))) { await run('resetEmpty', state.settings.language); window.location.hash = 'prioriteren'; } }}>{t('Start with an empty organisation')}</button>}
          </div>
        </Section>

        {admin && (
          <Section id="modules" title={t('Extended modules (beta)')}>
            <label className="flex items-center gap-3 text-body cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[var(--color-accent-500)]" checked={modules} onChange={(e) => act('updateSettings', { modules: e.target.checked })} />
              <span>{t('Overview, Board, Session, In-quarter, My attention')}</span>
            </label>
          </Section>
        )}

        {modules && (
          <>
            <Section id="themes" title={t('Strategic themes')}>
              <ul className="divide-y divide-border">
                {state.themes.map((x) => <li key={x.id} className="flex items-center gap-2 py-1.5"><input className={`${cls.input} max-w-sm`} defaultValue={x.name} disabled={!canRank(actor)} aria-label={t('Theme')} onBlur={(e) => e.target.value !== x.name && act('upsertTheme', { id: x.id, name: e.target.value })} />{canRank(actor) && <button className={`${cls.quiet} text-danger-fg`} onClick={() => act('deleteTheme', x.id)}>{t('remove')}</button>}</li>)}
              </ul>
              {canRank(actor) && <AddRow placeholder={t('New theme')} onAdd={(name) => act('upsertTheme', { name })} />}
            </Section>
            <Section id="capacity" title={t('Capacity')}><BulkCapacity /></Section>
            <Section id="cadence" title={t('Cadence')}>
              <label className="block max-w-xs"><span className={cls.label}>{t('Check-in cadence (days before an epic is stale)')}</span><input type="number" min="1" className={`${cls.input} !w-24 tnum`} defaultValue={state.settings.staleDays} disabled={!admin} onBlur={(e) => Number(e.target.value) !== state.settings.staleDays && act('updateSettings', { staleDays: Number(e.target.value) })} /></label>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ id, title, meta, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20">
      <h2 id={`${id}-h`} className="text-subtitle font-semibold mb-2 flex items-baseline gap-2">{title}{meta != null && <span className="text-caption text-muted tnum font-normal">{meta}</span>}</h2>
      <div className={`${cls.card} p-4`}>{children}</div>
    </section>
  );
}

function AddRow({ placeholder, onAdd }) {
  const t = useT();
  const [v, setV] = useState('');
  return <form className="flex gap-2 mt-3" onSubmit={async (e) => { e.preventDefault(); const r = await onAdd(v.trim()); if (r.ok) setV(''); }}><input className={`${cls.input} max-w-sm`} placeholder={placeholder} aria-label={placeholder} value={v} onChange={(e) => setV(e.target.value)} /><button type="submit" className={cls.secondary} disabled={!v.trim()}>{t('Add')}</button></form>;
}
function NewQuarter({ onAdd }) {
  const t = useT();
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const [q, setQ] = useState(1);
  return <div className="flex gap-2 mt-3 items-end"><label className="block"><span className={cls.label}>{t('Year')}</span><input type="number" className={`${cls.input} !w-24 tnum`} value={year} onChange={(e) => setYear(Number(e.target.value))} /></label><label className="block"><span className={cls.label}>Q</span><select className={`${cls.input} !w-16`} value={q} onChange={(e) => setQ(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><button className={cls.secondary} onClick={() => onAdd(year, q)}>{t('Add quarter')}</button></div>;
}

// Read-only ADO import, mock by default (D22, AC G1-G6). Unchanged behaviour; lives under Instellingen › Import.
function AdoImport() {
  const { state, run } = usePlan();
  const t = useT();
  const [cfg, setCfg] = useState({ organization: 'oranje', project: 'Digital' });
  const [external, setExternal] = useState(null);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const envPat = import.meta.env.VITE_ADO_PAT;

  const loadMock = () => { const x = mapWorkItems(MOCK_ADO_RESPONSE, cfg); setExternal(x); autoMap(x); setResult(null); };
  const loadLive = async () => {
    setBusy(true); setErr(null);
    try { const resp = await fetchEpics({ ...cfg, pat: envPat }); const x = mapWorkItems(resp, cfg); setExternal(x); autoMap(x); setResult(null); }
    catch (e) { setErr(t('Live fetch failed: {message}. Note: browsers block cross-origin calls to dev.azure.com without a proxy; the production path is an Edge Function.', { message: e.message })); }
    finally { setBusy(false); }
  };
  const autoMap = (x) => {
    const m = {};
    for (const hint of new Set(x.map((e) => e.teamHint))) { const tm = state.teams.find((tt) => tt.name.toLowerCase() === hint.toLowerCase()); if (tm) m[hint] = tm.id; }
    setMapping(m);
  };
  const preview = external ? previewImport(external, state.epics, mapping) : null;
  const hints = external ? [...new Set(external.map((e) => e.teamHint))] : [];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Field l={t('Organization')}><input className={input} value={cfg.organization} onChange={(e) => setCfg({ ...cfg, organization: e.target.value })} /></Field>
        <Field l={t('Project')}><input className={input} value={cfg.project} onChange={(e) => setCfg({ ...cfg, project: e.target.value })} /></Field>
      </div>
      <div className="flex gap-2 mt-3">
        <button className={cls.primary} onClick={loadMock}>{t('Use demo data')}</button>
        <button className={cls.secondary} disabled={!envPat || busy} title={envPat ? t('Uses VITE_ADO_PAT from your local .env (dev only)') : t('Set VITE_ADO_PAT in your local .env to enable (dev only)')} onClick={loadLive}>{busy ? t('Fetching…') : t('Fetch live (dev only)')}</button>
      </div>
      <ErrorNote error={err} />
      {preview && (
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <h4 className="font-semibold mb-1">{t('Team mapping (area path → team)')}</h4>
            <div className="flex flex-wrap gap-3">
              {hints.map((h) => <label key={h} className="flex items-center gap-1 text-xs">{h} →
                <select className={`${input} !w-auto`} value={mapping[h] || ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value || undefined })}><option value="">{t('— not mapped —')}</option>{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><h4 className="font-semibold">{t('New')} ({preview.created.length})</h4><ul className="text-xs">{preview.created.map((x) => <li key={x.externalId}>#{x.externalId} {x.title}</li>)}</ul></div>
            <div><h4 className="font-semibold">{t('Updated')} ({preview.updated.length})</h4><ul className="text-xs">{preview.updated.map(({ x, cur, titleChanged }) => <li key={x.externalId}>{cur.refCode} ← #{x.externalId}{titleChanged ? ` (${t('title → "{title}"', { title: x.title })})` : ''}</li>)}</ul></div>
            <div><h4 className="font-semibold">{t('Without team')} ({preview.unmapped.length})</h4><ul className="text-xs">{preview.unmapped.map((x) => <li key={x.externalId}>#{x.externalId} {x.title} <span className="text-gray-500">({x.teamHint})</span></li>)}</ul></div>
          </div>
          <button className={btn.primary} onClick={async () => { const r = await run('importExternalEpics', external, mapping); if (r.ok) setResult(r.result); else setErr(r.error); }}>{t('Import {n} items', { n: preview.created.length + preview.updated.length })}</button>
          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs">
              {t('Imported: {created} created, {updated} updated.', { created: result.created, updated: result.updated })}
              {result.suggestions.length > 0 && <div className="mt-1">{t('Dependency suggestions from links (confirm from the epic panel, not created automatically):')} <ul className="list-disc ml-4">{result.suggestions.map((s, i) => { const from = state.epics.find((e) => e.id === s.fromEpicId); const to = state.teams.find((x) => x.id === s.toTeamId); return <li key={i}>{t('{epic} may need {team}', { epic: `${from?.refCode} ${from?.title}`, team: to?.name })}</li>; })}</ul></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
