import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { isAdmin, canWriteTeam } from '../data/repository';
import { PHASES, PHASE_INDEX, quarterLabel, ROAM, COMMITMENT_META } from '../domain/model';
import { readiness, diffAgainstBaseline, planFor, phaseAllows, teamPlans } from '../domain/plan';
import { teamLoad } from '../domain/capacity';
import { Panel, btn, input, Field, ErrorNote, ReasonPrompt, Modal, Empty, ResponsePill, RankBadge } from '../components/plan/ui';
import { EpicPanel } from '../components/plan/EpicPanel';

// Facilitator screen: phases, readiness, discussion queue, confidence vote, lock + diff, plan of record (AC D1-D7).
export function SessionView() {
  const { state, actor, quarter, run } = usePlan();
  const [err, setErr] = useState(null);
  const [rewindTo, setRewindTo] = useState(null);
  const [raise, setRaise] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [openEpic, setOpenEpic] = useState(null);
  const [print, setPrint] = useState(false);
  const [lockOverride, setLockOverride] = useState(false);
  if (!quarter) return null;
  const admin = isAdmin(actor);
  const idx = PHASE_INDEX[quarter.phase];
  const ready = readiness(state, quarter.id);
  const epicsById = new Map(state.epics.map((e) => [e.id, e]));
  const queue = state.discussions.filter((d) => d.quarterId === quarter.id && d.status === 'open')
    .map((d) => ({ d, plan: d.epicId ? planFor(state, d.epicId, quarter.id) : null }))
    .sort((a, b) => (a.plan?.rank ?? 1e9) - (b.plan?.rank ?? 1e9) || (b.plan?.effortHigh ?? 0) - (a.plan?.effortHigh ?? 0));
  const votes = state.votes.filter((v) => v.quarterId === quarter.id);
  const dist = [1, 2, 3, 4, 5].map((n) => votes.filter((v) => v.vote === n).length);
  const diff = diffAgainstBaseline(state, quarter.id);

  const notReady = ready.filter((r) => !r.ready);
  const setPhase = async (phase, reason = '') => {
    if (PHASE_INDEX[phase] < idx && !reason) { setRewindTo(phase); return { ok: true }; }
    if (phase === 'locked' && PHASE_INDEX[phase] > idx && notReady.length && !reason) { setLockOverride(true); return { ok: true }; }
    const r = await run('setPhase', quarter.id, phase, reason);
    setErr(r.ok ? null : r.error);
    return r;
  };
  const revealed = quarter.votesRevealed || PHASE_INDEX[quarter.phase] >= PHASE_INDEX.locked;
  const myTeams = new Set(state.teams.filter((t) => canWriteTeam(actor, t.id)).map((t) => t.id));
  const totalTimebox = queue.reduce((s, { d }) => s + (d.timeboxMin || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Session · {quarterLabel(quarter)}</h2>
        <button className={btn.secondary} onClick={() => setPrint(true)}>Plan of record</button>
      </div>
      <ErrorNote error={err} />

      {/* Phase stepper */}
      <Panel title="Phase" right={admin && <span className="text-xs text-gray-500">You are the facilitator</span>}>
        <ol className="flex flex-wrap gap-1">
          {PHASES.map((p, i) => (
            <li key={p.id} className="flex items-center">
              <button disabled={!admin || i === idx} title={p.hint} onClick={() => setPhase(p.id)}
                aria-current={i === idx ? 'step' : undefined}
                className={`px-3 py-1.5 rounded text-sm border ${i === idx ? 'bg-indigo-600 text-white border-indigo-600' : i < idx ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-white text-gray-600 border-gray-300'} ${admin && i !== idx ? 'hover:border-indigo-500' : ''} disabled:cursor-default`}>
                {i < idx ? '✓ ' : i === idx ? '▶ ' : ''}{i + 1}. {p.label}
              </button>
              {i < PHASES.length - 1 && <span className="text-gray-300 mx-1">›</span>}
            </li>
          ))}
        </ol>
        <p className="text-sm text-gray-700 mt-2">{PHASES[idx].hint}.{!admin && ' Only an admin (facilitator) can change the phase.'}{quarter.lockedAt && ` Baseline taken ${new Date(quarter.lockedAt).toLocaleString('nl-NL')}.`}</p>
        {admin && idx < PHASE_INDEX.locked && notReady.length > 0 && <p className="text-xs text-amber-900 mt-1">Locking now needs an override reason: {notReady.length} team(s) not ready.</p>}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Readiness */}
        <Panel title="Team readiness">
          <ul className="space-y-1 text-sm">
            {ready.map(({ team, ready: ok, reasons }) => (
              <li key={team.id} className={`flex justify-between gap-2 rounded px-2 py-1 ${ok ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <span className="font-medium"><span aria-hidden="true" className={ok ? 'text-emerald-700' : 'text-amber-800'}>{ok ? '✓' : '▲'}</span> {team.name}</span>
                <span className={`text-xs text-right ${ok ? 'text-emerald-800' : 'text-amber-900'}`}>{ok ? 'ready' : reasons.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Confidence vote */}
        <Panel title="Confidence vote (fist of five, 1 = no confidence, 5 = full confidence)" right={<span className="text-xs text-gray-600 flex items-center gap-2">{votes.length}/{state.teams.length} teams voted{admin && !revealed && votes.length > 0 && <button className={btn.secondary} onClick={() => run('revealVotes', quarter.id)}>Reveal votes</button>}</span>}>
          {!revealed && <p className="text-xs text-gray-700 mb-2">Votes stay hidden until the facilitator reveals them, so nobody anchors on earlier voters. You can see your own team's vote.</p>}
          <div className="flex items-end gap-2 h-20 mb-2" role="img" aria-label={revealed ? `Vote distribution: ${dist.map((n, i) => `${n} × ${i + 1}`).join(', ')}` : 'Votes hidden until revealed'}>
            {revealed && dist.map((n, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className={`w-full rounded-t ${i < 2 ? 'bg-red-400' : i === 2 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ height: `${votes.length ? (n / votes.length) * 100 : 0}%`, minHeight: n ? 6 : 0 }} />
                <div className="text-xs mt-1">{i + 1} <span className="text-gray-500">({n})</span></div>
              </div>
            ))}
          </div>
          <ul className="text-xs space-y-0.5 mb-3">
            {votes.filter((v) => revealed || myTeams.has(v.teamId)).map((v) => { const tn = state.teams.find((t) => t.id === v.teamId)?.name; const stale = ready.find((r) => r.team.id === v.teamId)?.reasons.includes('Plan changed after the vote'); return (
              <li key={v.id}><b>{tn}</b>: {v.vote}/5{v.reason && <span className="text-gray-700"> — {v.reason}</span>}{stale && <span className="text-amber-900"> · plan changed since, re-vote advised</span>}
                {revealed && v.vote <= 2 && (admin || actor.role === 'planner') && !state.discussions.some((x) => x.status === 'open' && x.quarterId === quarter.id && x.reason.startsWith(`Low confidence ${tn}`)) && (
                  <button className={`${btn.ghost} ml-2`} onClick={() => run('raiseDiscussion', { quarterId: quarter.id, epicId: null, reason: `Low confidence ${tn} (vote ${v.vote}): ${v.reason}`, ownerName: actor.name, timeboxMin: 10 })}>Add to discussion queue</button>
                )}
              </li>); })}
            {!revealed && votes.length > 0 && <li className="text-gray-600">{votes.length} vote(s) cast, hidden.</li>}
          </ul>
          {phaseAllows(quarter.phase, 'vote') ? <VoteForm /> : <Empty>Voting opens in the Vote phase; a re-vote is possible while locked.</Empty>}
          {admin && <label className="flex items-center gap-2 text-xs mt-3 text-gray-600"><input type="checkbox" checked={state.settings.voteBlocksLock} onChange={(e) => run('updateSettings', { voteBlocksLock: e.target.checked })} /> A vote of 2 or lower blocks locking (default: discussion trigger only)</label>}
        </Panel>
      </div>

      {/* Discussion queue */}
      <Panel title={`Discussion queue (${queue.length} open, ${totalTimebox} min) — the live agenda, by strategic rank`} right={canWriteTeam(actor, actor.teamId) || admin ? <button className={btn.secondary} onClick={() => setRaise(true)}>+ Raise item</button> : null}>
        {queue.length === 0 ? <Empty>Nothing needs discussion.</Empty> : (
          <ul className="space-y-2 text-sm">
            {queue.map(({ d, plan }) => { const e = epicsById.get(d.epicId); const dep = state.dependencies.find((x) => x.id === d.depId); return (
              <li key={d.id} className="border rounded p-2 flex justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-600 flex items-center gap-2"><RankBadge rank={plan?.rank} size="sm" />{e ? <button className="text-indigo-700 hover:underline" onClick={() => setOpenEpic(e.id)}>{e.refCode} {e.title}</button> : <span>cross-cutting</span>}{dep && <span>· {dep.refCode} <ResponsePill value={dep.response} size="xs" /></span>}</div>
                  <div>{d.reason}</div>
                  <div className="text-xs text-gray-500">owner {d.ownerName} · timebox {d.timeboxMin ?? '–'} min</div>
                </div>
                {(admin || actor.role === 'planner') && <button className={btn.secondary} onClick={() => setResolving(d)}>Resolve</button>}
              </li>); })}
          </ul>
        )}
      </Panel>

      {/* Diff since baseline */}
      <Panel title={`Changed since baseline (${diff.length})`}>
        {!quarter.baseline ? <Empty>No baseline yet — one is stored when the quarter is locked.</Empty> : diff.length === 0 ? <Empty>No changes since lock.</Empty> : (
          <ul className="text-sm space-y-1">{diff.map((d, i) => <li key={i}><span className="text-xs uppercase text-gray-600 mr-2">{d.kind}</span>{d.text}{d.reason ? <span className="italic text-gray-700"> — "{d.reason}"</span> : <span className="text-xs text-amber-900"> — no reason recorded</span>}</li>)}</ul>
        )}
      </Panel>

      {rewindTo && <ReasonPrompt title={`Rewind to ${rewindTo}`} hint="Rewinding a phase needs a reason; it is recorded in the history." onClose={() => setRewindTo(null)} onSubmit={(reason) => setPhase(rewindTo, reason)} />}
      {raise && <RaiseModal onClose={() => setRaise(false)} />}
      {lockOverride && <ReasonPrompt title="Lock with open items" hint={`Not ready: ${notReady.map((r) => `${r.team.name} (${r.reasons.join(', ')})`).join('; ')}. Give the override reason; it is recorded.`} submitLabel="Lock anyway" onClose={() => setLockOverride(false)} onSubmit={(reason) => setPhase('locked', reason)} />}
      {resolving && <ReasonPrompt title="Outcome" hint={resolving.reason} submitLabel="Resolve" onClose={() => setResolving(null)} onSubmit={(outcome) => run('resolveDiscussion', resolving.id, outcome)} />}
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {print && <PlanOfRecord onClose={() => setPrint(false)} />}
    </div>
  );
}

function VoteForm() {
  const { state, actor, quarter, run } = usePlan();
  const teams = state.teams.filter((t) => canWriteTeam(actor, t.id));
  const [teamId, setTeamId] = useState(teams[0]?.id);
  const [vote, setVote] = useState(4);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  if (!teams.length) return <Empty>Only team planners and admins can vote.</Empty>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field l="Team"><select className={input} value={teamId} onChange={(e) => setTeamId(e.target.value)}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      <Field l="Vote"><div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`${btn.secondary} !px-2 ${vote === n ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setVote(n)}>{n}</button>)}</div></Field>
      <div className="flex-1 min-w-[180px]"><Field l={vote <= 3 ? 'Reason (required at 3 or lower)' : 'Reason (optional)'}><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
      <button className={btn.primary} onClick={async () => { const r = await run('castVote', teamId, quarter.id, vote, reason); setErr(r.ok ? null : r.error); if (r.ok) setReason(''); }}>Vote</button>
      <div className="w-full"><ErrorNote error={err} /></div>
    </div>
  );
}

function RaiseModal({ onClose }) {
  const { state, quarter, run, actor } = usePlan();
  const plans = state.plans.filter((p) => p.quarterId === quarter.id);
  const [epicId, setEpicId] = useState('');
  const [reason, setReason] = useState('');
  const [timeboxMin, setTimebox] = useState(10);
  const [ownerName, setOwner] = useState(actor.name);
  const [err, setErr] = useState(null);
  return (
    <Modal title="Raise a discussion item" onClose={onClose}>
      <Field l="Epic (or cross-cutting)"><select className={input} value={epicId} onChange={(e) => setEpicId(e.target.value)}><option value="">— cross-cutting, no epic —</option>{plans.map((p) => { const e = state.epics.find((x) => x.id === p.epicId); return <option key={p.id} value={e.id}>#{p.rank ?? '–'} {e.refCode} {e.title}</option>; })}</select></Field>
      <div className="mt-2"><Field l="Why does this need discussion?"><textarea className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field></div>
      <div className="grid grid-cols-2 gap-3 mt-2">
        <Field l="Owner"><input className={input} value={ownerName} onChange={(e) => setOwner(e.target.value)} /></Field>
        <Field l="Timebox (min)"><input type="number" className={input} value={timeboxMin} onChange={(e) => setTimebox(Number(e.target.value))} /></Field>
      </div>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={onClose}>Cancel</button><button className={btn.primary} onClick={async () => { const r = await run('raiseDiscussion', { quarterId: quarter.id, epicId: epicId || null, reason, ownerName, timeboxMin }); if (r.ok) onClose(); else setErr(r.error); }}>Raise</button></div>
    </Modal>
  );
}

// One-page plan of record (AC D7). Uses the browser's print.
function PlanOfRecord({ onClose }) {
  const { state, quarter } = usePlan();
  const votes = state.votes.filter((v) => v.quarterId === quarter.id);
  const diff = diffAgainstBaseline(state, quarter.id);
  const risks = state.impediments.filter((i) => i.kind === 'risk' && i.status === 'open');
  return (
    <Modal title={`Plan of record · ${quarterLabel(quarter)}`} onClose={onClose} wide>
      <div className="text-sm space-y-4 print:text-xs" id="plan-of-record">
        <p className="text-xs text-gray-500">Phase: {quarter.phase}{quarter.lockedAt && ` · locked ${new Date(quarter.lockedAt).toLocaleDateString()}`} · printed {new Date().toLocaleString()}</p>
        {state.teams.map((t) => {
          const plans = teamPlans(state, t.id, quarter.id);
          const load = teamLoad(state, t.id, quarter.id);
          const v = votes.find((x) => x.teamId === t.id);
          return (
            <section key={t.id}>
              <h4 className="font-semibold">{t.name} <span className="font-normal text-gray-500">— load {load.totalLow}–{load.totalHigh} of {load.available} pw ({load.pct}%) · confidence {v ? v.vote : '–'}</span></h4>
              <ul className="ml-4 list-disc">
                {plans.map((p) => { const e = state.epics.find((x) => x.id === p.epicId); const deps = state.dependencies.filter((d) => d.epicId === e.id && d.quarterId === quarter.id); return (
                  <li key={p.id}>#{p.rank ?? '–'} {e.refCode} {e.title} — {COMMITMENT_META[p.commitment].label}, {p.effortLow}–{p.effortHigh} pw
                    {deps.length > 0 && <ul className="ml-4 list-[circle]">{deps.map((d) => <li key={d.id}>{d.refCode} → {state.teams.find((x) => x.id === d.providerTeamId)?.name}: {d.ask} — <ResponsePill value={d.response} size="xs" /></li>)}</ul>}
                  </li>); })}
              </ul>
            </section>
          );
        })}
        <section><h4 className="font-semibold">Risks (ROAM)</h4>{risks.length === 0 ? <Empty>None open.</Empty> : <ul className="ml-4 list-disc">{risks.map((r) => <li key={r.id}>{r.refCode} {r.title} — {r.roam ?? 'unassigned'} · owner {r.ownerName}</li>)}</ul>}</section>
        <section><h4 className="font-semibold">Changes since baseline</h4>{diff.length === 0 ? <Empty>None.</Empty> : <ul className="ml-4 list-disc">{diff.map((d, i) => <li key={i}>{d.text}{d.reason && ` — "${d.reason}"`}</li>)}</ul>}</section>
      </div>
      <div className="flex justify-end gap-2 mt-3 print:hidden"><button className={btn.secondary} onClick={onClose}>Close</button><button className={btn.primary} onClick={() => window.print()}>Print</button></div>
    </Modal>
  );
}
