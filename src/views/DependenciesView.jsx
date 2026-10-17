import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { teamLoad, rankedLoad, incomingEffort } from '../domain/capacity';
import { planFor, timingConflict, noResponseDays, daysSince, worstResponse, phaseAllows } from '../domain/plan';
import { RESPONSE_META, quarterLabel } from '../domain/model';
import { ResponsePill, Panel, btn, input, Modal, Empty, Pill, RankBadge, fmtDate } from '../components/plan/ui';
import { EpicPanel } from '../components/plan/EpicPanel';
import { AnswerModal } from '../components/plan/AnswerModal';

// Dependencies: provider intake queue + team x team matrix (AC C2-C8).
export function DependenciesView() {
  const { state, actor, quarter } = usePlan();
  const [teamId, setTeamId] = useState(actor.teamId || state.teams[0].id);
  const [sort, setSort] = useState('rank');
  const [cell, setCell] = useState(null);
  const [openEpic, setOpenEpic] = useState(null);
  const [answering, setAnswering] = useState(null);
  if (!quarter) return null;
  const team = state.teams.find((t) => t.id === teamId);
  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const queue = deps.filter((d) => d.providerTeamId === teamId).map((d) => ({ d, plan: planFor(state, d.epicId, quarter.id), epic: state.epics.find((e) => e.id === d.epicId) }))
    .sort((a, b) => sort === 'age' ? a.d.createdAt.localeCompare(b.d.createdAt) : (a.plan?.rank ?? 1e9) - (b.plan?.rank ?? 1e9));
  const load = teamLoad(state, teamId, quarter.id);
  const ranked = rankedLoad(state, teamId, quarter.id);
  const fitsById = new Map(ranked.items.map((i) => [i.id, i]));
  const mayAnswer = canWriteTeam(actor, teamId) && phaseAllows(quarter.phase, 'answer');
  const cellDeps = cell ? deps.filter((d) => d.requesterTeamId === cell.requester && d.providerTeamId === cell.provider) : [];
  const openCount = queue.filter((q) => q.d.response === 'proposed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Dependencies · {quarterLabel(quarter)}</h2>
        {!phaseAllows(quarter.phase, 'answer') && <span className="text-xs bg-gray-100 border rounded px-2 py-0.5">Answers open from the Negotiate phase (now: {quarter.phase})</span>}
      </div>

      <Panel title={<span className="flex items-center gap-2 flex-wrap">Asks of <select aria-label="Provider team" className={`${input} !w-auto`} value={teamId} onChange={(e) => setTeamId(e.target.value)}>{state.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <span className="text-gray-600 font-normal">{openCount} waiting for an answer</span></span>}
        right={<span className="text-xs text-gray-700 flex items-center gap-3">
          <span>Remaining after accepted asks: <b className={load.remaining < 0 ? 'text-red-700' : ''}>{load.remaining} pw</b> of {load.available} · load {load.pct}%{load.pendingCount > 0 && <> · {load.pctIfAllAccepted}% if all accepted</>}</span>
          <label className="flex items-center gap-1">Sort <select aria-label="Sort queue" className={`${input} !w-auto !py-0`} value={sort} onChange={(e) => setSort(e.target.value)}><option value="rank">by strategic rank</option><option value="age">by age</option></select></label>
        </span>}>
        {queue.length === 0 ? <Empty>No asks for {team?.name} in this quarter.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-600 text-left"><tr><th className="py-1">Rank</th><th>Ask</th><th>From</th><th>Effort</th><th>Fits?</th><th>Open for</th><th>Answer</th><th></th></tr></thead>
            <tbody>
              {queue.map(({ d, plan, epic }) => {
                const nr = noResponseDays(d);
                const fit = fitsById.get(d.id);
                const eff = incomingEffort(d);
                return (
                  <tr key={d.id} className="border-t align-top">
                    <td className="py-2 pr-2"><RankBadge rank={plan?.rank} size="sm" /></td>
                    <td className="py-2 pr-2">
                      <div>{d.ask}</div>
                      <div className="text-xs text-gray-600">{d.refCode} · for <button className="text-indigo-700 hover:underline" onClick={() => setOpenEpic(epic.id)}>{epic?.refCode} {epic?.title}</button>{d.neededBy && <> · needed by {fmtDate(d.neededBy)}</>}</div>
                      {d.ifDeclined && <div className="text-xs text-gray-600">If declined: {d.ifDeclined}</div>}
                      {timingConflict(state, d) && <div className="text-xs text-red-700">▲ Timing conflict: delivery after the epic's planned quarter</div>}
                    </td>
                    <td className="py-2 pr-2">{state.teams.find((t) => t.id === d.requesterTeamId)?.name}<div className="text-xs text-gray-600">{d.requesterName || epic?.ownerName}</div></td>
                    <td className="py-2 pr-2 whitespace-nowrap">{d.effortLow}–{d.effortHigh} pw{d.response === 'partial' && <div className="text-xs text-lime-800">granted {eff.low}–{eff.high}</div>}</td>
                    <td className="py-2 pr-2 text-xs whitespace-nowrap">{fit ? (fit.fits ? <span className="text-emerald-700">✓ fits (cum. {fit.cum})</span> : <span className="text-red-700">▲ below cut line (cum. {fit.cum})</span>) : d.response === 'proposed' ? <span className="text-gray-600">{load.remaining - d.effortHigh >= 0 ? `✓ would fit (${Math.round((load.remaining - d.effortHigh) * 10) / 10} left)` : `▲ would exceed by ${Math.round((d.effortHigh - load.remaining) * 10) / 10}`}</span> : '–'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">{daysSince(d.createdAt)} days{nr && <div className="text-red-700 font-semibold">No response – {nr} days</div>}</td>
                    <td className="py-2 pr-2"><ResponsePill value={d.response} />{d.responseReason && <div className="text-xs text-gray-700 mt-1 max-w-[220px]">{d.responseReason}</div>}</td>
                    <td className="py-2">{mayAnswer && <button className={d.response === 'proposed' ? btn.primary : btn.secondary} aria-label={`${d.response === 'proposed' ? 'Answer' : 'Change answer'} ${d.refCode}`} onClick={() => setAnswering(d)}>{d.response === 'proposed' ? 'Answer' : 'Change answer'}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Team × team matrix (rows ask, columns provide)" right={<span className="text-xs text-gray-600 flex gap-2 flex-wrap">{Object.entries(RESPONSE_META).map(([k, m]) => <span key={k}><span aria-hidden="true">{m.icon}</span> {m.label}</span>)}</span>}>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead><tr><th className="p-1 text-left text-gray-600">asks ↓ / provides →</th>{state.teams.map((t) => <th key={t.id} className="p-1 font-medium" scope="col">{t.name}</th>)}</tr></thead>
            <tbody>
              {state.teams.map((r) => (
                <tr key={r.id}>
                  <th className="p-1 text-left font-medium" scope="row">{r.name}</th>
                  {state.teams.map((c) => {
                    const ds = deps.filter((d) => d.requesterTeamId === r.id && d.providerTeamId === c.id);
                    if (r.id === c.id) return <td key={c.id} className="p-1 bg-gray-100" />;
                    if (!ds.length) return <td key={c.id} className="p-1 text-center text-gray-300" aria-label={`${r.name} asks nothing of ${c.name}`}>·</td>;
                    const w = worstResponse(ds);
                    return <td key={c.id} className="p-1 text-center"><button onClick={() => setCell({ requester: r.id, provider: c.id })} className="w-full" aria-label={`${r.name} asks ${c.name}: ${ds.length}, worst answer ${RESPONSE_META[w].label}`}><Pill meta={RESPONSE_META[w]} size="xs">{ds.length}</Pill></button></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-2">Cell shows the number of asks and the worst answer in that pair. Click a cell for the list.</p>
      </Panel>

      {cell && (
        <Modal title={`${state.teams.find((t) => t.id === cell.requester)?.name} asks ${state.teams.find((t) => t.id === cell.provider)?.name}`} onClose={() => setCell(null)} wide>
          <ul className="space-y-2 text-sm">
            {cellDeps.map((d) => { const e = state.epics.find((x) => x.id === d.epicId); return (
              <li key={d.id} className="border rounded p-2 flex justify-between gap-3">
                <div><div className="text-xs text-gray-600">{d.refCode} · <button className="text-indigo-700 hover:underline" onClick={() => { setCell(null); setOpenEpic(e.id); }}>{e?.title}</button></div>{d.ask}{d.responseReason && <div className="text-xs text-gray-700">{d.responseReason}</div>}</div>
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
