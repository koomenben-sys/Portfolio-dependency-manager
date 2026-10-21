import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Lock } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { isLockedPhase, REASON_REQUIRED, ASK_META, cyclePhase } from '../domain/model';
import { followsOf, readFollowOnly, writeFollowOnly } from '../domain/follows';
import { teamCapacity } from '../domain/capacity';
import { planFor, phaseAllows, byId } from '../domain/plan';
import { CERTAINTIES, CERTAINTY_META, sizeRange } from '../domain/rhythm';
import { useT } from '../i18n';
import { cls, RankNo, StatusChip, Tabs, InlineReason, AnswerControl, AskIcon, EmptyLine, ViewHeader, quarterMeta, fmtDay, ErrorLine, Disclosure, Dialog, toneClass, normAsk, ASK_SEVERITY, SizePicker, SizeCell, FollowStar, FollowOnlyToggle, PostLockMark } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';
import { useTourNudge } from '../components/plan/TourPanel';
import { useTableSort, SortButton, SortedChip } from '../components/plan/sort';

// Screen 2 — Afhankelijkheden, per team like the Feb version (docs/design.md section 19, D26/D29/D31; iteration 1).
// "Wij vragen": our epics in rank order with their asks and an inline "+ Verzoek".
// "Aan ons gevraagd": asks to this team ordered by the requesting epic's rank, answered with one click.
// Release B (section 22): size and certainty on the ask form (L1/L4), the four-field capacity dialog (L2).
// Section 23 (M3): the same screen is step 2 "Afgestemd" once the quarter runs — an "Alleen gevolgd" toggle filters on
// followed epics (M8). Section 25 (D83): asks and answers are fixed from the lock on.
// Section 26 (D86, "Optie 1"): the title row carries the team selector on the right; below it one team block with the
// capacity band, percentage and bar; in Uitvoering / Afgesloten a read-only line. Signals left this screen (Voortgang).
// Section 27 (D91): both columns are flat rows in rank order with one structure (AskRow): #rank · ask · "Team · voor
// Epic" · size cell · answer. Only the team shown differs (provider / requester) and the provider gets the answer
// control while answering is allowed. "+ Verzoek" is the last row of "Wij vragen" and picks the epic itself.
const COUNT_ORDER = ['declined', 'needs_priority_call', 'proposed', 'accepted'];
const teamKey = (actorId) => `kp.team.${actorId}`;
const readTeam = (actorId) => { try { return localStorage.getItem(teamKey(actorId)) || ''; } catch { return ''; } };
const writeTeam = (actorId, teamId) => { try { localStorage.setItem(teamKey(actorId), teamId); } catch { /* private mode */ } };

export function DependenciesView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  // The chosen team is remembered per person on this device; an own team wins the first time, then the last choice.
  const pickTeam = () => { const saved = readTeam(actor.id); return (saved && state.teams.some((x) => x.id === saved) ? saved : actor.teamId) || state.teams[0]?.id || ''; };
  const [teamId, setTeamIdState] = useState(pickTeam);
  useEffect(() => { setTeamIdState(pickTeam()); }, [actor.id]);
  const setTeamId = (id) => { setTeamIdState(id); writeTeam(actor.id, id); };
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
  const team = teams.get(teamId);
  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const outgoing = deps.filter((d) => d.requesterTeamId === teamId);
  const incoming = deps.filter((d) => d.providerTeamId === teamId);
  const followOk = (epicId) => !(agreed && followOnly) || followed.has(epicId);
  const inFilter = (d) => (!filter || normAsk(d.response) === filter) && followOk(d.epicId);
  const rankOf = (d) => planFor(state, d.epicId, quarter.id)?.rank ?? 1e9;
  // Generic sorting (D99) on both lists; the default order is the rank of the epic.
  const sortOut = useTableSort('afhankelijkheden-wij', actor.id);
  const sortIn = useTableSort('afhankelijkheden-ons', actor.id);
  const accessors = (teamOf) => ({ ask: (d) => d.ask, team: (d) => teams.get(teamOf(d))?.name, size: (d) => (d.effortHigh > 0 ? Number(d.effortHigh) : null), answer: (d) => ASK_SEVERITY[normAsk(d.response)] });
  const byRank = (a, b) => rankOf(a) - rankOf(b) || a.createdAt.localeCompare(b.createdAt);
  const incomingSorted = sortIn.apply([...incoming].filter(inFilter).sort(byRank), accessors((d) => d.requesterTeamId));
  const outgoingSorted = sortOut.apply([...outgoing].filter(inFilter).sort(byRank), accessors((d) => d.providerTeamId));
  const ourPlans = state.plans.filter((p) => p.quarterId === quarter.id && epics.get(p.epicId)?.teamId === teamId && followOk(p.epicId)).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const followedInQuarter = state.plans.filter((p) => p.quarterId === quarter.id && followed.has(p.epicId)).length;
  const withoutAsks = ourPlans.filter((p) => !outgoing.some((d) => d.epicId === p.epicId));
  const mayWrite = canWriteTeam(actor, teamId) && quarter.phase !== 'closed'; // capacity
  // Asks and answers are fixed once the plan is locked (item J, D83): Afgestemd is read-only.
  const mayAsk = mayWrite && phaseAllows(quarter.phase, 'ask');
  const answersOpen = phaseAllows(quarter.phase, 'answer');
  const mayAnswer = mayWrite && answersOpen;
  const locked = isLockedPhase(quarter.phase);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  // Release B (L3): own work + committed asks against the calendar-based capacity (domain/capacity.js).
  const capacity = teamCapacity(state, teamId, quarter.id);

  return (
    <div data-tour="dependencies">
      <ViewHeader title={t(agreed ? 'Agreed' : 'Dependencies')} meta={quarterMeta(quarter, t)} right={
        <label className="flex items-center gap-2.5 text-label text-muted w-full sm:w-auto"><span className="whitespace-nowrap">{t('Choose team')}</span>
          <select className={`${cls.input} !h-10 sm:!w-60 text-subtitle font-medium text-ink`} value={teamId} onChange={(e) => { setTeamId(e.target.value); setFilter(null); }} data-tour="team-select">{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </label>
      } />
      <TeamBlock team={team} cap={capacity} agreed={agreed} onEdit={mayWrite ? () => setCapDialog(true) : undefined} />
      {agreed && (
        <div className="mt-3 min-h-9 px-3 py-1.5 rounded-control bg-surface-2 text-label text-muted flex items-center gap-2">
          <Lock size={14} aria-hidden="true" className="shrink-0" />
          <span>{quarter.lockedAt ? t('Agreed on {d}', { d: fmtDay(quarter.lockedAt, t.lang) }) : t('Agreed')} · {t('read-only')}</span>
        </div>
      )}
      {/* Below xl: two tabs. From xl (section 24, D77): both directions side by side, each with its own heading, count and chips. */}
      <div className="xl:hidden mt-5"><Tabs ariaLabel={t('Direction')} value={tab} onChange={(v) => { setTab(v); setFilter(null); }} items={[{ id: 'outgoing', label: t('We ask'), count: outgoing.length }, { id: 'incoming', label: t('Asked of us'), count: incoming.length }]} /></div>
      <ErrorLine error={err} />

      <div className="mt-4 flex items-center gap-3 flex-wrap empty:hidden">
        <div className="xl:hidden"><CountChips deps={tab === 'outgoing' ? outgoing : incoming} value={filter} onChange={setFilter} /></div>
        {agreed && <FollowOnlyToggle on={followOnly} onChange={setFollowOnly} count={followedInQuarter} />}
      </div>

      <div className="xl:grid xl:grid-cols-2 xl:gap-6 xl:items-start xl:mt-5">
        <section className={tab === 'outgoing' ? '' : 'hidden xl:block'} aria-label={t('We ask')}>
          <ColumnHead label={t('We ask')} deps={outgoing} filter={filter} onFilter={setFilter} />
          <div className="mt-4" data-tour="outgoing">
            {ourPlans.length === 0 ? <div className={cls.card}><EmptyLine>{t(agreed && followOnly ? 'No followed epics here.' : 'No epics for this team in this quarter.')}</EmptyLine></div> : (
              <ul className={`${cls.card} divide-y divide-border overflow-hidden`}>
                <ListHead sort={sortOut} teamLabel={t('To')} />
                {outgoingSorted.map((d) => <OutgoingRow key={d.id} dep={d} epic={epics.get(d.epicId)} rank={planFor(state, d.epicId, quarter.id)?.rank} team={teams.get(d.providerTeamId)} mayWrite={mayAsk} locked={locked} act={act} followed={followed.has(d.epicId)} onOpen={() => setOpenEpic(d.epicId)} />)}
                {outgoingSorted.length === 0 && <li><EmptyLine>{t(agreed && followOnly ? 'No followed epics here.' : 'Nothing here.')}</EmptyLine></li>}
                {mayAsk && <AddAskRow plans={ourPlans} epics={epics} locked={locked} act={act} />}
              </ul>
            )}
            {withoutAsks.length > 0 && !filter && (
              <Disclosure className="px-1 mt-3" summary={withoutAsks.length === 1 ? t('1 epic without asks') : t('{n} epics without asks', { n: withoutAsks.length })}>
                <ul className={`${cls.card} divide-y divide-border overflow-hidden`}>
                  {withoutAsks.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 min-h-10 py-1.5">
                      <RankNo rank={p.rank} hash />
                      <button className="min-w-0 flex-1 text-left text-body text-muted truncate hover:underline focus-ring rounded-control" onClick={() => setOpenEpic(p.epicId)}>{epics.get(p.epicId)?.title}<FollowStar on={followed.has(p.epicId)} className="inline ml-1.5 -mt-0.5" /></button>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>
        </section>

        <section className={tab === 'incoming' ? '' : 'hidden xl:block'} aria-label={t('Asked of us')}>
          <ColumnHead label={t('Asked of us')} deps={incoming} filter={filter} onFilter={setFilter} />
          <div className="mt-4" data-tour="incoming">
            {!answersOpen && !agreed && incoming.length > 0 && <p className="text-caption text-muted mb-2">{t('Answers open from Negotiate.')}</p>}
            {incoming.length === 0 ? <div className={cls.card}><EmptyLine>{t('Nothing asked of this team.')}</EmptyLine></div> : (
              <ul className={`${cls.card} divide-y divide-border overflow-hidden`}>
                <ListHead sort={sortIn} teamLabel={t('From')} />
                {incomingSorted.map((d) => <IncomingRow key={d.id} dep={d} epic={epics.get(d.epicId)} rank={planFor(state, d.epicId, quarter.id)?.rank} team={teams.get(d.requesterTeamId)} mayAnswer={mayAnswer} act={act} followed={followed.has(d.epicId)} onOpen={() => setOpenEpic(d.epicId)} />)}
                {incomingSorted.length === 0 && <li><EmptyLine>{t(agreed && followOnly ? 'No followed epics here.' : 'Nothing here.')}</EmptyLine></li>}
              </ul>
            )}
          </div>
        </section>
      </div>
      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {capDialog && <CapacityDialog teamId={teamId} team={team} cap={capacity.cap} locked={locked} act={act} onClose={() => setCapDialog(false)} />}
    </div>
  );
}

// One team block (D86, Optie 1): "Team <naam>", a Capaciteit chip tinted by the load band, the percentage, a bar with
// the 80% marker and one line "38 van 56 pw toegezegd · run 20% · 1 vacature". Planning says "gevraagd".
const BAND_TONE = { ok: 'ok', warn: 'warn', over: 'danger', none: 'neutral' };
const BAND_BAR = { ok: 'bg-accent', warn: 'bg-warn', over: 'bg-danger', none: 'bg-faint' };
const BAND_TOP = { ok: 'border-t-ok', warn: 'border-t-warn', over: 'border-t-danger', none: 'border-t-border-strong' };
const fmtPw1 = (n, lang) => (Math.round(n * 10) / 10).toString().replace('.', lang === 'nl' ? ',' : '.');
function TeamBlock({ team, cap, agreed, onEdit }) {
  const t = useT();
  const band = cap.cap ? cap.band : 'none';
  const pct = Math.min(100, Math.max(0, cap.pct || 0));
  const edit = onEdit && <button type="button" className={cls.icon} onClick={onEdit} aria-label={t('Edit capacity')} title={t('Edit capacity')}><Pencil size={14} /></button>;
  return (
    <section className={`${cls.card} border-t-[3px] ${BAND_TOP[band]} px-5 py-4`} aria-label={`${t('Team')} ${team?.name || ''}`} data-tour="team-capacity">
      <div className="flex items-baseline gap-x-3.5 gap-y-1 flex-wrap">
        <h2 className="text-hero text-ink leading-none">{t('Team')} {team?.name}</h2>
        <span className={`inline-flex items-center h-6 px-2 rounded-control text-caption font-semibold ${toneClass(BAND_TONE[band])}`}>{t('Capacity')}</span>
        {!cap.cap && <span className="ml-auto">{onEdit ? <button type="button" className={cls.ghost} onClick={onEdit}>{t('Fill in capacity')}</button> : <span className="text-label text-muted">–</span>}</span>}
      </div>
      {cap.cap && (
        <div className="mt-3.5 flex items-center gap-4 flex-wrap">
          <span className="text-[28px] leading-none font-medium tnum text-ink">{cap.pct}%</span>
          <div className="flex-1 basis-[280px] max-w-[520px] min-w-0">
            <div aria-hidden="true" className="relative h-2 bg-surface-2 rounded-control">
              <div className={`absolute left-0 top-0 bottom-0 rounded-control ${BAND_BAR[band]}`} style={{ width: `${pct}%` }} />
              <div className="absolute top-[-4px] bottom-[-4px] border-l-2 border-ink" style={{ left: '80%' }} />
            </div>
            <div className="mt-1.5 flex justify-between gap-3 flex-wrap text-caption text-muted tnum">
              <span>
                {t(agreed ? '{a} of {b} pw committed' : '{a} of {b} pw requested', { a: fmtPw1(cap.requested, t.lang), b: fmtPw1(cap.available, t.lang) })}
                {' · '}{t('run')} {cap.reservePct}%
                {cap.fteVacant > 0 && <> · {cap.fteVacant === 1 ? t('1 vacancy') : t('{n} vacancies', { n: fmtPw1(cap.fteVacant, t.lang) })}</>}
              </span>
              <span>{t('tight from 80%')}</span>
            </div>
          </div>
          {edit}
        </div>
      )}
    </section>
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
    <div className="hidden xl:flex items-center gap-3 h-10 border-b border-ink">
      <h2 className="inline-flex items-center gap-2 text-subtitle text-ink">{label}<span className="tnum">{deps.length}</span></h2>
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

// One row structure for both columns (D91): #rank · ask (+ "low certainty") · "Aan|Van Team · voor Epic" · size cell ·
// `right`. `team` is the provider in "Wij vragen" ("Aan <team>") and the requester in "Aan ons gevraagd" ("Van <team>").
function AskRow({ dep, epic, rank, team, direction, followed, onOpen, right, below }) {
  const { state, quarter } = usePlan();
  const t = useT();
  const labelId = `ask-${dep.id}`;
  return (
    <li className="group px-3 py-2 rounded-row">
      <div className="flex items-center gap-x-3 gap-y-1.5 min-h-9 flex-wrap">
        <RankNo rank={rank} hash />
        <div className="flex-1 min-w-[220px]">
          <div id={labelId} className="text-body font-medium">{dep.ask}{dep.certainty === 'low' && <span className="text-caption text-faint font-normal"> · {t('low certainty')}</span>}</div>
          <div className="text-caption text-muted">{t(direction === 'outgoing' ? 'To' : 'From')} <span className="font-semibold text-ink-2">{team?.name}</span> · {t('for')} <button className="hover:underline text-accent focus-ring rounded-control text-left" onClick={onOpen}>{epic?.title}</button><FollowStar on={followed} className="inline ml-1" /></div>
        </div>
        <PostLockMark dep={dep} quarter={quarter} />
        <div className="ml-auto flex items-center gap-3">
          <SizeCell size={dep.size} low={dep.effortLow} high={dep.effortHigh} settings={state.settings} />
          {right(labelId)}
        </div>
      </div>
      {below}
    </li>
  );
}
// Header row of an ask list (D99): # · Verzoek · Aan|Van · Maat · Antwoord, each a sort button; the chip when sorted.
function ListHead({ sort, teamLabel }) {
  const t = useT();
  const labels = { ask: t('Ask'), team: teamLabel, size: t('Size'), answer: t('Response') };
  return (
    <li className="px-3 bg-surface-2 text-caption text-muted">
      <div className="flex items-center gap-x-3 min-h-9 flex-wrap">
        <span className="min-w-[34px] text-center font-medium">#</span>
        <span className="flex-1 min-w-[220px] inline-flex items-center gap-3"><SortButton col="ask" label={labels.ask} sort={sort.sort} onToggle={sort.toggle} /><SortButton col="team" label={labels.team} sort={sort.sort} onToggle={sort.toggle} /></span>
        <span className="ml-auto flex items-center gap-3"><span className="w-[148px]"><SortButton col="size" label={labels.size} sort={sort.sort} onToggle={sort.toggle} /></span><span className="w-28"><SortButton col="answer" label={labels.answer} sort={sort.sort} onToggle={sort.toggle} /></span></span>
      </div>
      {sort.sort && <div className="pb-2"><SortedChip sort={sort.sort} labels={labels} onClear={sort.clear} /></div>}
    </li>
  );
}
const ChipCell = ({ response }) => <span className="w-28 shrink-0 inline-flex"><StatusChip response={response} /></span>;

// "Wij vragen": the answer chip, the provider's reason, and (while asks may change) a hover "remove" with a reason after lock.
function OutgoingRow({ dep, epic, rank, team, mayWrite, locked, act, followed, onOpen }) {
  const t = useT();
  const [removing, setRemoving] = useState(false);
  return (
    <AskRow dep={dep} epic={epic} rank={rank} team={team} direction="outgoing" followed={followed} onOpen={onOpen}
      right={() => (
        <>
          <ChipCell response={dep.response} />
          {mayWrite && !removing && <button className={`${cls.icon} opacity-0 group-hover:opacity-100 focus:opacity-100 transition-base`} aria-label={`${t('Remove ask')} ${dep.refCode}`} onClick={() => setRemoving(true)}><Trash2 size={14} /></button>}
        </>
      )}
      below={(
        <>
          {dep.responseReason && !removing && <p className="pl-[46px] text-label text-muted mt-0.5">{dep.responseReason}</p>}
          {removing && (
            <div className="pl-[46px] pt-1">
              {locked ? <InlineReason required saveLabel={t('Remove')} onSave={async (reason) => { const r = await act('deleteDependency', dep.id, reason); if (r.ok) setRemoving(false); }} onCancel={() => setRemoving(false)} />
                : <div className="flex items-center gap-2 text-label"><span className="text-muted">{t('Remove?')}</span><button className={cls.secondary} onClick={async () => { const r = await act('deleteDependency', dep.id, ''); if (r.ok) setRemoving(false); }}>{t('Yes')}</button><button className={cls.secondary} onClick={() => setRemoving(false)}>{t('No')}</button></div>}
            </div>
          )}
        </>
      )} />
  );
}

// "Aan ons gevraagd": Toezeggen / Bespreken / Kan niet while answering is allowed, else the chip.
// Only "Kan niet" opens an inline reason (item 10); the other two answer in one click.
function IncomingRow({ dep, epic, rank, team, mayAnswer, act, followed, onOpen }) {
  const t = useT();
  const [reasonFor, setReasonFor] = useState(null); // response awaiting an inline reason
  const pick = async (response) => {
    if (response === dep.response) return;
    if (REASON_REQUIRED.has(response)) { setReasonFor(response); return; }
    setReasonFor(null);
    await act('answerDependency', dep.id, { response, reason: '' });
  };
  return (
    <AskRow dep={dep} epic={epic} rank={rank} team={team} direction="incoming" followed={followed} onOpen={onOpen}
      right={(labelId) => (
        <>
          {mayAnswer ? <AnswerControl value={dep.response} onPick={pick} labelledBy={labelId} /> : <ChipCell response={dep.response} />}
          {mayAnswer && (dep.response === 'partial' || dep.response === 'deferred') && <StatusChip response={dep.response} />}
        </>
      )}
      below={(
        <>
          {dep.responseReason && reasonFor == null && <p className="pl-[46px] text-label text-muted mt-0.5">{dep.responseReason}</p>}
          {reasonFor && (
            <div className="pl-[46px] pt-1">
              <InlineReason required defaultValue={dep.responseReason || ''} placeholder={t('What stands in the way?')}
                onSave={async (reason) => { const r = await act('answerDependency', dep.id, { response: reasonFor, reason }); if (r.ok) setReasonFor(null); }} onCancel={() => setReasonFor(null)} />
            </div>
          )}
        </>
      )} />
  );
}

// Last row of "Wij vragen": "+ Verzoek" opens the form with an epic picker (our plans by rank).
function AddAskRow({ plans, epics, locked, act }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  return (
    <li className="bg-surface-2">
      {adding ? <NewAskRow plans={plans} epics={epics} locked={locked} act={act} onDone={() => setAdding(false)} />
        : <div className="px-3 h-10 flex items-center"><button className={cls.ghost} onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />{t('Ask')}</button></div>}
    </li>
  );
}

// Release B (L1/L4): size picker writes the mapped range; without a size the pw field stays; certainty next to it.
function NewAskRow({ plans, epics, locked, act, onDone }) {
  const { state, quarter } = usePlan();
  const t = useT();
  const [epicId, setEpicId] = useState(plans[0]?.epicId || '');
  const epic = epics.get(epicId);
  const others = state.teams.filter((x) => x.id !== epic?.teamId);
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
    const r = await act('addDependency', { epicId, providerTeamId, quarterId: quarter.id, ask: ask.trim(), effortLow: pw, effortHigh: pw, size, certainty, reason });
    if (r.ok) onDone();
  };
  return (
    <form onSubmit={submit} className="px-3 py-2 flex items-center gap-2 flex-wrap anim-fade-in">
      <select className={`${cls.input} !w-56`} value={epicId} onChange={(e) => setEpicId(e.target.value)} aria-label={t('Epic')}>{plans.map((p) => <option key={p.id} value={p.epicId}>{p.rank != null ? `#${p.rank} · ` : ''}{epics.get(p.epicId)?.title}</option>)}</select>
      <select className={`${cls.input} !w-40`} value={providerTeamId} onChange={(e) => setProviderTeamId(e.target.value)} aria-label={t('Team we need')}>{others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input autoFocus className={`${cls.input} flex-1 min-w-[200px]`} placeholder={t('What do we need?')} aria-label={t('What do we need?')} value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }} />
      <SizePicker value={size} onPick={setSize} />
      {range ? <span className="text-caption text-muted tnum whitespace-nowrap">{range[0]}–{range[1]} pw</span>
        : <input type="number" min="0" step="0.5" className={`${cls.input} !w-20 tnum`} placeholder="pw" aria-label={t('Effort (pw)')} value={effort} onChange={(e) => setEffort(e.target.value)} />}
      <select className={`${cls.input} !w-auto`} value={certainty} onChange={(e) => setCertainty(e.target.value)} aria-label={t('Certainty')} title={t('Certainty')}>{CERTAINTIES.map((c) => <option key={c} value={c}>{t(CERTAINTY_META[c].label)}</option>)}</select>
      {locked && <input className={`${cls.input} !w-48`} placeholder={t('Why? (quarter is locked)')} aria-label={t('Why? (quarter is locked)')} value={reason} onChange={(e) => setReason(e.target.value)} />}
      <button type="submit" className={cls.primary} disabled={!ask.trim() || !epicId || !providerTeamId}>{t('Send')}</button>
      <button type="button" className={cls.secondary} onClick={onDone}>{t('Cancel')}</button>
    </form>
  );
}
