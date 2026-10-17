import React, { useMemo, useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { teamLoad } from '../domain/capacity';
import { teamPlans, teamCutEpicId, epicDeps, worstResponse, incomingForTeam, changedSinceBaseline, latestCheckIn, daysUntil } from '../domain/plan';
import { COMMITMENTS, COMMITMENT_META, RESPONSE_META, quarterLabel } from '../domain/model';
import { CommitmentPill, CapacityBar, Pill, btn, input, Modal, Field, ErrorNote, Empty } from '../components/plan/ui';
import { EpicPanel } from '../components/plan/EpicPanel';

// Quarter board: team lanes, epics by strategic rank, capacity bar + cut line (AC B1-B8).
export function BoardView() {
  const { state, actor, quarter, run } = usePlan();
  const [filters, setFilters] = useState({ label: '', theme: '', commitment: '', regulatory: false, unaligned: false });
  const [dense, setDense] = useState(false);
  const [openEpic, setOpenEpic] = useState(null);
  const [addFor, setAddFor] = useState(null);
  const [showAssumptions, setShowAssumptions] = useState(null);
  if (!quarter) return null;

  const labels = useMemo(() => [...new Set(state.epics.map((e) => e.label).filter(Boolean))].sort(), [state.epics]);
  const epicsById = useMemo(() => new Map(state.epics.map((e) => [e.id, e])), [state.epics]);

  const passes = (e) => (!filters.label || e.label === filters.label) && (!filters.theme || e.themeId === filters.theme)
    && (!filters.regulatory || e.regulatory) && (!filters.unaligned || !e.themeId);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-xl font-bold mr-2">Quarter board · {quarterLabel(quarter)}</h2>
        <select className={`${input} !w-auto`} value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })}>
          <option value="">All labels</option>{labels.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={filters.theme} onChange={(e) => setFilters({ ...filters, theme: e.target.value })}>
          <option value="">All themes</option>{state.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={filters.commitment} onChange={(e) => setFilters({ ...filters, commitment: e.target.value })}>
          <option value="">All commitments</option>{COMMITMENTS.map((c) => <option key={c} value={c}>{COMMITMENT_META[c].label}</option>)}
        </select>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={filters.regulatory} onChange={(e) => setFilters({ ...filters, regulatory: e.target.checked })} /> Regulatory only</label>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={filters.unaligned} onChange={(e) => setFilters({ ...filters, unaligned: e.target.checked })} /> Unaligned only</label>
        <button className={btn.secondary} onClick={() => setDense(!dense)}>{dense ? 'Comfortable' : 'Compact'}</button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 items-start">
        {state.teams.map((team) => {
          const load = teamLoad(state, team.id, quarter.id);
          const plans = teamPlans(state, team.id, quarter.id).filter((p) => passes(epicsById.get(p.epicId)) && (!filters.commitment || p.commitment === filters.commitment));
          const cutEpicId = teamCutEpicId(state, team.id, quarter.id);
          const incoming = incomingForTeam(state, team.id, quarter.id);
          const mayEdit = canWriteTeam(actor, team.id) && quarter.phase !== 'closed';
          return (
            <div key={team.id} className="w-[270px] shrink-0 bg-gray-50 rounded-lg border border-gray-200">
              <div className="p-3 border-b border-gray-200 bg-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{team.name}</h3>
                  <button className="text-xs text-indigo-700 hover:underline" onClick={() => setShowAssumptions(team)}>assumptions</button>
                </div>
                <div className="mt-2"><CapacityBar load={load} /></div>
                <div className="text-[11px] text-gray-500 mt-1">own {load.ownLow}–{load.ownHigh} pw · incoming {load.incLow}–{load.incHigh} pw{incoming.filter((d) => d.response === 'proposed').length > 0 && <span className="text-amber-700"> · {incoming.filter((d) => d.response === 'proposed').length} unanswered</span>}</div>
              </div>
              <div className="p-2 space-y-2">
                {plans.length === 0 && <Empty>No epics{Object.values(filters).some(Boolean) ? ' match' : ''}.</Empty>}
                {plans.map((p) => {
                  const e = epicsById.get(p.epicId);
                  const deps = epicDeps(state, e.id, quarter.id);
                  const worst = worstResponse(deps);
                  const askedOfUs = state.dependencies.filter((d) => d.providerTeamId === team.id && d.quarterId === quarter.id && d.epicId === e.id).length;
                  const theme = state.themes.find((t) => t.id === e.themeId);
                  const openDisc = state.discussions.some((d) => d.epicId === e.id && d.status === 'open' && d.quarterId === quarter.id);
                  const changed = quarter.baseline && changedSinceBaseline(state, e.id, quarter.id);
                  const ci = quarter.phase === 'active' ? latestCheckIn(state, e.id) : null;
                  return (
                    <React.Fragment key={p.id}>
                      {cutEpicId === e.id && (
                        <div className="flex items-center gap-2 text-[11px] text-red-700 font-semibold" role="separator" aria-label="Cut line: epics below exceed capacity">
                          <span className="flex-1 border-t-2 border-dashed border-red-500" /> cut line <span className="flex-1 border-t-2 border-dashed border-red-500" />
                        </div>
                      )}
                      <button onClick={() => setOpenEpic(e.id)} className={`w-full text-left bg-white rounded border ${p.commitment === 'not_committed' ? 'border-gray-200 opacity-60' : 'border-gray-200'} hover:border-indigo-400 shadow-sm ${dense ? 'p-1.5' : 'p-2'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 rounded text-white text-xs font-bold w-6 h-6 flex items-center justify-center ${p.rank == null ? 'bg-gray-300' : p.rank <= 10 ? 'bg-indigo-600' : 'bg-indigo-300'}`} title={p.rank == null ? 'Unranked' : `Strategic rank ${p.rank}`}>{p.rank ?? '–'}</span>
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium leading-tight ${dense ? 'text-xs' : 'text-sm'}`}>{e.title}</div>
                            <div className="text-[11px] text-gray-500 font-mono">{e.refCode}{e.externalSource && ' · ADO'} · {p.effortLow}–{p.effortHigh} pw</div>
                          </div>
                        </div>
                        {!dense && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <CommitmentPill value={p.commitment} size="xs" />
                            {theme ? <span className="text-[11px] px-1.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-100 truncate max-w-[120px]" title={theme.name}>{theme.name}</span>
                              : <span className="text-[11px] px-1.5 rounded bg-gray-100 text-gray-600 border border-gray-200">unaligned</span>}
                            {e.regulatory && <span className="text-[11px] px-1.5 rounded bg-purple-50 text-purple-800 border border-purple-200" title={`Regulatory deadline ${e.regulatoryDeadline}`}>§ {daysUntil(e.regulatoryDeadline)}d</span>}
                            {deps.length > 0 && <Pill meta={RESPONSE_META[worst]} size="xs" title={`Worst answer: ${RESPONSE_META[worst].label}`}>needs {deps.length}</Pill>}
                            {askedOfUs > 0 && <span className="text-[11px] px-1.5 rounded bg-gray-100 border border-gray-200">asked of us {askedOfUs}</span>}
                            {openDisc && <span className="text-[11px] px-1.5 rounded bg-amber-100 text-amber-800 border border-amber-300">? discuss</span>}
                            {changed && <span className="text-[11px] px-1.5 rounded bg-amber-50 text-amber-800 border border-amber-200">changed</span>}
                            {ci && <span className="text-[11px] text-gray-500">check-in: {ci.confidence}</span>}
                          </div>
                        )}
                      </button>
                    </React.Fragment>
                  );
                })}
                {mayEdit && <button className="w-full text-xs text-indigo-700 hover:underline py-1" onClick={() => setAddFor(team)}>+ Add epic</button>}
              </div>
            </div>
          );
        })}
      </div>

      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {addFor && <AddEpicModal team={addFor} onClose={() => setAddFor(null)} onCreated={(id) => { setAddFor(null); setOpenEpic(id); }} />}
      {showAssumptions && <AssumptionsModal team={showAssumptions} onClose={() => setShowAssumptions(null)} />}
    </div>
  );
}

function AddEpicModal({ team, onClose, onCreated }) {
  const { state, quarter, run, actor } = usePlan();
  const [title, setTitle] = useState('');
  const [themeId, setThemeId] = useState('');
  const [err, setErr] = useState(null);
  const submit = async () => {
    const r = await run('upsertEpic', { teamId: team.id, title, themeId: themeId || null, ownerName: actor.name });
    if (!r.ok) return setErr(r.error);
    const created = r.result.epics[r.result.epics.length - 1];
    const r2 = await run('upsertPlan', { epicId: created.id, quarterId: quarter.id, commitment: 'draft', effortLow: 0, effortHigh: 0 });
    if (!r2.ok) return setErr(r2.error);
    onCreated(created.id);
  };
  return (
    <Modal title={`New epic for ${team.name}`} onClose={onClose}>
      <Field l="Title"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
      <div className="mt-2"><Field l="Strategic theme"><select className={input} value={themeId} onChange={(e) => setThemeId(e.target.value)}><option value="">— unaligned —</option>{state.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field></div>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={onClose}>Cancel</button><button className={btn.primary} onClick={submit}>Create</button></div>
    </Modal>
  );
}

function AssumptionsModal({ team, onClose }) {
  const { state, quarter, run, actor } = usePlan();
  const load = teamLoad(state, team.id, quarter.id);
  const cap = load.cap || { teamId: team.id, quarterId: quarter.id, headcount: 0, weeks: 13, focusFactor: 0.65, absenceWeeks: 0, reservePct: 20 };
  const [form, setForm] = useState(cap);
  const [err, setErr] = useState(null);
  const mayEdit = canWriteTeam(actor, team.id);
  const set = (k) => (e) => setForm({ ...form, [k]: Number(e.target.value) });
  const plans = teamPlans(state, team.id, quarter.id).filter((p) => p.commitment !== 'not_committed');
  return (
    <Modal title={`${team.name} · capacity ${quarterLabel(quarter)}`} onClose={onClose}>
      <p className="text-xs text-gray-600 mb-3">available = (headcount × weeks × focus factor − absence weeks) × (1 − reserve%). Absences are team totals, never per person.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field l="Headcount"><input type="number" step="0.5" className={input} value={form.headcount} disabled={!mayEdit} onChange={set('headcount')} /></Field>
        <Field l="Weeks in quarter"><input type="number" className={input} value={form.weeks} disabled={!mayEdit} onChange={set('weeks')} /></Field>
        <Field l="Focus factor"><input type="number" step="0.05" min="0.1" max="1" className={input} value={form.focusFactor} disabled={!mayEdit} onChange={set('focusFactor')} /></Field>
        <Field l="Absence weeks (team total)"><input type="number" step="0.5" className={input} value={form.absenceWeeks} disabled={!mayEdit} onChange={set('absenceWeeks')} /></Field>
        <Field l="Reserve % (run / on-call / support)"><input type="number" className={input} value={form.reservePct} disabled={!mayEdit} onChange={set('reservePct')} /></Field>
      </div>
      <div className="mt-3 text-sm">Available: <b>{load.available} pw</b> · Load: <b>{load.totalLow}–{load.totalHigh} pw</b> ({load.pctLow}–{load.pct}%)</div>
      <h4 className="font-semibold text-sm mt-3 mb-1">Contributing epics</h4>
      <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
        {plans.map((p) => { const e = state.epics.find((x) => x.id === p.epicId); return <li key={p.id}>#{p.rank ?? '–'} {e.title} — {p.effortLow}–{p.effortHigh} pw</li>; })}
        {load.incHigh > 0 && <li className="text-gray-600">+ incoming accepted asks — {load.incLow}–{load.incHigh} pw</li>}
      </ul>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>Close</button>
        {mayEdit && <button className={btn.primary} onClick={async () => { const r = await run('upsertCapacity', { ...form, teamId: team.id, quarterId: quarter.id }); if (r.ok) onClose(); else setErr(r.error); }}>Save</button>}
      </div>
    </Modal>
  );
}
