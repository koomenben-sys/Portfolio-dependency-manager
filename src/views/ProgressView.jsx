import React, { useEffect, useState } from 'react';
import { ChevronDown, Play, Check, OctagonX, Circle, TriangleAlert, FileText } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { isPlanner, canWriteTeam, canChangeImpediment } from '../data/repository';
import { byId, daysSince } from '../domain/plan';
import { inExecution, quarterWeek, newSinceLock, epicDeadline, weekOf, IMPEDIMENT_STATUS_META, depStand, epicStand, startWarning, lastChange, needsConfirmation, nextUpdateMoment, isEscalated, impedimentsOf, sizeRange, progressOf } from '../domain/rhythm';
import { effectiveMust } from '../domain/value';
import { followsOf, readFollowOnly, writeFollowOnly } from '../domain/follows';
import { useT } from '../i18n';
import { cls, ViewHeader, RankNo, StandChip, InlineReason, EmptyLine, ErrorLine, Dialog, Disclosure, FollowStar, FollowOnlyToggle, fmtDay, normAsk, Menu, menuItem, toneClass } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';

// Step 3 during Uitvoering — Voortgang V3 (docs/design.md section 28, D100-D105; acceptance Q). One block per epic in
// rank order (only epics with toezeggingen or impediments in the quarter): header with rank, title, team · eigenaar,
// a summary, a compact week timeline and the derived epic stand; under it one row per toezegging (ask, "Door <team> ·
// <maat>", stand chip, size warning, "Laatst gewijzigd", a "Melden" menu for the provider team) with its open
// impediments nested (actiehouder, days open, state, Escaleren / Opgelost). Teams report only Gestart · Klaar ·
// Impediment · Escaleren; Geblokkeerd and Geëscaleerd are derived. The title line shows "Week n van N · bijwerken vóór
// <dag> <tijd>" (Instellingen › Ritme); in "elke periode bevestigen" mode an untouched toezegging shows "Bevestigen".
const teamKey = (actorId) => `kp.progressTeam.${actorId}`;
const readTeam = (actorId) => { try { return localStorage.getItem(teamKey(actorId)); } catch { return null; } };
const writeTeam = (actorId, teamId) => { try { localStorage.setItem(teamKey(actorId), teamId); } catch { /* private mode */ } };
// Column templates (desktop): header row and ask rows share the 52px rank gutter and the flexible title column.
const HEAD_COLS = 'md:grid-cols-[52px_minmax(0,1fr)_170px_minmax(160px,230px)_150px_40px]';
const ASK_COLS = 'md:grid-cols-[52px_minmax(0,1fr)_150px_150px_150px_110px]';
const IMP_COLS = 'md:grid-cols-[24px_minmax(0,1fr)_190px_150px_150px]';
const LINE_TONE = { not_started: 'bg-border-strong', started: 'bg-accent', blocked: 'bg-warn', escalated: 'bg-danger', done: 'bg-ok' };
const fmtMoment = (d, lang) => `${d.toLocaleDateString(lang === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short' }).replace('.', '')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function ProgressView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  const [raising, setRaising] = useState(null); // { dep } | { epicId }
  const [err, setErr] = useState(null);
  const [followOnly, setFollowOnlyState] = useState(() => readFollowOnly(actor.id));
  useEffect(() => { setFollowOnlyState(readFollowOnly(actor.id)); }, [actor.id]);
  // Team filter (D94): remembered per person on this device; a planner starts on the own team, everyone else on "Alle teams".
  const pickTeam = () => { const saved = readTeam(actor.id); return saved != null && (saved === '' || state.teams.some((x) => x.id === saved)) ? saved : (actor.teamId || ''); };
  const [teamId, setTeamIdState] = useState(pickTeam);
  useEffect(() => { setTeamIdState(pickTeam()); }, [actor.id]);
  const setTeamId = (id) => { setTeamIdState(id); writeTeam(actor.id, id); };
  if (!quarter) return <NoQuarter />;
  const epics = byId(state.epics); const teams = byId(state.teams); const themes = byId(state.themes);
  const followed = followsOf(state, actor.id);
  const setFollowOnly = (on) => { setFollowOnlyState(on); writeFollowOnly(actor.id, on); };
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const executing = inExecution(quarter.phase);
  const { week, total } = quarterWeek(quarter, state.settings);
  const mustOf = (e) => effectiveMust(e, themes.get(e.themeId));

  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const committed = deps.filter((d) => normAsk(d.response) === 'accepted');
  const stands = new Map(committed.map((d) => [d.id, depStand(state, d)]));
  const count = (pred) => committed.filter((d) => pred(stands.get(d.id))).length;
  const started = count((s) => s !== 'not_started'); const blocked = count((s) => s === 'blocked'); const escalated = count((s) => s === 'escalated');

  const plans = state.plans.filter((p) => p.quarterId === quarter.id).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const blocks = plans.map((p) => {
    const epic = epics.get(p.epicId); if (!epic) return null;
    const asks = committed.filter((d) => d.epicId === p.epicId);
    const es = epicStand(state, p.epicId, quarter.id);
    const inTeam = !teamId || epic.teamId === teamId || asks.some((d) => d.providerTeamId === teamId);
    if (!inTeam || (followOnly && !followed.has(p.epicId))) return null;
    if (!asks.length && !es.impediments.length && !es.override) return null;
    return { plan: p, epic, asks: teamId ? asks.filter((d) => d.providerTeamId === teamId || epic.teamId === teamId) : asks, es };
  }).filter(Boolean);
  const fresh = newSinceLock(state, quarter).filter((p) => !followOnly || followed.has(p.epicId));
  const followedInQuarter = plans.filter((p) => followed.has(p.epicId)).length;
  const meta = `${t('Week {w} of {n}', { w: week, n: total })} · ${t('update before {d}', { d: fmtMoment(nextUpdateMoment(state.settings), t.lang) })}`;
  const title = (epicId, className = '') => {
    const e = epics.get(epicId);
    return <button className={`text-left hover:underline focus-ring rounded-control truncate max-w-full ${className}`} onClick={() => setOpenEpic(epicId)}>{e?.title}<FollowStar on={followed.has(epicId)} className="inline ml-1.5 -mt-0.5" /></button>;
  };

  return (
    <div data-tour="progress">
      <ViewHeader title={t('Progress')} meta={meta} right={
        <>
          <span className="text-label text-muted tnum whitespace-nowrap" data-tour="progress-line">
            {t('Started')} <b className="text-ink font-semibold">{started}/{committed.length}</b>
            <span className="text-faint"> · </span>{t('Blocked')} <b className={`font-semibold ${blocked ? 'text-warn-fg' : 'text-ink'}`}>{blocked}</b>
            <span className="text-faint"> · </span>{t('Escalated')} <b className={`font-semibold ${escalated ? 'text-danger-fg' : 'text-ink'}`}>{escalated}</b>
          </span>
          <FollowOnlyToggle on={followOnly} onChange={setFollowOnly} count={followedInQuarter} />
          <label className="flex items-center gap-2.5 text-label text-muted w-full sm:w-auto"><span className="sr-only">{t('Choose team')}</span>
            <select className={`${cls.input} !h-10 sm:!w-56 text-subtitle font-medium text-ink`} value={teamId} onChange={(e) => setTeamId(e.target.value)} data-tour="team-select" aria-label={t('Choose team')}>
              <option value="">{t('All teams')}</option>
              {state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </>
      } />
      <ErrorLine error={err} />

      {blocks.length === 0 && <div className={`${cls.card} mb-6`}><EmptyLine>{followOnly && followedInQuarter === 0 ? t('No followed epics here.') : t('Nothing to report.')}</EmptyLine></div>}

      <div className="space-y-3.5" data-tour="epic-blocks">
        {blocks.map(({ plan, epic, asks, es }) => (
          <EpicBlock key={plan.id} plan={plan} epic={epic} asks={asks} es={es} stands={stands} week={week} total={total} mustOf={mustOf} title={title}
            executing={executing} act={act} onRaise={setRaising} />
        ))}
      </div>

      {fresh.length > 0 && (
        <section className="mt-6" aria-label={t('New unplanned work')} data-tour="new-since-lock">
          <Disclosure summary={<>{t('New unplanned work')} <span className="tnum">({fresh.length})</span></>}>
            <ul className={`${cls.card} divide-y divide-border`}>
              {fresh.map((p) => { const e = epics.get(p.epicId); return (
                <li key={p.id} className="flex items-center gap-3 px-3 h-row text-body min-w-0">
                  <RankNo rank={p.rank} hash /><span className="min-w-0 flex-1 font-medium truncate">{title(p.epicId)}</span>
                  <span className="text-label text-muted truncate hidden sm:inline">{teams.get(e?.teamId)?.name}{e?.ownerName ? ` · ${e.ownerName}` : ''}</span>
                  <span className="text-label text-muted tnum whitespace-nowrap">{fmtDay(p.createdAt, t.lang)}</span>
                </li>
              ); })}
            </ul>
          </Disclosure>
        </section>
      )}

      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {raising && <ImpedimentDialog dep={raising.dep} epicId={raising.epicId} onClose={() => setRaising(null)} />}
    </div>
  );
}

// One epic: header (rank · title, team · eigenaar · summary · timeline · stand chip · epic menu) and its ask rows.
function EpicBlock({ plan, epic, asks, es, stands, week, total, mustOf, title, executing, act, onRaise }) {
  const { state, actor, quarter } = usePlan();
  const t = useT();
  const teams = byId(state.teams);
  const parts = [];
  if (es.total) parts.push(es.done === es.total ? `${es.done}/${es.total} ${t('Done').toLowerCase()}` : `${es.started}/${es.total} ${t('Started').toLowerCase()}`);
  const bl = es.blocked + es.impediments.filter((i) => !i.escalatedAt).length; const esc = es.impediments.filter((i) => i.escalatedAt).length + es.deps.filter((d) => stands.get(d.id) === 'escalated').length;
  if (esc) parts.push(`${esc} ${t('Escalated').toLowerCase()}`); else if (bl) parts.push(`${bl} ${t('Blocked').toLowerCase()}`);
  const mayEpic = executing && canWriteTeam(actor, epic.teamId);
  // Timeline (D101): start = earliest started week; end = deadline week (Klaar: the week it was finished); not started:
  // a dashed stretch from now over the largest upper size among the open asks; the deadline cell gets a dark border.
  const dl = epicDeadline(state, epic.id, quarter, mustOf);
  const dlWeek = weekOf(dl.date, quarter, state.settings);
  const startWeeks = es.deps.filter((d) => progressOf(d) !== 'not_started' && d.startedWeek).map((d) => d.startedWeek);
  const overrideAt = es.override ? lastChange(state, 'plans', plan.id)?.at : null;
  if (!startWeeks.length && overrideAt) startWeeks.push(weekOf(overrideAt, quarter, state.settings));
  const start = startWeeks.length ? Math.min(...startWeeks) : null;
  let end = Math.max(dlWeek, start ?? 1);
  if (es.stand === 'done') { const doneAt = es.deps.map((d) => d.doneAt).filter(Boolean).sort().pop() || overrideAt; end = doneAt ? weekOf(doneAt, quarter, state.settings) : week; }
  const upper = Math.max(0, ...es.deps.filter((d) => stands.get(d.id) === 'not_started').map((d) => (d.size ? sizeRange(state.settings, d.size)?.[1] : d.effortHigh) || 0));
  const ghost = start == null ? [week, Math.min(total, week + Math.max(1, Math.ceil(upper)) - 1)] : null;
  return (
    <section className={cls.card} aria-label={epic.title}>
      <div className={`grid grid-cols-[44px_minmax(0,1fr)_auto] ${HEAD_COLS} gap-x-3.5 gap-y-1.5 items-center px-3.5 py-3 bg-surface-2 border-b border-border`}>
        <RankNo rank={plan.rank} hash />
        <div className="min-w-0">
          <div className="text-body font-semibold truncate">{title(epic.id)}</div>
          <div className="text-caption text-muted truncate">{teams.get(epic.teamId)?.name}{epic.ownerName ? ` · ${t('Owner').toLowerCase()} ${epic.ownerName}` : ''}</div>
        </div>
        <span className="hidden md:block text-label text-muted tnum truncate">{parts.join(' · ')}</span>
        <WeekLine total={total} week={week} start={start} end={end} ghost={ghost} deadline={dlWeek} tone={es.stand} className="hidden md:grid" />
        <span className="col-start-2 justify-self-start md:col-auto"><StandChip stand={es.stand} /></span>
        <span className="justify-self-end col-start-3 row-start-1 md:col-auto md:row-auto">
          {mayEpic && (
            <Menu ariaLabel={t('Report')} width="w-56" button={({ ref, toggle, ...a }) => <button ref={ref} onClick={toggle} {...a} className={`${cls.icon} w-8 h-8`} aria-label={`${t('Report')}: ${epic.title}`} title={t('Report')}><ChevronDown size={14} /></button>}>
              <button role="menuitem" data-close className={menuItem} disabled={es.stand !== 'not_started'} onClick={() => act('setEpicProgress', plan.id, 'started')}><Play size={14} aria-hidden="true" />{t('Started')}</button>
              <button role="menuitem" data-close className={menuItem} disabled={es.stand === 'done'} onClick={() => act('setEpicProgress', plan.id, 'done')}><Check size={14} aria-hidden="true" />{t('Done')}</button>
              <button role="menuitem" data-close className={menuItem} onClick={() => onRaise({ epicId: epic.id })}><OctagonX size={14} aria-hidden="true" />{t('Report impediment')}</button>
              {es.override && <button role="menuitem" data-close className={`${menuItem} text-muted`} onClick={() => act('setEpicProgress', plan.id, null)}><Circle size={14} aria-hidden="true" />{t('Back to derived')}</button>}
            </Menu>
          )}
        </span>
      </div>
      <div className="divide-y divide-border">
        {asks.map((d) => <AskRow key={d.id} dep={d} epic={epic} stand={stands.get(d.id)} executing={executing} mustOf={mustOf} act={act} onRaise={onRaise} />)}
        {es.impediments.map((imp) => <ImpedimentRow key={imp.id} imp={imp} epic={epic} executing={executing} act={act} />)}
      </div>
    </section>
  );
}

// Compact 13-week line: filled cells start→end (dashed when not started), a dark border on the deadline week, a line at now.
function WeekLine({ total, week, start, end, ghost, deadline, tone, className = '' }) {
  const t = useT();
  const cells = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <span className={`relative gap-0.5 h-3.5 ${className}`} style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} role="img" aria-label={`${t('Week {w} of {n}', { w: week, n: total })} · ${t('deadline')} wk ${deadline}`}>
      {cells.map((w) => {
        const filled = start != null && w >= start && w <= end;
        const dashed = ghost && w >= ghost[0] && w <= ghost[1];
        return <span key={w} className={`box-border rounded-[1px] ${filled ? LINE_TONE[tone] || LINE_TONE.started : dashed ? 'border border-dashed border-border-strong' : 'bg-border'} ${w === deadline ? 'outline outline-2 outline-ink -outline-offset-1' : ''}`} />;
      })}
      <span aria-hidden="true" className="absolute -top-1 -bottom-1 border-l-2 border-ink" style={{ left: `calc(${((week - 1) / total) * 100}% + 1px)` }} />
    </span>
  );
}

// One toezegging: ask · "Door <team> · <maat>" · stand · warning · laatst gewijzigd · Melden (provider team / admin).
function AskRow({ dep, epic, stand, executing, mustOf, act, onRaise }) {
  const { state, actor, quarter } = usePlan();
  const t = useT();
  const teams = byId(state.teams);
  const may = executing && canWriteTeam(actor, dep.providerTeamId);
  const warn = startWarning(state, dep, quarter, mustOf);
  const last = lastChange(state, 'dependencies', dep.id);
  const confirmDue = may && needsConfirmation(state, dep, quarter);
  const progress = progressOf(dep);
  const imps = impedimentsOf(state, { depId: dep.id });
  return (
    <div>
      <div className={`grid grid-cols-[minmax(0,1fr)_auto] ${ASK_COLS} gap-x-3.5 gap-y-1.5 items-center px-3.5 py-2.5`}>
        <span aria-hidden="true" className="hidden md:block" />
        <div className="min-w-0">
          <div className="text-body truncate" title={dep.ask}>{dep.ask}</div>
          <div className="text-caption text-muted truncate">{t('By')} <b className="font-semibold text-ink">{teams.get(dep.providerTeamId)?.name}</b>{dep.size ? ` · ${dep.size}` : dep.effortHigh ? ` · ${dep.effortLow}–${dep.effortHigh} pw` : ''}</div>
        </div>
        <span className="col-span-2 md:col-auto flex items-center gap-2 min-w-0"><StandChip stand={stand} week={dep.startedWeek} /></span>
        <span className={`hidden md:block text-caption font-semibold tnum ${warn ? 'text-warn-fg' : ''}`}>{warn ? `⚠ ${warn.size} · ${t('{n} wk to deadline', { n: warn.weeks })}` : ''}</span>
        <span className="hidden md:block text-caption text-muted min-w-0 truncate" title={last ? `${fmtDay(last.at, t.lang)} · ${last.name}` : undefined}>
          {last ? <><span className="block text-ink tnum">{fmtDay(last.at, t.lang)}</span>{last.name}</> : <span className="text-faint">–</span>}
        </span>
        <span className="justify-self-end col-start-2 row-start-1 md:col-auto md:row-auto flex items-center gap-1">
          {confirmDue && <button type="button" className={cls.quiet} onClick={() => act('confirmProgress', dep.id)} title={t('Still as it is')}>{t('Confirm')}</button>}
          {may && (
            <Menu ariaLabel={t('Report')} width="w-56" button={({ ref, toggle, ...a }) => <button ref={ref} onClick={toggle} {...a} className={`${cls.secondary} !text-accent !border-accent`}>{t('Report')}<ChevronDown size={13} aria-hidden="true" /></button>}>
              <button role="menuitem" data-close className={menuItem} disabled={progress !== 'not_started'} onClick={() => act('setProgress', dep.id, 'started')}><Play size={14} aria-hidden="true" />{t('Started')}</button>
              <button role="menuitem" data-close className={menuItem} disabled={progress === 'done'} onClick={() => act('setProgress', dep.id, 'done')}><Check size={14} aria-hidden="true" />{t('Done')}</button>
              <button role="menuitem" data-close className={menuItem} onClick={() => onRaise({ dep })}><OctagonX size={14} aria-hidden="true" />{t('Report impediment')}</button>
              {progress !== 'not_started' && <button role="menuitem" data-close className={`${menuItem} text-muted`} onClick={() => act('setProgress', dep.id, 'not_started')}><Circle size={14} aria-hidden="true" />{t('Not started')}</button>}
            </Menu>
          )}
        </span>
        {warn && <span className="md:hidden col-span-2 text-caption font-semibold text-warn-fg tnum">⚠ {warn.size} · {t('{n} wk to deadline', { n: warn.weeks })}</span>}
      </div>
      {imps.map((imp) => <ImpedimentRow key={imp.id} imp={imp} epic={epic} executing={executing} act={act} nested />)}
    </div>
  );
}

// Nested impediment: ⛔ title · "Actiehouder <naam> · n d open" · state (Open / In behandeling / Geëscaleerd → <aan wie>,
// plus the "Escalatie" age hint, D93) · laatst gewijzigd · Escaleren / Opgelost for whoever may change the status.
function ImpedimentRow({ imp, epic, executing, act, nested = false }) {
  const { state, actor } = usePlan();
  const t = useT();
  const [escalating, setEscalating] = useState(false);
  const may = executing && canChangeImpediment(actor, imp, epic);
  const days = daysSince(imp.raisedAt);
  const manual = !!imp.escalatedAt;
  const hint = !manual && isEscalated(imp, state.settings);
  const tone = manual ? 'danger' : 'warn';
  const last = lastChange(state, 'impediments', imp.id);
  return (
    <div className={`${nested ? 'mx-3.5 mb-2.5 md:ml-20' : 'mx-3.5 my-2.5'} px-3 py-2 border-l-[3px] ${manual ? 'border-danger bg-danger-bg/40' : 'border-warn bg-warn-bg/40'}`}>
      <div className={`grid grid-cols-[24px_minmax(0,1fr)] ${IMP_COLS} gap-x-3.5 gap-y-1 items-center`}>
        <OctagonX size={14} strokeWidth={2.25} className={manual ? 'text-danger' : 'text-warn'} aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-body font-semibold truncate" title={imp.title}>{imp.title}</div>
          <div className="text-caption text-muted truncate">{t('Action holder')} {imp.actionOwnerName || <span className="text-faint">–</span>} · {t('{n} d open', { n: days })}</div>
        </div>
        <span className={`col-start-2 md:col-auto text-caption font-semibold ${manual ? 'text-danger-fg' : 'text-warn-fg'} flex items-center gap-1.5 flex-wrap`}>
          {manual ? <>{t('Escalated')}{imp.escalatedTo ? ` → ${imp.escalatedTo}` : ''}</> : t(IMPEDIMENT_STATUS_META[imp.status]?.label || 'Open')}
          {hint && <span className={`inline-flex items-center gap-1 rounded-full px-1.5 h-5 text-micro font-semibold ${toneClass('danger')}`}><TriangleAlert size={11} aria-hidden="true" />{t('Escalation')}</span>}
        </span>
        <span className="hidden md:block text-caption text-muted tnum truncate">{last ? `${fmtDay(last.at, t.lang)} · ${last.name}` : ''}</span>
        <span className="justify-self-end col-span-2 md:col-span-1 flex items-center gap-1">
          {may && !manual && !escalating && <button type="button" className={`${cls.secondary} !text-danger-fg !border-danger-border`} onClick={() => setEscalating(true)}>{t('Escalate')}</button>}
          {may && <button type="button" className={cls.secondary} onClick={() => act('setImpedimentStatus', imp.id, 'resolved')}>{t('Resolved')}</button>}
        </span>
      </div>
      {escalating && (
        <div className="mt-1.5 md:pl-9">
          <InlineReason placeholder={t('To whom? e.g. Directie')} saveLabel={t('Escalate')} onSave={async (to) => { const r = await act('escalateImpediment', imp.id, to); if (r.ok) setEscalating(false); }} onCancel={() => setEscalating(false)} />
        </div>
      )}
    </div>
  );
}

// "Impediment melden" from a toezegging (fixed epic + ask) or from an epic (epic preselected): title, action holder.
function ImpedimentDialog({ dep, epicId, onClose }) {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const epics = byId(state.epics); const teams = byId(state.teams);
  const plans = state.plans.filter((p) => p.quarterId === quarter.id).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const [title, setTitle] = useState('');
  const [epic, setEpic] = useState(dep?.epicId || epicId || plans[0]?.epicId || '');
  const [holder, setHolder] = useState('');
  const [err, setErr] = useState(null);
  const members = state.members || [];
  if (!isPlanner(actor)) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErr('Title is required');
    const holderName = holder.trim();
    const patch = { kind: 'impediment', title: title.trim(), epicId: epic, depId: dep?.id || null, actionOwnerName: holderName, actionOwnerId: members.find((x) => x.name === holderName)?.id || null };
    const r = await run('upsertImpediment', patch);
    if (!r.ok) return setErr(r.error);
    return onClose();
  };
  return (
    <Dialog title={t('Report impediment')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {dep ? <p className="text-label text-muted truncate">{epics.get(dep.epicId)?.title} · {dep.ask} · {teams.get(dep.providerTeamId)?.name}</p> : (
          <label className="block"><span className={cls.label}>{t('Epic')}</span>
            <select className={cls.input} value={epic} onChange={(e) => setEpic(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.epicId}>{p.rank != null ? `${p.rank} · ` : ''}{epics.get(p.epicId)?.title}</option>)}
            </select>
          </label>
        )}
        <label className="block"><span className={cls.label}>{t('Title')}</span><input className={cls.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('What is blocking?')} /></label>
        <label className="block"><span className={cls.label}>{t('Action holder')}</span><input className={cls.input} value={holder} list="kp-members" onChange={(e) => setHolder(e.target.value)} /></label>
        <datalist id="kp-members">{members.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        <ErrorLine error={err} />
        <div className="flex justify-end gap-2 pt-1"><button type="button" className={cls.secondary} onClick={onClose}>{t('Cancel')}</button><button type="submit" className={cls.primary} disabled={!epic && !dep}>{t('Save')}</button></div>
      </form>
    </Dialog>
  );
}

