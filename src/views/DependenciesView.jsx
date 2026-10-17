import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { isLockedPhase, REASON_REQUIRED, ASK_META } from '../domain/model';
import { availableWeeks } from '../domain/capacity';
import { planFor, phaseAllows, byId } from '../domain/plan';
import { useT } from '../i18n';
import { cls, RankNo, StatusChip, Tabs, InlineReason, AnswerControl, AskIcon, EmptyLine, ViewHeader, ErrorLine, Disclosure, toneClass, normAsk } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';
import { useTourNudge } from '../components/plan/TourPanel';

// Screen 2 — Afhankelijkheden, per team like the Feb version (docs/design.md section 19, D26/D29/D31; iteration 1).
// "Wij vragen": our epics in rank order with their asks and an inline "+ Verzoek".
// "Aan ons gevraagd": asks to this team ordered by the requesting epic's rank, answered with one click.
const COUNT_ORDER = ['declined', 'needs_priority_call', 'proposed', 'accepted'];
const fmtPw = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

export function DependenciesView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const firstTeam = actor.teamId || state.teams[0]?.id || '';
  const [teamId, setTeamId] = useState(firstTeam);
  useEffect(() => { setTeamId(actor.teamId || state.teams[0]?.id || ''); }, [actor.id]);
  const [tab, setTab] = useState('outgoing');
  const [filter, setFilter] = useState(null); // one of COUNT_ORDER, from the count chips
  useTourNudge(useCallback((d) => { if (d.tab) setTab(d.tab); }, []));
  const [openEpic, setOpenEpic] = useState(null);
  const [err, setErr] = useState(null);
  if (!quarter) return <NoQuarter />;
  const epics = byId(state.epics); const teams = byId(state.teams);
  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const outgoing = deps.filter((d) => d.requesterTeamId === teamId);
  const incoming = deps.filter((d) => d.providerTeamId === teamId);
  const inFilter = (d) => !filter || normAsk(d.response) === filter;
  const rankOf = (d) => planFor(state, d.epicId, quarter.id)?.rank ?? 1e9;
  const incomingSorted = [...incoming].filter(inFilter).sort((a, b) => rankOf(a) - rankOf(b) || a.createdAt.localeCompare(b.createdAt));
  const ourPlans = state.plans.filter((p) => p.quarterId === quarter.id && epics.get(p.epicId)?.teamId === teamId).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const asksOf = (p) => outgoing.filter((d) => d.epicId === p.epicId);
  const withAsks = ourPlans.filter((p) => asksOf(p).some(inFilter));
  const withoutAsks = ourPlans.filter((p) => asksOf(p).length === 0);
  const mayWrite = canWriteTeam(actor, teamId) && quarter.phase !== 'closed';
  const answersOpen = phaseAllows(quarter.phase, 'answer');
  const mayAnswer = mayWrite && answersOpen;
  const locked = isLockedPhase(quarter.phase);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  // Load on the provider (item 6): everything not declined counts as requested; available from the capacity module.
  const available = availableWeeks(state.capacity.find((c) => c.teamId === teamId && c.quarterId === quarter.id));
  const requested = incoming.filter((d) => normAsk(d.response) !== 'declined').reduce((s, d) => s + (d.effortHigh || 0), 0);

  return (
    <div data-tour="dependencies">
      <ViewHeader title={t('Dependencies')} meta={
        <span className="inline-flex items-center gap-2 text-title text-muted"><span aria-hidden="true">·</span>
          <label><span className="sr-only">{t('Team')}</span>
            <select className="h-8 pl-1 pr-6 rounded-control bg-transparent text-title font-semibold text-ink hover:bg-surface-2 focus-ring cursor-pointer" value={teamId} onChange={(e) => { setTeamId(e.target.value); setFilter(null); }} data-tour="team-select">{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
        </span>
      } />
      <Tabs ariaLabel={t('Direction')} value={tab} onChange={(v) => { setTab(v); setFilter(null); }} items={[{ id: 'outgoing', label: t('We ask'), count: outgoing.length }, { id: 'incoming', label: t('Asked of us'), count: incoming.length }]} />
      <ErrorLine error={err} />

      <div className="mt-3 flex items-center gap-3 flex-wrap min-h-7">
        <CountChips deps={tab === 'outgoing' ? outgoing : incoming} value={filter} onChange={setFilter} />
        {tab === 'incoming' && available > 0 && (
          <span className={`text-label tnum ${requested > available ? 'text-danger-fg font-medium' : 'text-muted'}`}>
            {t('Requested {n} pw', { n: fmtPw(requested) })} <span aria-hidden="true">·</span> {t('available {n} pw', { n: fmtPw(available) })}
          </span>
        )}
      </div>

      {tab === 'outgoing' && (
        <div className="mt-3 space-y-3" data-tour="outgoing">
          {ourPlans.length === 0 && <div className={cls.card}><EmptyLine>{t('No epics for this team in this quarter.')}</EmptyLine></div>}
          {withAsks.map((p) => <EpicAsks key={p.id} plan={p} epic={epics.get(p.epicId)} asks={asksOf(p).filter(inFilter)} teams={teams} mayWrite={mayWrite} locked={locked} act={act} onOpen={() => setOpenEpic(p.epicId)} />)}
          {withoutAsks.length > 0 && !filter && (
            <Disclosure className="px-1" summary={t('{n} epics without asks', { n: withoutAsks.length })}>
              <div className="space-y-3">{withoutAsks.map((p) => <EpicAsks key={p.id} plan={p} epic={epics.get(p.epicId)} asks={[]} teams={teams} mayWrite={mayWrite} locked={locked} act={act} onOpen={() => setOpenEpic(p.epicId)} />)}</div>
            </Disclosure>
          )}
        </div>
      )}

      {tab === 'incoming' && (
        <div className="mt-3" data-tour="incoming">
          {!answersOpen && incoming.length > 0 && <p className="text-caption text-muted mb-2">{t('Answers open from Negotiate.')}</p>}
          {incoming.length === 0 ? <div className={cls.card}><EmptyLine>{t('Nothing asked of this team.')}</EmptyLine></div> : (
            <ul className={`${cls.card} divide-y divide-border`}>
              {incomingSorted.map((d) => <IncomingRow key={d.id} dep={d} epic={epics.get(d.epicId)} rank={planFor(state, d.epicId, quarter.id)?.rank} team={teams.get(d.requesterTeamId)} mayAnswer={mayAnswer} act={act} onOpen={() => setOpenEpic(d.epicId)} />)}
              {incomingSorted.length === 0 && <li><EmptyLine>{t('Nothing here.')}</EmptyLine></li>}
            </ul>
          )}
        </div>
      )}
      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}

// Count chips "✕ 1 · ? 1 · ◷ 1 · ✓ 3" (item 6); each toggles a filter on the list below.
function CountChips({ deps, value, onChange }) {
  const t = useT();
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={t('Filter by answer')}>
      {COUNT_ORDER.map((s) => {
        const n = deps.filter((d) => normAsk(d.response) === s).length;
        const active = value === s;
        return (
          <button key={s} type="button" aria-pressed={active} onClick={() => onChange(active ? null : s)} aria-label={`${n} ${t(ASK_META[s].label)}`}
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-full border text-caption font-semibold tnum transition-base focus-ring ${n === 0 && !active ? 'opacity-50' : ''} ${toneClass(ASK_META[s].tone)} ${active ? 'ring-2 ring-accent' : 'hover:brightness-95'}`}>
            <AskIcon response={s} size={12} />{n}
          </button>
        );
      })}
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
        <button className="min-w-0 flex-1 text-left text-body font-medium truncate hover:underline focus-ring rounded-control" onClick={onOpen}>{epic.title}</button>
        {mayWrite && !adding && <button className={cls.ghost} onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />{t('Ask')}</button>}
      </header>
      <ul className="divide-y divide-border">
        {asks.map((d) => (
          <li key={d.id} className="group px-3 py-2">
            <div className="flex items-center gap-3 min-h-8">
              <span className="w-40 shrink-0 text-label text-ink-2 truncate">{teams.get(d.providerTeamId)?.name}</span>
              <span className="flex-1 min-w-0 text-body truncate">{d.ask}</span>
              <StatusChip response={d.response} />
              {mayWrite && removing !== d.id && <button className={`${cls.icon} opacity-0 group-hover:opacity-100 focus:opacity-100 transition-base`} aria-label={`${t('Remove ask')} ${d.refCode}`} onClick={() => setRemoving(d.id)}><Trash2 size={14} /></button>}
            </div>
            {d.responseReason && <p className="pl-[172px] text-label text-muted">{d.responseReason}</p>}
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
// Only "Kan niet" opens an inline reason (item 10); the other two answer in one click.
function IncomingRow({ dep, epic, rank, team, mayAnswer, act, onOpen }) {
  const t = useT();
  const [reasonFor, setReasonFor] = useState(null); // response awaiting an inline reason
  const pick = async (response) => {
    if (response === dep.response) return;
    if (REASON_REQUIRED.has(response)) { setReasonFor(response); return; }
    setReasonFor(null);
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
      {dep.responseReason && reasonFor == null && <p className="pl-[172px] text-label text-muted mt-0.5">{dep.responseReason}</p>}
      {reasonFor && (
        <div className="pl-[172px] pt-1">
          <InlineReason required defaultValue={dep.responseReason || ''} placeholder={t('What stands in the way?')}
            onSave={async (reason) => { const r = await act('answerDependency', dep.id, { response: reasonFor, reason }); if (r.ok) setReasonFor(null); }} onCancel={() => setReasonFor(null)} />
        </div>
      )}
    </li>
  );
}
