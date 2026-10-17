import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { isLockedPhase, REASON_REQUIRED } from '../domain/model';
import { planFor, phaseAllows, byId } from '../domain/plan';
import { useT } from '../i18n';
import { cls, RankNo, StatusChip, Tabs, InlineReason, AnswerControl, EmptyLine, ViewHeader, ErrorLine } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';
import { useTourNudge } from '../components/plan/TourPanel';

// Screen 2 — Afhankelijkheden, per team like the Feb version (docs/design.md section 19, D26/D29/D31).
// "Wij vragen": our epics in rank order with their asks and an inline "+ Verzoek".
// "Aan ons gevraagd": asks to this team ordered by the requesting epic's rank, answered with one click.
export function DependenciesView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const firstTeam = actor.teamId || state.teams[0]?.id || '';
  const [teamId, setTeamId] = useState(firstTeam);
  useEffect(() => { setTeamId(actor.teamId || state.teams[0]?.id || ''); }, [actor.id]);
  const [tab, setTab] = useState('outgoing');
  useTourNudge(useCallback((d) => { if (d.tab) setTab(d.tab); }, []));
  const [openEpic, setOpenEpic] = useState(null);
  const [err, setErr] = useState(null);
  if (!quarter) return <NoQuarter />;
  const epics = byId(state.epics); const teams = byId(state.teams);
  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const outgoing = deps.filter((d) => d.requesterTeamId === teamId);
  const incoming = deps.filter((d) => d.providerTeamId === teamId);
  const rankOf = (d) => planFor(state, d.epicId, quarter.id)?.rank ?? 1e9;
  const incomingSorted = [...incoming].sort((a, b) => rankOf(a) - rankOf(b) || a.createdAt.localeCompare(b.createdAt));
  const ourPlans = state.plans.filter((p) => p.quarterId === quarter.id && epics.get(p.epicId)?.teamId === teamId).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const mayWrite = canWriteTeam(actor, teamId) && quarter.phase !== 'closed';
  const answersOpen = phaseAllows(quarter.phase, 'answer');
  const mayAnswer = mayWrite && answersOpen;
  const locked = isLockedPhase(quarter.phase);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };

  return (
    <div data-tour="dependencies">
      <ViewHeader title={t('Dependencies')} right={
        <label className="flex items-center gap-2 text-label text-muted"><span className="sr-only">{t('Team')}</span>
          <select className={`${cls.input} !w-auto font-medium text-ink`} value={teamId} onChange={(e) => setTeamId(e.target.value)} data-tour="team-select">{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </label>
      } />
      <Tabs ariaLabel={t('Direction')} value={tab} onChange={setTab} items={[{ id: 'outgoing', label: t('We ask'), count: outgoing.length }, { id: 'incoming', label: t('Asked of us'), count: incoming.length }]} />
      <ErrorLine error={err} />

      {tab === 'outgoing' && (
        <div className="mt-4 space-y-3" data-tour="outgoing">
          {ourPlans.length === 0 && <div className={cls.card}><EmptyLine>{t('No epics for this team in this quarter.')}</EmptyLine></div>}
          {ourPlans.map((p) => <EpicAsks key={p.id} plan={p} epic={epics.get(p.epicId)} asks={outgoing.filter((d) => d.epicId === p.epicId)} teams={teams} mayWrite={mayWrite} locked={locked} act={act} onOpen={() => setOpenEpic(p.epicId)} />)}
        </div>
      )}

      {tab === 'incoming' && (
        <div className="mt-4" data-tour="incoming">
          {!answersOpen && incoming.length > 0 && <p className="text-caption text-muted mb-2">{t('Answers open from Negotiate.')}</p>}
          {incoming.length === 0 ? <div className={cls.card}><EmptyLine>{t('Nothing asked of this team.')}</EmptyLine></div> : (
            <ul className={`${cls.card} divide-y divide-border`}>
              {incomingSorted.map((d) => <IncomingRow key={d.id} dep={d} epic={epics.get(d.epicId)} rank={planFor(state, d.epicId, quarter.id)?.rank} team={teams.get(d.requesterTeamId)} mayAnswer={mayAnswer} act={act} onOpen={() => setOpenEpic(d.epicId)} />)}
            </ul>
          )}
        </div>
      )}
      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}

// One of our epics with its asks and the inline "+ Verzoek" row.
function EpicAsks({ plan, epic, asks, teams, mayWrite, locked, act, onOpen }) {
  const { state, quarter } = usePlan();
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null); // dep id
  if (!epic) return null;
  const others = state.teams.filter((x) => x.id !== epic.teamId);
  return (
    <section className={cls.card} aria-label={epic.title}>
      <header className="flex items-center gap-3 px-3 h-11 border-b border-border">
        <RankNo rank={plan.rank} size="sm" />
        <button className="min-w-0 flex-1 text-left flex items-baseline gap-2 hover:underline focus-ring rounded-control" onClick={onOpen}><span className="text-body font-medium truncate">{epic.title}</span><span className="text-caption text-faint mono">{epic.refCode}</span></button>
        {mayWrite && !adding && <button className={cls.ghost} onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />{t('Ask')}</button>}
      </header>
      {asks.length === 0 && !adding && <p className="px-3 py-2 text-caption text-muted">{t('No asks.')}</p>}
      <ul className="divide-y divide-border">
        {asks.map((d) => (
          <li key={d.id} className="px-3 py-2">
            <div className="flex items-center gap-3 min-h-8">
              <span className="w-40 shrink-0 text-label text-ink-2 truncate">{teams.get(d.providerTeamId)?.name}</span>
              <span className="flex-1 min-w-0 text-body truncate">{d.ask}{d.effortHigh > 0 && <span className="text-caption text-faint tnum"> · {d.effortLow > 0 && d.effortLow !== d.effortHigh ? `${d.effortLow}–` : ''}{d.effortHigh} pw</span>}</span>
              <StatusChip response={d.response} />
              {mayWrite && removing !== d.id && <button className={cls.icon} aria-label={`${t('Remove ask')} ${d.refCode}`} onClick={() => setRemoving(d.id)}><Trash2 size={14} /></button>}
            </div>
            {d.responseReason && <p className="pl-[172px] text-caption text-muted">{d.responseReason}</p>}
            {removing === d.id && (
              <div className="pl-[172px] pt-1">
                {locked ? <InlineReason required saveLabel={t('Remove')} onSave={async (reason) => { const r = await act('deleteDependency', d.id, reason); if (r.ok) setRemoving(null); }} onCancel={() => setRemoving(null)} />
                  : <div className="flex items-center gap-2 text-label"><span className="text-muted">{t('Remove?')}</span><button className={cls.secondary} onClick={async () => { const r = await act('deleteDependency', d.id, ''); if (r.ok) setRemoving(null); }}>{t('Yes')}</button><button className={cls.secondary} onClick={() => setRemoving(null)}>{t('No')}</button></div>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding && <NewAskRow epic={epic} quarter={quarter} others={others} locked={locked} act={act} onDone={() => setAdding(false)} />}
    </section>
  );
}

function NewAskRow({ epic, quarter, others, locked, act, onDone }) {
  const t = useT();
  const [providerTeamId, setProviderTeamId] = useState(others[0]?.id || '');
  const [ask, setAsk] = useState('');
  const [effort, setEffort] = useState('');
  const [reason, setReason] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const pw = Number(effort || 0);
    const r = await act('addDependency', { epicId: epic.id, providerTeamId, quarterId: quarter.id, ask: ask.trim(), effortLow: pw, effortHigh: pw, reason });
    if (r.ok) onDone();
  };
  return (
    <form onSubmit={submit} className="px-3 py-2 border-t border-border bg-canvas flex items-center gap-2 flex-wrap anim-fade-in">
      <select className={`${cls.input} !w-40`} value={providerTeamId} onChange={(e) => setProviderTeamId(e.target.value)} aria-label={t('Team we need')}>{others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input autoFocus className={`${cls.input} flex-1 min-w-[200px]`} placeholder={t('What do we need?')} aria-label={t('What do we need?')} value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }} />
      <input type="number" min="0" step="0.5" className={`${cls.input} !w-20 tnum`} placeholder="pw" aria-label={t('Effort (pw)')} value={effort} onChange={(e) => setEffort(e.target.value)} />
      {locked && <input className={`${cls.input} !w-48`} placeholder={t('Why? (quarter is locked)')} aria-label={t('Why? (quarter is locked)')} value={reason} onChange={(e) => setReason(e.target.value)} />}
      <button type="submit" className={cls.primary} disabled={!ask.trim()}>{t('Send')}</button>
      <button type="button" className={cls.secondary} onClick={onDone}>{t('Cancel')}</button>
    </form>
  );
}

// An ask to our team: rank · requesting team · what · for epic · Toezeggen / Bespreken / Kan niet.
function IncomingRow({ dep, epic, rank, team, mayAnswer, act, onOpen }) {
  const t = useT();
  const [reasonFor, setReasonFor] = useState(null); // response awaiting an inline reason
  const pick = async (response) => {
    if (response === dep.response && !REASON_REQUIRED.has(response) && response !== 'needs_priority_call') return;
    if (REASON_REQUIRED.has(response)) { setReasonFor(response); return; }
    if (response === 'needs_priority_call') {
      if (dep.response !== response) { const r = await act('answerDependency', dep.id, { response, reason: '' }); if (!r.ok) return; }
      setReasonFor(response); return;
    }
    await act('answerDependency', dep.id, { response, reason: '' });
  };
  const labelId = `ask-${dep.id}`;
  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-3 min-h-9 flex-wrap md:flex-nowrap">
        <RankNo rank={rank} size="sm" />
        <span className="w-40 shrink-0 text-label text-ink-2 truncate">{team?.name}</span>
        <div className="flex-1 min-w-[200px]">
          <div id={labelId} className="text-body">{dep.ask}{dep.effortHigh > 0 && <span className="text-caption text-faint tnum"> · {dep.effortHigh} pw</span>}</div>
          <div className="text-caption text-muted truncate">{t('for')} <button className="hover:underline text-accent focus-ring rounded-control" onClick={onOpen}>{epic?.title}</button></div>
        </div>
        {mayAnswer ? <AnswerControl value={dep.response} onPick={pick} labelledBy={labelId} /> : <StatusChip response={dep.response} />}
        {mayAnswer && (dep.response === 'partial' || dep.response === 'deferred') && <StatusChip response={dep.response} />}
      </div>
      {dep.responseReason && reasonFor == null && <p className="pl-[172px] text-caption text-muted mt-0.5">{dep.responseReason}</p>}
      {reasonFor && (
        <div className="pl-[172px] pt-1">
          <InlineReason required={REASON_REQUIRED.has(reasonFor)} defaultValue={dep.responseReason || ''} placeholder={reasonFor === 'declined' ? t('What stands in the way?') : ''}
            onSave={async (reason) => { const r = await act('answerDependency', dep.id, { response: reasonFor, reason }); if (r.ok) setReasonFor(null); }} onCancel={() => setReasonFor(null)} />
        </div>
      )}
    </li>
  );
}
