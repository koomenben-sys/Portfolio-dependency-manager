import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { isLockedPhase, REASON_REQUIRED, ASK_META, cyclePhase } from '../domain/model';
import { followsOf, readFollowOnly, writeFollowOnly } from '../domain/follows';
import { teamCapacity } from '../domain/capacity';
import { planFor, phaseAllows, byId } from '../domain/plan';
import { CERTAINTIES, CERTAINTY_META, sizeRange, signalOf, needsConfirmation } from '../domain/rhythm';
import { useT } from '../i18n';
import { cls, RankNo, StatusChip, Tabs, InlineReason, AnswerControl, AskIcon, EmptyLine, ViewHeader, ErrorLine, Disclosure, Dialog, toneClass, normAsk, SizePicker, SizeText, SignalChip, SignalControl, SignalIcon, CapacityLine, FollowStar, FollowOnlyToggle, PostLockMark } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';
import { useTourNudge } from '../components/plan/TourPanel';

// Screen 2 — Afhankelijkheden, per team like the Feb version (docs/design.md section 19, D26/D29/D31; iteration 1).
// "Wij vragen": our epics in rank order with their asks and an inline "+ Verzoek".
// "Aan ons gevraagd": asks to this team ordered by the requesting epic's rank, answered with one click.
// Release B (section 22): the team's capacity line + a four-field dialog (L2/L3), size and certainty on the ask
// form (L1/L4), the provider's signal on committed asks in "Aan ons gevraagd" and the read-only signal in "Wij vragen" (L7/L8).
// Section 23 (M3): the same screen is step 2 "Afgestemd" once the quarter runs — asks added after the lock carry a
// small "na vastzetten" label, an "Alleen gevolgd" toggle filters on followed epics (M8), and a closed quarter is read-only.
const COUNT_ORDER = ['declined', 'needs_priority_call', 'proposed', 'accepted'];

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
  const [capDialog, setCapDialog] = useState(false);
  const [err, setErr] = useState(null);
  const [followOnly, setFollowOnlyState] = useState(() => readFollowOnly(actor.id));
  useEffect(() => { setFollowOnlyState(readFollowOnly(actor.id)); }, [actor.id]);
  if (!quarter) return <NoQuarter />;
  const agreed = cyclePhase(quarter.phase) !== 'Planning'; // step 2 "Afgestemd" (M3)
  const followed = followsOf(state, actor.id);
  const setFollowOnly = (on) => { setFollowOnlyState(on); writeFollowOnly(actor.id, on); };
  const epics = byId(state.epics); const teams = byId(state.teams);
  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const outgoing = deps.filter((d) => d.requesterTeamId === teamId);
  const incoming = deps.filter((d) => d.providerTeamId === teamId);
  const followOk = (epicId) => !(agreed && followOnly) || followed.has(epicId);
  const inFilter = (d) => (!filter || normAsk(d.response) === filter) && followOk(d.epicId);
  const rankOf = (d) => planFor(state, d.epicId, quarter.id)?.rank ?? 1e9;
  const incomingSorted = [...incoming].filter(inFilter).sort((a, b) => rankOf(a) - rankOf(b) || a.createdAt.localeCompare(b.createdAt));
  const ourPlans = state.plans.filter((p) => p.quarterId === quarter.id && epics.get(p.epicId)?.teamId === teamId && followOk(p.epicId)).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const followedInQuarter = state.plans.filter((p) => p.quarterId === quarter.id && followed.has(p.epicId)).length;
  const asksOf = (p) => outgoing.filter((d) => d.epicId === p.epicId);
  const withAsks = ourPlans.filter((p) => asksOf(p).some(inFilter));
  const withoutAsks = ourPlans.filter((p) => asksOf(p).length === 0);
  const mayWrite = canWriteTeam(actor, teamId) && quarter.phase !== 'closed';
  const answersOpen = phaseAllows(quarter.phase, 'answer');
  const mayAnswer = mayWrite && answersOpen;
  const locked = isLockedPhase(quarter.phase);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  // Release B (L3): own work + committed asks against the calendar-based capacity (domain/capacity.js).
  const capacity = teamCapacity(state, teamId, quarter.id);

  return (
    <div data-tour="dependencies">
      <ViewHeader title={t(agreed ? 'Agreed' : 'Dependencies')} meta={
        <span className="inline-flex items-center gap-2 text-title text-muted"><span aria-hidden="true">·</span>
          <label><span className="sr-only">{t('Team')}</span>
            <select className="h-8 pl-1 pr-6 rounded-control bg-transparent text-title font-semibold text-ink hover:bg-surface-2 focus-ring cursor-pointer" value={teamId} onChange={(e) => { setTeamId(e.target.value); setFilter(null); }} data-tour="team-select">{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
        </span>
      } />
      {/* Below xl: two tabs. From xl (section 24, D77): both directions side by side, each with its own heading, count and chips. */}
      <div className="xl:hidden"><Tabs ariaLabel={t('Direction')} value={tab} onChange={(v) => { setTab(v); setFilter(null); }} items={[{ id: 'outgoing', label: t('We ask'), count: outgoing.length }, { id: 'incoming', label: t('Asked of us'), count: incoming.length }]} /></div>
      <ErrorLine error={err} />

      <div className="mt-4 flex items-center gap-3 flex-wrap min-h-7">
        <div className="xl:hidden"><CountChips deps={tab === 'outgoing' ? outgoing : incoming} value={filter} onChange={setFilter} /></div>
        {agreed && <FollowOnlyToggle on={followOnly} onChange={setFollowOnly} count={followedInQuarter} />}
        <CapacityLine cap={capacity} onEdit={mayWrite ? () => setCapDialog(true) : undefined} className="ml-auto" />
      </div>

      <div className="xl:grid xl:grid-cols-2 xl:gap-6 xl:items-start">
        <section className={tab === 'outgoing' ? '' : 'hidden xl:block'} aria-label={t('We ask')}>
          <ColumnHead label={t('We ask')} deps={outgoing} filter={filter} onFilter={setFilter} />
          <div className="mt-4 space-y-3" data-tour="outgoing">
            {ourPlans.length === 0 && <div className={cls.card}><EmptyLine>{t(agreed && followOnly ? 'No followed epics here.' : 'No epics for this team in this quarter.')}</EmptyLine></div>}
            {withAsks.map((p) => <EpicAsks key={p.id} plan={p} epic={epics.get(p.epicId)} asks={asksOf(p).filter(inFilter)} teams={teams} mayWrite={mayWrite} locked={locked} act={act} followed={followed.has(p.epicId)} onOpen={() => setOpenEpic(p.epicId)} />)}
            {withoutAsks.length > 0 && !filter && (
              <Disclosure className="px-1" summary={withoutAsks.length === 1 ? t('1 epic without asks') : t('{n} epics without asks', { n: withoutAsks.length })}>
                <div className="space-y-3">{withoutAsks.map((p) => <EpicAsks key={p.id} plan={p} epic={epics.get(p.epicId)} asks={[]} teams={teams} mayWrite={mayWrite} locked={locked} act={act} followed={followed.has(p.epicId)} onOpen={() => setOpenEpic(p.epicId)} />)}</div>
              </Disclosure>
            )}
          </div>
        </section>

        <section className={tab === 'incoming' ? '' : 'hidden xl:block'} aria-label={t('Asked of us')}>
          <ColumnHead label={t('Asked of us')} deps={incoming} filter={filter} onFilter={setFilter} />
          <div className="mt-4" data-tour="incoming">
            {!answersOpen && incoming.length > 0 && <p className="text-caption text-muted mb-2">{t('Answers open from Negotiate.')}</p>}
            {incoming.length === 0 ? <div className={cls.card}><EmptyLine>{t('Nothing asked of this team.')}</EmptyLine></div> : (
              <ul className={`${cls.card} divide-y divide-border overflow-hidden`}>
                {incomingSorted.map((d) => <IncomingRow key={d.id} dep={d} epic={epics.get(d.epicId)} rank={planFor(state, d.epicId, quarter.id)?.rank} team={teams.get(d.requesterTeamId)} mayAnswer={mayAnswer} maySignal={mayWrite} act={act} followed={followed.has(d.epicId)} onOpen={() => setOpenEpic(d.epicId)} />)}
                {incomingSorted.length === 0 && <li><EmptyLine>{t(agreed && followOnly ? 'No followed epics here.' : 'Nothing here.')}</EmptyLine></li>}
              </ul>
            )}
          </div>
        </section>
      </div>
      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {capDialog && <CapacityDialog teamId={teamId} team={teams.get(teamId)} cap={capacity.cap} locked={locked} act={act} onClose={() => setCapDialog(false)} />}
    </div>
  );
}

// Release B (L2): FTE ingevuld · FTE vacant · Verlofweken (team total) · Run %. Team level only, no names.
function CapacityDialog({ teamId, team, cap, locked, act, onClose }) {
  const { quarter } = usePlan();
  const t = useT();
  const [form, setForm] = useState({ headcount: cap?.headcount ?? '', fteVacant: cap?.fteVacant ?? 0, absenceWeeks: cap?.absenceWeeks ?? 0, reservePct: cap?.reservePct ?? 20 });
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const num = (v) => (v === '' ? 0 : Number(v));
    const r = await act('upsertCapacity', { teamId, quarterId: quarter.id, headcount: num(form.headcount), fteVacant: num(form.fteVacant), absenceWeeks: num(form.absenceWeeks), reservePct: num(form.reservePct), reason });
    if (r.ok) onClose(); else setErr(r.error);
  };
  const field = (k, label, step = '0.5', max) => (
    <label className="block"><span className={cls.label}>{label}</span><input type="number" min="0" max={max} step={step} className={`${cls.input} tnum`} value={form[k]} onChange={set(k)} /></label>
  );
  return (
    <Dialog title={`${t('Capacity')} · ${team?.name || ''}`} onClose={onClose} width="w-[380px]">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {field('headcount', t('FTE filled'))}
          {field('fteVacant', t('FTE vacant'))}
          {field('absenceWeeks', t('Leave weeks (team)'))}
          {field('reservePct', t('Run %'), '1', 80)}
        </div>
        {locked && <label className="block"><span className={cls.label}>{t('Why? (quarter is locked)')}</span><input className={cls.input} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        <ErrorLine error={err} />
        <div className="flex justify-end gap-2 pt-1"><button type="button" className={cls.secondary} onClick={onClose}>{t('Cancel')}</button><button type="submit" className={cls.primary}>{t('Save')}</button></div>
      </form>
    </Dialog>
  );
}

// xl ledger heading: "Wij vragen 5" + the count chips of that direction (D77). Hidden below xl, where the tabs do this.
function ColumnHead({ label, deps, filter, onFilter }) {
  return (
    <div className="hidden xl:flex items-center gap-3 h-9 border-b border-border">
      <h2 className="inline-flex items-center gap-1.5 text-label font-medium text-ink">{label}<span className="tnum rounded-full px-1.5 h-5 min-w-5 inline-flex items-center justify-center text-micro font-semibold bg-surface-2 text-muted">{deps.length}</span></h2>
      <CountChips deps={deps} value={filter} onChange={onFilter} />
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
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-full text-caption font-semibold tnum transition-base focus-ring ${n === 0 && !active ? 'bg-surface-2 text-muted' : `${toneClass(ASK_META[s].tone)} hover:opacity-80`} ${active ? 'ring-2 ring-accent' : ''}`}>
            <AskIcon response={s} size={12} />{n}
          </button>
        );
      })}
    </div>
  );
}

// One of our epics with its asks and the inline "+ Verzoek" row.
function EpicAsks({ plan, epic, asks, teams, mayWrite, locked, act, followed, onOpen }) {
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
        <button className="min-w-0 flex-1 text-left text-body font-medium sm:truncate hover:underline focus-ring rounded-control" onClick={onOpen}>{epic.title}<FollowStar on={followed} className="inline ml-1.5 -mt-0.5" /></button>
        {mayWrite && !adding && <button className={cls.ghost} onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />{t('Ask')}</button>}
      </header>
      <ul className="divide-y divide-border">
        {asks.map((d) => (
          <li key={d.id} className="group px-3 py-2">
            <div className="flex items-center gap-3 min-h-8">
              <span className="w-28 sm:w-40 shrink-0 text-label text-muted sm:truncate">{teams.get(d.providerTeamId)?.name}</span>
              <span className="flex-1 min-w-0 text-body sm:truncate">{d.ask}{(d.size || d.effortHigh > 0) && <span className="text-caption text-faint"> · <SizeText size={d.size} low={d.effortLow} high={d.effortHigh} /></span>}{d.certainty === 'low' && <span className="text-caption text-faint"> · {t('low certainty')}</span>}</span>
              <PostLockMark dep={d} quarter={quarter} />
              <SignalChip dep={d} />
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

// Release B (L1/L4): size picker writes the mapped range; without a size the pw field stays; certainty next to it.
function NewAskRow({ epic, quarter, others, locked, act, onDone }) {
  const { state } = usePlan();
  const t = useT();
  const [providerTeamId, setProviderTeamId] = useState(others[0]?.id || '');
  const [ask, setAsk] = useState('');
  const [effort, setEffort] = useState('');
  const [size, setSize] = useState(null);
  const [certainty, setCertainty] = useState('medium');
  const [reason, setReason] = useState('');
  const range = size ? sizeRange(state.settings, size) : null;
  const submit = async (e) => {
    e.preventDefault();
    const pw = Number(effort || 0);
    const r = await act('addDependency', { epicId: epic.id, providerTeamId, quarterId: quarter.id, ask: ask.trim(), effortLow: pw, effortHigh: pw, size, certainty, reason });
    if (r.ok) onDone();
  };
  return (
    <form onSubmit={submit} className="px-3 py-2 border-t border-border bg-surface-2 rounded-b-panel flex items-center gap-2 flex-wrap anim-fade-in">
      <select className={`${cls.input} !w-40`} value={providerTeamId} onChange={(e) => setProviderTeamId(e.target.value)} aria-label={t('Team we need')}>{others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input autoFocus className={`${cls.input} flex-1 min-w-[200px]`} placeholder={t('What do we need?')} aria-label={t('What do we need?')} value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }} />
      <SizePicker value={size} onPick={setSize} />
      {range ? <span className="text-caption text-muted tnum whitespace-nowrap">{range[0]}–{range[1]} pw</span>
        : <input type="number" min="0" step="0.5" className={`${cls.input} !w-20 tnum`} placeholder="pw" aria-label={t('Effort (pw)')} value={effort} onChange={(e) => setEffort(e.target.value)} />}
      <select className={`${cls.input} !w-auto`} value={certainty} onChange={(e) => setCertainty(e.target.value)} aria-label={t('Certainty')} title={t('Certainty')}>{CERTAINTIES.map((c) => <option key={c} value={c}>{t(CERTAINTY_META[c].label)}</option>)}</select>
      {locked && <input className={`${cls.input} !w-48`} placeholder={t('Why? (quarter is locked)')} aria-label={t('Why? (quarter is locked)')} value={reason} onChange={(e) => setReason(e.target.value)} />}
      <button type="submit" className={cls.primary} disabled={!ask.trim()}>{t('Send')}</button>
      <button type="button" className={cls.secondary} onClick={onDone}>{t('Cancel')}</button>
    </form>
  );
}

// An ask to our team: rank · requesting team · what · for epic · Toezeggen / Bespreken / Kan niet.
// Only "Kan niet" opens an inline reason (item 10); the other two answer in one click.
function IncomingRow({ dep, epic, rank, team, mayAnswer, maySignal, act, followed, onOpen }) {
  const { state, quarter } = usePlan();
  const t = useT();
  const [reasonFor, setReasonFor] = useState(null); // response awaiting an inline reason
  const [noteFor, setNoteFor] = useState(null); // signal awaiting its optional note (L7)
  const [sigOpen, setSigOpen] = useState(false); // Op koers stays one quiet button until clicked (D61)
  const committed = normAsk(dep.response) === 'accepted';
  const signal = signalOf(dep);
  const pickSignal = async (s) => {
    if (s === signal && noteFor == null) return;
    if (s === 'on_track') { setNoteFor(null); await act('setSignal', dep.id, s, ''); return; }
    setNoteFor(s);
  };
  const confirmDue = maySignal && needsConfirmation(dep, quarter, state.settings);
  const pick = async (response) => {
    if (response === dep.response) return;
    if (REASON_REQUIRED.has(response)) { setReasonFor(response); return; }
    setReasonFor(null);
    await act('answerDependency', dep.id, { response, reason: '' });
  };
  const labelId = `ask-${dep.id}`;
  return (
    <li className="group px-3 py-2 rounded-row">
      <div className="flex items-center gap-3 min-h-9 flex-wrap md:flex-nowrap">
        <RankNo rank={rank} size="sm" />
        <span className="w-28 sm:w-40 shrink-0 text-label text-muted sm:truncate">{team?.name}</span>
        <div className="flex-1 min-w-[200px]">
          <div id={labelId} className="text-body">{dep.ask}{(dep.size || dep.effortHigh > 0) && <span className="text-caption text-faint"> · <SizeText size={dep.size} low={dep.effortLow} high={dep.effortHigh} /></span>}{dep.certainty === 'low' && <span className="text-caption text-faint"> · {t('low certainty')}</span>}</div>
          <div className="text-caption text-muted truncate">{t('for')} <button className="hover:underline text-accent focus-ring rounded-control" onClick={onOpen}>{epic?.title}</button><FollowStar on={followed} className="inline ml-1" /></div>
        </div>
        <PostLockMark dep={dep} quarter={quarter} />
        {committed && maySignal && signal === 'on_track' && !sigOpen && noteFor == null && !confirmDue && (
          <button type="button" className={`${cls.quiet} opacity-0 group-hover:opacity-100 focus:opacity-100 transition-base`} onClick={() => setSigOpen(true)} aria-label={`${t('Signal')}: ${t('On track')}`}><SignalIcon signal="on_track" />{t('Signal')}</button>
        )}
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
      {committed && (maySignal ? (signal === 'on_track' && !sigOpen && noteFor == null && !confirmDue ? null : (
        <div className="pl-[172px] pt-1.5 flex items-center gap-2 flex-wrap">
          <SignalControl value={signal} onPick={(k) => { setSigOpen(false); pickSignal(k); }} labelledBy={labelId} />
          {noteFor == null && dep.signalNote && signal !== 'on_track' && <span className="text-label text-muted truncate max-w-[320px]">{dep.signalNote}</span>}
          {confirmDue && noteFor == null && <button type="button" className={cls.quiet} onClick={() => act('confirmSignal', dep.id)} title={t('Still on track, no change')}>{t('Confirm')}</button>}
          {noteFor && (
            <InlineReason label={t('Note (optional)')} defaultValue={dep.signalNote || ''} placeholder={t('One line, e.g. what shifts')}
              onSave={async (note) => { const r = await act('setSignal', dep.id, noteFor, note); if (r.ok) setNoteFor(null); }} onCancel={() => setNoteFor(null)} />
          )}
        </div>
      )) : signal !== 'on_track' && <div className="pl-[172px] pt-1"><SignalChip dep={dep} /></div>)}
    </li>
  );
}
