import React, { useEffect, useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { isAdmin, canWriteTeam } from '../data/repository';
import { PHASES, PHASE_INDEX, quarterLabel, ROAM, COMMITMENT_META } from '../domain/model';
import { readiness, diffAgainstBaseline, planFor, phaseAllows, teamPlans } from '../domain/plan';
import { teamLoad } from '../domain/capacity';
import { useT } from '../i18n';
import { Panel, btn, input, Field, ErrorNote, ReasonPrompt, Modal, Empty, ResponsePill, RankBadge } from '../components/plan/ui';
import { NoQuarter } from '../components/plan/NoQuarter';
import { EpicPanel } from '../components/plan/EpicPanel';

// Facilitator screen: phases, readiness, discussion queue, confidence vote, lock + diff, plan of record (AC D1-D7).
export function SessionView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [err, setErr] = useState(null);
  const [rewindTo, setRewindTo] = useState(null);
  const [raise, setRaise] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [openEpic, setOpenEpic] = useState(null);
  const [print, setPrint] = useState(false);
  const [lockOverride, setLockOverride] = useState(false);
  if (!quarter) return <NoQuarter />;
  const admin = isAdmin(actor);
  const idx = PHASE_INDEX[quarter.phase];
  const ready = readiness(state, quarter.id, t);
  const epicsById = new Map(state.epics.map((e) => [e.id, e]));
  const queue = state.discussions.filter((d) => d.quarterId === quarter.id && d.status === 'open')
    .map((d) => ({ d, plan: d.epicId ? planFor(state, d.epicId, quarter.id) : null }))
    .sort((a, b) => (a.plan?.rank ?? 1e9) - (b.plan?.rank ?? 1e9) || (b.plan?.effortHigh ?? 0) - (a.plan?.effortHigh ?? 0));
  const votes = state.votes.filter((v) => v.quarterId === quarter.id);
  const dist = [1, 2, 3, 4, 5].map((n) => votes.filter((v) => v.vote === n).length);
  const diff = diffAgainstBaseline(state, quarter.id, t);

  const notReady = ready.filter((r) => !r.ready);
  const setPhase = async (phase, reason = '') => {
    if (PHASE_INDEX[phase] < idx && !reason) { setRewindTo(phase); return { ok: true }; }
    if (phase === 'locked' && PHASE_INDEX[phase] > idx && notReady.length && !reason) { setLockOverride(true); return { ok: true }; }
    const r = await run('setPhase', quarter.id, phase, reason);
    setErr(r.ok ? null : r.error);
    return r;
  };
  const revealed = quarter.votesRevealed || PHASE_INDEX[quarter.phase] >= PHASE_INDEX.locked;
  const myTeams = new Set(state.teams.filter((x) => canWriteTeam(actor, x.id)).map((x) => x.id));
  const totalTimebox = queue.reduce((s, { d }) => s + (d.timeboxMin || 0), 0);
  const phaseName = (id) => t(PHASES.find((p) => p.id === id)?.label || id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('Session')} · {quarterLabel(quarter)}</h2>
        <button className={btn.secondary} onClick={() => setPrint(true)}>{t('Plan of record')}</button>
      </div>
      <ErrorNote error={err} />

      {/* Phase stepper */}
      <Panel title={t('Phase')} right={admin && <span className="text-xs text-muted">{t('You are the facilitator')}</span>}>
        <ol className="flex flex-wrap gap-1">
          {PHASES.map((p, i) => (
            <li key={p.id} className="flex items-center">
              <button disabled={!admin || i === idx || i > idx + 1} title={i > idx + 1 ? t('Phases advance one step at a time') : t(p.hint)} onClick={() => setPhase(p.id)}
                aria-current={i === idx ? 'step' : undefined}
                className={`px-3 py-1.5 rounded text-sm border ${i === idx ? 'bg-accent text-white border-accent' : i < idx ? 'bg-accent-50 text-accent-700 border-accent-200' : 'bg-surface text-muted border-border-strong'} ${admin && i !== idx ? 'hover:border-accent' : ''} disabled:cursor-default`}>
                {i < idx ? '✓ ' : i === idx ? '▶ ' : ''}{i + 1}. {t(p.label)}
              </button>
              {i < PHASES.length - 1 && <span className="text-faint mx-1">›</span>}
            </li>
          ))}
        </ol>
        <p className="text-sm text-ink-2 mt-2">{t(PHASES[idx].hint)}.{!admin && ` ${t('Only an admin (facilitator) can change the phase.')}`}{quarter.lockedAt && ` ${t('Baseline taken {time}.', { time: new Date(quarter.lockedAt).toLocaleString('nl-NL') })}`}</p>
        {admin && idx < PHASE_INDEX.locked && notReady.length > 0 && <p className="text-xs text-amber-900 mt-1">{t('Locking now needs an override reason: {n} team(s) not ready.', { n: notReady.length })}</p>}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Readiness */}
        <Panel title={t('Team readiness')}>
          <ul className="space-y-1 text-sm">
            {ready.map(({ team, ready: ok, reasons }) => (
              <li key={team.id} className={`flex justify-between gap-2 rounded px-2 py-1 ${ok ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <span className="font-medium"><span aria-hidden="true" className={ok ? 'text-emerald-700' : 'text-amber-800'}>{ok ? '✓' : '▲'}</span> {team.name}</span>
                <span className={`text-xs text-right ${ok ? 'text-emerald-800' : 'text-amber-900'}`}>{ok ? t('ready') : reasons.map((r) => t(r)).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Confidence vote */}
        <Panel title={t('Confidence vote (fist of five, 1 = no confidence, 5 = full confidence)')} right={<span className="text-xs text-muted flex items-center gap-2">{t('{voted}/{total} teams voted', { voted: votes.length, total: state.teams.length })}{admin && !revealed && votes.length > 0 && <button className={btn.secondary} onClick={() => run('revealVotes', quarter.id)}>{t('Reveal votes')}</button>}</span>}>
          {!revealed && <p className="text-xs text-ink-2 mb-2">{t("Votes stay hidden until the facilitator reveals them, so nobody anchors on earlier voters. You can see your own team's vote.")}</p>}
          <div className="flex items-end gap-2 h-20 mb-2" role="img" aria-label={revealed ? t('Vote distribution: {dist}', { dist: dist.map((n, i) => `${n} × ${i + 1}`).join(', ') }) : t('Votes hidden until revealed')}>
            {revealed && dist.map((n, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className={`w-full rounded-t ${i < 2 ? 'bg-red-400' : i === 2 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ height: `${votes.length ? (n / votes.length) * 100 : 0}%`, minHeight: n ? 6 : 0 }} />
                <div className="text-xs mt-1">{i + 1} <span className="text-muted">({n})</span></div>
              </div>
            ))}
          </div>
          <ul className="text-xs space-y-0.5 mb-3">
            {votes.filter((v) => revealed || myTeams.has(v.teamId)).map((v) => { const tn = state.teams.find((x) => x.id === v.teamId)?.name; const stale = ready.find((r) => r.team.id === v.teamId)?.reasons.includes('Plan changed after the vote'); return (
              <li key={v.id}><b>{tn}</b>: {v.vote}/5{v.reason && <span className="text-ink-2"> — {v.reason}</span>}{stale && <span className="text-amber-900"> · {t('plan changed since, re-vote advised')}</span>}
                {revealed && v.vote <= 2 && (admin || actor.role === 'planner') && !state.discussions.some((x) => x.status === 'open' && x.quarterId === quarter.id && x.reason.startsWith(`Low confidence ${tn}`)) && (
                  <button className={`${btn.ghost} ml-2`} onClick={() => run('raiseDiscussion', { quarterId: quarter.id, epicId: null, teamId: v.teamId, reason: `Low confidence ${tn} (vote ${v.vote}): ${v.reason}`, ownerName: actor.name, timeboxMin: 10 })}>{t('Add to discussion queue')}</button>
                )}
              </li>); })}
            {!revealed && votes.length > 0 && <li className="text-muted">{t('{n} vote(s) cast, hidden.', { n: votes.length })}</li>}
          </ul>
          {phaseAllows(quarter.phase, 'vote') ? <VoteForm /> : <Empty>{t('Voting opens in the Vote phase; a re-vote is possible while locked.')}</Empty>}
          {admin && <label className="flex items-center gap-2 text-xs mt-3 text-muted"><input type="checkbox" checked={state.settings.voteBlocksLock} onChange={(e) => run('updateSettings', { voteBlocksLock: e.target.checked })} /> {t('A vote of 2 or lower blocks locking (default: discussion trigger only)')}</label>}
        </Panel>
      </div>

      {/* Discussion queue */}
      <Panel title={t('Discussion queue ({n} open, {min} min) — the live agenda, by strategic rank', { n: queue.length, min: totalTimebox })} right={canWriteTeam(actor, actor.teamId) || admin ? <button className={btn.secondary} onClick={() => setRaise(true)}>{t('+ Raise item')}</button> : null}>
        {queue.length === 0 ? <Empty>{t('Nothing needs discussion.')}</Empty> : (
          <ul className="space-y-2 text-sm">
            {queue.map(({ d, plan }) => { const e = epicsById.get(d.epicId); const dep = state.dependencies.find((x) => x.id === d.depId); return (
              <li key={d.id} className="border rounded p-2 flex justify-between gap-3">
                <div>
                  <div className="text-xs text-muted flex items-center gap-2"><RankBadge rank={plan?.rank} size="sm" />{e ? <button className="text-accent-700 hover:underline" onClick={() => setOpenEpic(e.id)}>{e.refCode} {e.title}</button> : <span>{t('cross-cutting')}</span>}{dep && <span>· {dep.refCode} <ResponsePill value={dep.response} size="xs" /></span>}</div>
                  <div>{d.reason}</div>
                  <div className="text-xs text-muted">{t('owner {name} · timebox {min} min', { name: d.ownerName, min: d.timeboxMin ?? '–' })}</div>
                </div>
                {(admin || actor.role === 'planner') && <button className={btn.secondary} onClick={() => setResolving(d)}>{t('Resolve')}</button>}
              </li>); })}
          </ul>
        )}
      </Panel>

      {/* Diff since baseline */}
      <Panel title={t('Changed since baseline ({n})', { n: diff.length })}>
        {!quarter.baseline ? <Empty>{t('No baseline yet — one is stored when the quarter is locked.')}</Empty> : diff.length === 0 ? <Empty>{t('No changes since lock.')}</Empty> : (
          <ul className="text-sm space-y-1">{diff.map((d, i) => <li key={i}><span className="text-xs uppercase text-muted mr-2">{t(d.kind)}</span>{d.text}{d.reason ? <span className="italic text-ink-2"> — "{d.reason}"</span> : <span className="text-xs text-amber-900"> — {t('no reason recorded')}</span>}</li>)}</ul>
        )}
      </Panel>

      {rewindTo && <ReasonPrompt title={t('Rewind to {phase}', { phase: phaseName(rewindTo) })} hint={t('Rewinding a phase needs a reason; it is recorded in the history.')} onClose={() => setRewindTo(null)} onSubmit={(reason) => setPhase(rewindTo, reason)} />}
      {raise && <RaiseModal onClose={() => setRaise(false)} />}
      {lockOverride && <ReasonPrompt title={t('Lock with open items')} hint={t('Not ready: {teams}. Give the override reason; it is recorded.', { teams: notReady.map((r) => `${r.team.name} (${r.reasons.map((x) => t(x)).join(', ')})`).join('; ') })} submitLabel={t('Lock anyway')} onClose={() => setLockOverride(false)} onSubmit={(reason) => setPhase('locked', reason)} />}
      {resolving && <ReasonPrompt title={t('Outcome')} hint={resolving.reason} submitLabel={t('Resolve')} onClose={() => setResolving(null)} onSubmit={(outcome) => run('resolveDiscussion', resolving.id, outcome)} />}
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {print && <PlanOfRecord onClose={() => setPrint(false)} />}
    </div>
  );
}

function VoteForm() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const teams = state.teams.filter((x) => canWriteTeam(actor, x.id));
  const [teamId, setTeamId] = useState(teams[0]?.id);
  useEffect(() => { setTeamId(teams[0]?.id); }, [actor.id]);
  const [vote, setVote] = useState(4);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  if (!teams.length) return <Empty>{t('Only team planners and admins can vote.')}</Empty>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field l={t('Team')}><select className={input} value={teamId} onChange={(e) => setTeamId(e.target.value)}>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <Field l={t('Vote')}><div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`${btn.secondary} !px-2 ${vote === n ? 'ring-2 ring-accent' : ''}`} onClick={() => setVote(n)}>{n}</button>)}</div></Field>
      <div className="flex-1 min-w-[180px]"><Field l={vote <= 3 ? t('Reason (required at 3 or lower)') : t('Reason (optional)')}><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
      <button className={btn.primary} onClick={async () => { const r = await run('castVote', teamId, quarter.id, vote, reason); setErr(r.ok ? null : r.error); if (r.ok) setReason(''); }}>{t('Vote')}</button>
      <div className="w-full"><ErrorNote error={err} /></div>
    </div>
  );
}

function RaiseModal({ onClose }) {
  const { state, quarter, run, actor } = usePlan();
  const t = useT();
  const plans = state.plans.filter((p) => p.quarterId === quarter.id);
  const [epicId, setEpicId] = useState('');
  const [reason, setReason] = useState('');
  const [timeboxMin, setTimebox] = useState(10);
  const [ownerName, setOwner] = useState(actor.name);
  const [err, setErr] = useState(null);
  return (
    <Modal title={t('Raise a discussion item')} onClose={onClose}>
      <Field l={t('Epic (or cross-cutting)')}><select className={input} value={epicId} onChange={(e) => setEpicId(e.target.value)}><option value="">{t('— cross-cutting, no epic —')}</option>{plans.map((p) => { const e = state.epics.find((x) => x.id === p.epicId); return <option key={p.id} value={e.id}>#{p.rank ?? '–'} {e.refCode} {e.title}</option>; })}</select></Field>
      <div className="mt-2"><Field l={t('Why does this need discussion?')}><textarea className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field></div>
      <div className="grid grid-cols-2 gap-3 mt-2">
        <Field l={t('Owner')}><input className={input} value={ownerName} onChange={(e) => setOwner(e.target.value)} /></Field>
        <Field l={t('Timebox (min)')}><input type="number" className={input} value={timeboxMin} onChange={(e) => setTimebox(Number(e.target.value))} /></Field>
      </div>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={onClose}>{t('Cancel')}</button><button className={btn.primary} onClick={async () => { const r = await run('raiseDiscussion', { quarterId: quarter.id, epicId: epicId || null, reason, ownerName, timeboxMin }); if (r.ok) onClose(); else setErr(r.error); }}>{t('Raise')}</button></div>
    </Modal>
  );
}

// One-page plan of record (AC D7). Uses the browser's print.
function PlanOfRecord({ onClose }) {
  const { state, quarter } = usePlan();
  const t = useT();
  const votes = state.votes.filter((v) => v.quarterId === quarter.id);
  const diff = diffAgainstBaseline(state, quarter.id, t);
  const risks = state.impediments.filter((i) => i.kind === 'risk' && i.status === 'open');
  const phaseLabel = t(PHASES.find((p) => p.id === quarter.phase)?.label || quarter.phase);
  return (
    <Modal title={`${t('Plan of record')} · ${quarterLabel(quarter)}`} onClose={onClose} wide>
      <div className="text-sm space-y-4 print:text-xs" id="plan-of-record">
        <p className="text-xs text-muted">{t('Phase:')} {phaseLabel}{quarter.lockedAt && ` · ${t('locked {date}', { date: new Date(quarter.lockedAt).toLocaleDateString() })}`} · {t('printed {time}', { time: new Date().toLocaleString() })}</p>
        {state.teams.map((team) => {
          const plans = teamPlans(state, team.id, quarter.id);
          const load = teamLoad(state, team.id, quarter.id);
          const v = votes.find((x) => x.teamId === team.id);
          return (
            <section key={team.id}>
              <h4 className="font-semibold">{team.name} <span className="font-normal text-muted">— {t('load {low}–{high} of {available} pw ({pct}%)', { low: load.totalLow, high: load.totalHigh, available: load.available, pct: load.pct })} · {t('confidence')} {v ? (quarter.votesRevealed || PHASE_INDEX[quarter.phase] >= PHASE_INDEX.locked ? `${v.vote}/5` : t('cast, hidden until reveal')) : '–'}</span></h4>
              <ul className="ml-4 list-disc">
                {plans.map((p) => { const e = state.epics.find((x) => x.id === p.epicId); const deps = state.dependencies.filter((d) => d.epicId === e.id && d.quarterId === quarter.id); return (
                  <li key={p.id}>#{p.rank ?? '–'} {e.refCode} {e.title} — {t(COMMITMENT_META[p.commitment].label)}, {p.effortLow}–{p.effortHigh} pw
                    {deps.length > 0 && <ul className="ml-4 list-[circle]">{deps.map((d) => <li key={d.id}>{d.refCode} → {state.teams.find((x) => x.id === d.providerTeamId)?.name}: {d.ask} — <ResponsePill value={d.response} size="xs" /></li>)}</ul>}
                  </li>); })}
              </ul>
            </section>
          );
        })}
        <section><h4 className="font-semibold">{t('Risks (ROAM)')}</h4>{risks.length === 0 ? <Empty>{t('None open.')}</Empty> : <ul className="ml-4 list-disc">{risks.map((r) => <li key={r.id}>{r.refCode} {r.title} — {r.roam ? t(r.roam) : t('unassigned')} · {t('owner')} {r.ownerName}</li>)}</ul>}</section>
        <section><h4 className="font-semibold">{t('Changes since baseline')}</h4>{diff.length === 0 ? <Empty>{t('None.')}</Empty> : <ul className="ml-4 list-disc">{diff.map((d, i) => <li key={i}>{d.text}{d.reason && ` — "${d.reason}"`}</li>)}</ul>}</section>
      </div>
      <div className="flex justify-end gap-2 mt-3 print:hidden"><button className={btn.secondary} onClick={onClose}>{t('Close')}</button><button className={btn.primary} onClick={() => window.print()}>{t('Print')}</button></div>
    </Modal>
  );
}
