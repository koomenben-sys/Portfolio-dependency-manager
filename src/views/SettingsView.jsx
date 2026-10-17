import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { isAdmin, canRank } from '../data/repository';
import { PHASES, quarterLabel } from '../domain/model';
import { Panel, btn, input, Field, ErrorNote, Empty, Modal } from '../components/plan/ui';
import { mapWorkItems, previewImport } from '../integrations/azureDevOps/mapper';
import { MOCK_ADO_RESPONSE } from '../integrations/azureDevOps/mock';
import { fetchEpics } from '../integrations/azureDevOps/client';
import { SetupPanel, BulkCapacity, MembersPanel } from '../components/plan/SetupPanel';

// Teams, themes, quarters, cadence, ADO import, JSON export, demo reset (AC A3, G1-G6).
export function SettingsView() {
  const { state, actor, run, reset, dataSource } = usePlan();
  const [err, setErr] = useState(null);
  const admin = isAdmin(actor);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kwartaalplan-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Settings <span className="text-sm font-normal text-gray-600">— data source: {dataSource}</span></h2>
      <ErrorNote error={err} />
      <SetupPanel onGoTo={(id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      {!admin && <Empty>Most settings are admin-only. Themes can be edited by users with rank permission.</Empty>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div id="teams"><Panel title={`Planning units (${state.settings.unitLabel || 'teams'})`}>
          <ul className="space-y-1 text-sm">
            {state.teams.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <input className={input} defaultValue={t.name} disabled={!admin} onBlur={(e) => e.target.value !== t.name && act('upsertTeam', { id: t.id, name: e.target.value })} />
                {admin && <button className={btn.danger} onClick={() => act('deleteTeam', t.id)}>remove</button>}
              </li>
            ))}
          </ul>
          {admin && <AddRow placeholder="New team" onAdd={(name) => act('upsertTeam', { name })} />}
          <p className="text-xs text-gray-600 mt-2">Capacity per team per quarter: below ("Capacity for all teams at once") or per team on the board ("Capacity assumptions").</p>
        </Panel></div>

        <div id="themes"><Panel title="Strategic themes (top-down)">
          <ul className="space-y-1 text-sm">
            {state.themes.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <input className={input} defaultValue={t.name} disabled={!canRank(actor)} onBlur={(e) => e.target.value !== t.name && act('upsertTheme', { id: t.id, name: e.target.value })} />
                {canRank(actor) && <button className={btn.danger} onClick={() => act('deleteTheme', t.id)}>remove</button>}
              </li>
            ))}
          </ul>
          {canRank(actor) && <AddRow placeholder="New theme" onAdd={(name) => act('upsertTheme', { name })} />}
        </Panel></div>

        <div id="quarters"><Panel title="Quarters">
          <ul className="space-y-1 text-sm">{state.quarters.map((q) => <li key={q.id} className="flex justify-between"><span>{quarterLabel(q)}</span><span className="text-xs text-gray-500">{PHASES.find((p) => p.id === q.phase)?.label}{q.baseline ? ' · baseline' : ''}</span></li>)}</ul>
          {admin && <NewQuarter onAdd={(year, q) => act('upsertQuarter', { year, q })} />}
          <p className="text-xs text-gray-600 mt-2">Phases are advanced from the Session screen.</p>
        </Panel></div>

        <Panel title="Cadence and data">
          <Field l="Check-in cadence (days before an epic is stale)">
            <input type="number" min="1" className={`${input} !w-24`} defaultValue={state.settings.staleDays} disabled={!admin} onBlur={(e) => Number(e.target.value) !== state.settings.staleDays && act('updateSettings', { staleDays: Number(e.target.value) })} />
          </Field>
          <div className="flex gap-2 mt-4">
            <button className={btn.secondary} onClick={exportJson}>Export JSON</button>
            {admin && dataSource === 'mock' && <button className={btn.secondary} onClick={() => confirm('Reset all demo data to the seed?') && reset()}>Reset demo data</button>}
            {admin && dataSource === 'mock' && <button className={btn.secondary} onClick={async () => { if (confirm('Start with an empty organisation? The demo data is removed from this browser.')) { await run('resetEmpty', state.settings.language); window.location.hash = 'board'; } }}>Start with an empty organisation</button>}
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
  const [v, setV] = useState('');
  return <div className="flex gap-2 mt-2"><input className={input} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} /><button className={btn.secondary} disabled={!v.trim()} onClick={async () => { const r = await onAdd(v.trim()); if (r.ok) setV(''); }}>Add</button></div>;
}
function NewQuarter({ onAdd }) {
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const [q, setQ] = useState(1);
  return <div className="flex gap-2 mt-2 items-end"><Field l="Year"><input type="number" className={`${input} !w-24`} value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field><Field l="Q"><select className={`${input} !w-16`} value={q} onChange={(e) => setQ(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field><button className={btn.secondary} onClick={() => onAdd(year, q)}>Add quarter</button></div>;
}

// Read-only ADO import, mock by default (D22, AC G1-G6).
function AdoImport() {
  const { state, run } = usePlan();
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
    catch (e) { setErr(`Live fetch failed: ${e.message}. Note: browsers block cross-origin calls to dev.azure.com without a proxy; the production path is an Edge Function.`); }
    finally { setBusy(false); }
  };
  const autoMap = (x) => {
    const m = {};
    for (const hint of new Set(x.map((e) => e.teamHint))) { const t = state.teams.find((tt) => tt.name.toLowerCase() === hint.toLowerCase()); if (t) m[hint] = t.id; }
    setMapping(m);
  };
  const preview = external ? previewImport(external, state.epics, mapping) : null;
  const hints = external ? [...new Set(external.map((e) => e.teamHint))] : [];

  return (
    <Panel title="Import from Azure DevOps (read-only)" right={<span className="text-xs text-gray-500">Not tested against a real organisation in this iteration</span>}>
      <p className="text-xs text-gray-600 mb-3">Imported fields (title, state, link) are mastered by Azure DevOps and become read-only. Planning fields (rank, effort, commitment, asks) stay local and are never overwritten. No credentials are stored in the app; production sync runs server-side (Edge Function + Vault).</p>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Field l="Organization"><input className={input} value={cfg.organization} onChange={(e) => setCfg({ ...cfg, organization: e.target.value })} /></Field>
        <Field l="Project"><input className={input} value={cfg.project} onChange={(e) => setCfg({ ...cfg, project: e.target.value })} /></Field>
      </div>
      <div className="flex gap-2 mt-3">
        <button className={btn.primary} onClick={loadMock}>Use demo data</button>
        <button className={btn.secondary} disabled={!envPat || busy} title={envPat ? 'Uses VITE_ADO_PAT from your local .env (dev only)' : 'Set VITE_ADO_PAT in your local .env to enable (dev only)'} onClick={loadLive}>{busy ? 'Fetching…' : 'Fetch live (dev only)'}</button>
      </div>
      <ErrorNote error={err} />

      {preview && (
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <h4 className="font-semibold mb-1">Team mapping (area path → team)</h4>
            <div className="flex flex-wrap gap-3">
              {hints.map((h) => <label key={h} className="flex items-center gap-1 text-xs">{h} →
                <select className={`${input} !w-auto`} value={mapping[h] || ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value || undefined })}><option value="">— not mapped —</option>{state.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><h4 className="font-semibold">New ({preview.created.length})</h4><ul className="text-xs">{preview.created.map((x) => <li key={x.externalId}>#{x.externalId} {x.title}</li>)}</ul></div>
            <div><h4 className="font-semibold">Updated ({preview.updated.length})</h4><ul className="text-xs">{preview.updated.map(({ x, cur, titleChanged }) => <li key={x.externalId}>{cur.refCode} ← #{x.externalId}{titleChanged ? ` (title → "${x.title}")` : ''}</li>)}</ul></div>
            <div><h4 className="font-semibold">Without team ({preview.unmapped.length})</h4><ul className="text-xs">{preview.unmapped.map((x) => <li key={x.externalId}>#{x.externalId} {x.title} <span className="text-gray-500">({x.teamHint})</span></li>)}</ul></div>
          </div>
          <button className={btn.primary} onClick={async () => { const r = await run('importExternalEpics', external, mapping); if (r.ok) setResult(r.result); else setErr(r.error); }}>Import {preview.created.length + preview.updated.length} items</button>
          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs">
              Imported: {result.created} created, {result.updated} updated.
              {result.suggestions.length > 0 && <div className="mt-1">Dependency suggestions from links (confirm from the epic panel, not created automatically): <ul className="list-disc ml-4">{result.suggestions.map((s, i) => { const from = state.epics.find((e) => e.id === s.fromEpicId); const to = state.teams.find((t) => t.id === s.toTeamId); return <li key={i}>{from?.refCode} {from?.title} may need {to?.name}</li>; })}</ul></div>}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
