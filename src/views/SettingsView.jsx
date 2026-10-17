import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { isAdmin, canRank } from '../data/repository';
import { PHASES, quarterLabel } from '../domain/model';
import { useT } from '../i18n';
import { Panel, btn, input, Field, ErrorNote, Empty, Modal } from '../components/plan/ui';
import { mapWorkItems, previewImport } from '../integrations/azureDevOps/mapper';
import { MOCK_ADO_RESPONSE } from '../integrations/azureDevOps/mock';
import { fetchEpics } from '../integrations/azureDevOps/client';
import { SetupPanel, BulkCapacity, MembersPanel } from '../components/plan/SetupPanel';

// Teams, themes, quarters, cadence, ADO import, JSON export, demo reset (AC A3, G1-G6).
export function SettingsView() {
  const { state, actor, run, reset, dataSource } = usePlan();
  const t = useT();
  const [err, setErr] = useState(null);
  const admin = isAdmin(actor);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kwartaalplan-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{t('Settings')} <span className="text-sm font-normal text-gray-600">— {t('data source: {source}', { source: dataSource })}</span></h2>
      <ErrorNote error={err} />
      <SetupPanel onGoTo={(id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      {!admin && <Empty>{t('Most settings are admin-only. Themes can be edited by users with rank permission.')}</Empty>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div id="teams"><Panel title={t('Planning units ({unit})', { unit: state.settings.unitLabel ? t(state.settings.unitLabel) : t('teams') })}>
          <ul className="space-y-1 text-sm">
            {state.teams.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                <input className={input} defaultValue={x.name} disabled={!admin} onBlur={(e) => e.target.value !== x.name && act('upsertTeam', { id: x.id, name: e.target.value })} />
                {admin && <button className={btn.danger} onClick={() => act('deleteTeam', x.id)}>{t('remove')}</button>}
              </li>
            ))}
          </ul>
          {admin && <AddRow placeholder={t('New team')} onAdd={(name) => act('upsertTeam', { name })} />}
          <p className="text-xs text-gray-600 mt-2">{t('Capacity per team per quarter: below ("Capacity for all teams at once") or per team on the board ("Capacity assumptions").')}</p>
        </Panel></div>

        <div id="themes"><Panel title={t('Strategic themes (top-down)')}>
          <ul className="space-y-1 text-sm">
            {state.themes.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                <input className={input} defaultValue={x.name} disabled={!canRank(actor)} onBlur={(e) => e.target.value !== x.name && act('upsertTheme', { id: x.id, name: e.target.value })} />
                {canRank(actor) && <button className={btn.danger} onClick={() => act('deleteTheme', x.id)}>{t('remove')}</button>}
              </li>
            ))}
          </ul>
          {canRank(actor) && <AddRow placeholder={t('New theme')} onAdd={(name) => act('upsertTheme', { name })} />}
        </Panel></div>

        <div id="quarters"><Panel title={t('Quarters')}>
          <ul className="space-y-1 text-sm">{state.quarters.map((q) => <li key={q.id} className="flex justify-between"><span>{quarterLabel(q)}</span><span className="text-xs text-gray-500">{t(PHASES.find((p) => p.id === q.phase)?.label || q.phase)}{q.baseline ? ` · ${t('baseline')}` : ''}</span></li>)}</ul>
          {admin && <NewQuarter onAdd={(year, q) => act('upsertQuarter', { year, q })} />}
          <p className="text-xs text-gray-600 mt-2">{t('Phases are advanced from the Session screen.')}</p>
        </Panel></div>

        <Panel title={t('Cadence and data')}>
          <Field l={t('Check-in cadence (days before an epic is stale)')}>
            <input type="number" min="1" className={`${input} !w-24`} defaultValue={state.settings.staleDays} disabled={!admin} onBlur={(e) => Number(e.target.value) !== state.settings.staleDays && act('updateSettings', { staleDays: Number(e.target.value) })} />
          </Field>
          <div className="flex gap-2 mt-4">
            <button className={btn.secondary} onClick={exportJson}>{t('Export JSON')}</button>
            {admin && dataSource === 'mock' && <button className={btn.secondary} onClick={() => confirm(t('Reset all demo data to the seed?')) && reset()}>{t('Reset demo data')}</button>}
            {admin && dataSource === 'mock' && <button className={btn.secondary} onClick={async () => { if (confirm(t('Start with an empty organisation? The demo data is removed from this browser.'))) { await run('resetEmpty', state.settings.language); window.location.hash = 'board'; } }}>{t('Start with an empty organisation')}</button>}
          </div>
        </Panel>
      </div>

      <div id="members"><MembersPanel /></div>
      <div id="capacity"><BulkCapacity /></div>
      <div id="import">{admin && <AdoImport />}</div>
    </div>
  );
}

function AddRow({ placeholder, onAdd }) {
  const t = useT();
  const [v, setV] = useState('');
  return <div className="flex gap-2 mt-2"><input className={input} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} /><button className={btn.secondary} disabled={!v.trim()} onClick={async () => { const r = await onAdd(v.trim()); if (r.ok) setV(''); }}>{t('Add')}</button></div>;
}
function NewQuarter({ onAdd }) {
  const t = useT();
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const [q, setQ] = useState(1);
  return <div className="flex gap-2 mt-2 items-end"><Field l={t('Year')}><input type="number" className={`${input} !w-24`} value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field><Field l="Q"><select className={`${input} !w-16`} value={q} onChange={(e) => setQ(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field><button className={btn.secondary} onClick={() => onAdd(year, q)}>{t('Add quarter')}</button></div>;
}

// Read-only ADO import, mock by default (D22, AC G1-G6).
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
    <Panel title={t('Import from Azure DevOps (read-only)')} right={<span className="text-xs text-gray-500">{t('Not tested against a real organisation in this iteration')}</span>}>
      <p className="text-xs text-gray-600 mb-3">{t('Imported fields (title, state, link) are mastered by Azure DevOps and become read-only. Planning fields (rank, effort, commitment, asks) stay local and are never overwritten. No credentials are stored in the app; production sync runs server-side (Edge Function + Vault).')}</p>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Field l={t('Organization')}><input className={input} value={cfg.organization} onChange={(e) => setCfg({ ...cfg, organization: e.target.value })} /></Field>
        <Field l={t('Project')}><input className={input} value={cfg.project} onChange={(e) => setCfg({ ...cfg, project: e.target.value })} /></Field>
      </div>
      <div className="flex gap-2 mt-3">
        <button className={btn.primary} onClick={loadMock}>{t('Use demo data')}</button>
        <button className={btn.secondary} disabled={!envPat || busy} title={envPat ? t('Uses VITE_ADO_PAT from your local .env (dev only)') : t('Set VITE_ADO_PAT in your local .env to enable (dev only)')} onClick={loadLive}>{busy ? t('Fetching…') : t('Fetch live (dev only)')}</button>
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
    </Panel>
  );
}
