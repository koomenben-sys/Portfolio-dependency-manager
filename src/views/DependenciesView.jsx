import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { teamLoad } from '../domain/capacity';
import { planFor, timingConflict, noResponseDays, daysSince, worstResponse, phaseAllows } from '../domain/plan';
import { RESPONSE_META, quarterLabel } from '../domain/model';
import { ResponsePill, Panel, btn, input, Modal, Field, ErrorNote, Empty, Pill } from '../components/plan/ui';
import { EpicPanel } from '../components/plan/EpicPanel';

// Dependencies: provider intake queue + team x team matrix (AC C2-C8).
export function DependenciesView() {
  const { state, actor, quarter } = usePlan();
  const [teamId, setTeamId] = useState(actor.teamId || state.teams[0].id);
  const [cell, setCell] = useState(null); // { requester, provider }
  const [openEpic, setOpenEpic] = useState(null);
  const [answering, setAnswering] = useState(null);
  if (!quarter) return null;
  const team = state.teams.find((t) => t.id === teamId);
  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const queue = deps.filter((d) => d.providerTeamId === teamId).map((d) => ({ d, plan: planFor(state, d.epicId, quarter.id), epic: state.epics.find((e) => e.id === d.epicId) }))
    .sort((a, b) => (a.d.response === 'proposed' ? 0 : 1) - (b.d.response === 'proposed' ? 0 : 1) || (a.plan?.rank ?? 1e9) - (b.plan?.rank ?? 1e9));
  const load = teamLoad(state, teamId, quarter.id);
  const mayAnswer = canWriteTeam(actor, teamId) && phaseAllows(quarter.phase, 'answer');
  const cellDeps = cell ? deps.filter((d) => d.requesterTeamId === cell.requester && d.providerTeamId === cell.provider) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">Dependencies · {quarterLabel(quarter)}</h2>
        {!phaseAllows(quarter.phase, 'answer') && <span className="text-xs bg-gray-100 border rounded px-2 py-0.5">Answers open from the negotiate phase (now: {quarter.phase})</span>}
      </div>

      <Panel title={<span>Intake queue — asks of <select className={`${input} !w-auto inline ml-1`} value={teamId} onChange={(e) => setTeamId(e.target.value)}>{state.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></span>}
        right={<span className="text-xs text-gray-600">remaining: <b>{Math.max(0, Math.round((load.available - load.totalHigh) * 10) / 10)} pw</b> of {load.available} · load {load.pct}%</span>}>
        {queue.length === 0 ? <Empty>No asks for {team?.name} in this quarter.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 text-left"><tr><th className="py-1">Rank</th><th>Ask</th><th>From</th><th>Effort</th><th>Age</th><th>Answer</th><th></th></tr></thead>
            <tbody>
              {queue.map(({ d, plan, epic }) => {
                const nr = noResponseDays(d);
                return (
                  <tr key={d.id} className="border-t align-top">
                    <td className="py-2 pr-2"><span className={`rounded text-white text-xs font-bold px-1.5 py-0.5 ${plan?.rank == null ? 'bg-gray-300' : plan.rank <= 10 ? 'bg-indigo-600' : 'bg-indigo-300'}`}>{plan?.rank ?? '–'}</span></td>
                    <td className="py-2 pr-2">
                      <div className="font-mono text-xs text-gray-500">{d.refCode} · for <button className="text-indigo-700 hover:underline" onClick={() => setOpenEpic(epic.id)}>{epic?.refCode} {epic?.title}</button></div>
                      <div>{d.ask}</div>
                      {d.ifDeclined && <div className="text-xs text-gray-500">If declined: {d.ifDeclined}</div>}
                      {timingConflict(state, d) && <div className="text-xs text-red-700">▲ Timing conflict</div>}
                    </td>
                    <td className="py-2 pr-2">{state.teams.find((t) => t.id === d.requesterTeamId)?.name}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{d.effortLow}–{d.effortHigh} pw</td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">{daysSince(d.createdAt)}d{nr && <div className="text-red-700 font-semibold">No response – {nr} days</div>}</td>
                    <td className="py-2 pr-2"><ResponsePill value={d.response} />{d.responseReason && <div className="text-xs text-gray-600 mt-1 max-w-[220px]">{d.responseReason}</div>}</td>
                    <td className="py-2">{mayAnswer && <button className={btn.secondary} onClick={() => setAnswering(d)}>Answer</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Team × team matrix (rows ask, columns provide)">
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead><tr><th className="p-1 text-left text-gray-500">asks ↓ / provides →</th>{state.teams.map((t) => <th key={t.id} className="p-1 font-medium">{t.name}</th>)}</tr></thead>
            <tbody>
              {state.teams.map((r) => (
                <tr key={r.id}>
                  <th className="p-1 text-left font-medium">{r.name}</th>
                  {state.teams.map((c) => {
                    const ds = deps.filter((d) => d.requesterTeamId === r.id && d.providerTeamId === c.id);
                    if (r.id === c.id) return <td key={c.id} className="p-1 bg-gray-100" />;
                    if (!ds.length) return <td key={c.id} className="p-1 text-center text-gray-300">·</td>;
                    const w = worstResponse(ds);
                    return <td key={c.id} className="p-1 text-center"><button onClick={() => setCell({ requester: r.id, provider: c.id })} className="w-full"><Pill meta={RESPONSE_META[w]} size="xs" title={`${ds.length} ask(s), worst: ${RESPONSE_META[w].label}`}>{ds.length}</Pill></button></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">Cell colour and icon show the worst answer in that pair. Click a cell for the list.</p>
      </Panel>

      {cell && (
        <Modal title={`${state.teams.find((t) => t.id === cell.requester)?.name} asks ${state.teams.find((t) => t.id === cell.provider)?.name}`} onClose={() => setCell(null)} wide>
          <ul className="space-y-2 text-sm">
            {cellDeps.map((d) => { const e = state.epics.find((x) => x.id === d.epicId); return (
              <li key={d.id} className="border rounded p-2 flex justify-between gap-3">
                <div><div className="font-mono text-xs text-gray-500">{d.refCode} · <button className="text-indigo-700 hover:underline" onClick={() => { setCell(null); setOpenEpic(e.id); }}>{e?.title}</button></div>{d.ask}{d.responseReason && <div className="text-xs text-gray-600">{d.responseReason}</div>}</div>
                <ResponsePill value={d.response} />
              </li>); })}
          </ul>
        </Modal>
      )}
      {answering && <AnswerModal dep={answering} onClose={() => setAnswering(null)} />}
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}

function AnswerModal({ dep, onClose }) {
  const { state, run } = usePlan();
  const [response, setResponse] = useState(dep.response === 'proposed' ? 'accepted' : dep.response);
  const [reason, setReason] = useState(dep.responseReason || '');
  const [to, setTo] = useState(dep.deferredToQuarterId || '');
  const [err, setErr] = useState(null);
  const later = state.quarters.filter((q) => q.id !== dep.quarterId && q.phase !== 'closed');
  return (
    <Modal title={`Answer ${dep.refCode}`} onClose={onClose}>
      <p className="text-sm mb-3">{dep.ask} <span className="text-gray-500">({dep.effortLow}–{dep.effortHigh} pw)</span></p>
      <div className="flex flex-wrap gap-2 mb-3">
        {['accepted', 'partial', 'deferred', 'declined', 'needs_priority_call'].map((r) => (
          <button key={r} className={`${btn.secondary} ${response === r ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setResponse(r)}>{RESPONSE_META[r].icon} {RESPONSE_META[r].label}</button>
        ))}
      </div>
      {response === 'deferred' && <Field l="Defer to quarter"><select className={input} value={to} onChange={(e) => setTo(e.target.value)}><option value="">— choose —</option>{later.map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}</option>)}</select></Field>}
      <div className="mt-2"><Field l={response === 'accepted' ? 'Note (optional)' : 'Reason (required)'}><textarea className={input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>Cancel</button>
        <button className={btn.primary} onClick={async () => { const r = await run('answerDependency', dep.id, { response, reason, deferredToQuarterId: to || null }); if (r.ok) onClose(); else setErr(r.error); }}>Send answer</button>
      </div>
    </Modal>
  );
}
