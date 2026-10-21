import React, { useEffect, useState } from 'react';
import { Plus, Lock, Pencil, TriangleAlert } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { isPlanner, isAdmin, canWriteTeam, canChangeImpediment } from '../data/repository';
import { planFor, byId, daysSince } from '../domain/plan';
import { hasSignal, inExecution, quarterWeek, openImpediments, signalOf, needsConfirmation, isEscalated, newSinceLock, epicDeadline, weekOf, SIGNAL_META, IMPEDIMENT_STATUSES, IMPEDIMENT_STATUS_META } from '../domain/rhythm';
import { effectiveMust } from '../domain/value';
import { followsOf, readFollowOnly, writeFollowOnly } from '../domain/follows';
import { useT } from '../i18n';
import { cls, ViewHeader, quarterMeta, RankNo, SignalChip, SignalControl, InlineReason, EmptyLine, ErrorLine, Dialog, Disclosure, FollowStar, FollowOnlyToggle, fmtDay, normAsk, toneClass } from '../components/plan/core';
import { CloseQuarterDialog } from '../components/plan/CycleActions';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';
import { useTableSort, SortTh, SortedChip } from '../components/plan/sort';

// Step 3 during Uitvoering — Voortgang (docs/design.md section 23, D65; acceptance M5). One top line, then sections
// that hide when empty: Deadline in gevaar (signals on committed asks), Impediments (not resolved, kind 'impediment'),
// Nieuw ongepland werk (epics added after the lock, D97), Onze toezeggingen. "Alleen gevolgd" filters them (M8).
// Section 27 (D94/D95): a "Team kiezen" select with "Alle teams" on the title row filters Deadline in gevaar,
// Impediments and Onze toezeggingen (admin / viewer: all teams; planner: own team). The three are tables with the
// same column template (# · … · Team · Signaal/Status · Toelichting/Actiehouder) so columns line up across sections.
// Admins close the quarter at the bottom (M7); the steps then switch and Resultaat opens.
const teamKey = (actorId) => `kp.progressTeam.${actorId}`;
const readTeam = (actorId) => { try { return localStorage.getItem(teamKey(actorId)); } catch { return null; } };
const writeTeam = (actorId, teamId) => { try { localStorage.setItem(teamKey(actorId), teamId); } catch { /* private mode */ } };
// One class per column, shared by every table on this screen (same widths as Prioriteiten where the column exists).
const TC = { rank: 'w-12 px-2 text-center', main: 'px-3 text-left', team: 'w-44 px-3 text-left', state: 'w-[376px] px-3 text-left', note: 'w-72 px-3 text-left' };
const TH = 'h-9 font-medium whitespace-nowrap';

export function ProgressView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  const [raising, setRaising] = useState(false);
  const [editing, setEditing] = useState(null); // impediment
  const [closing, setClosing] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // "Deadline in gevaar" row shown on the quarter bar (D96)
  // Generic sorting per table (D99); the default order is the rank (impediments: escalated first, then oldest).
  const sortRisk = useTableSort('voortgang-deadline', actor.id);
  const sortImp = useTableSort('voortgang-impediments', actor.id);
  const sortNew = useTableSort('voortgang-nieuw', actor.id);
  const sortOurs = useTableSort('voortgang-toezeggingen', actor.id);
  const [err, setErr] = useState(null);
  const [followOnly, setFollowOnlyState] = useState(() => readFollowOnly(actor.id));
  useEffect(() => { setFollowOnlyState(readFollowOnly(actor.id)); }, [actor.id]);
  // Team filter: remembered per person on this device; a planner starts on the own team, everyone else on "Alle teams".
  const pickTeam = () => { const saved = readTeam(actor.id); return saved != null && (saved === '' || state.teams.some((x) => x.id === saved)) ? saved : (actor.teamId || ''); };
  const [teamId, setTeamIdState] = useState(pickTeam);
  useEffect(() => { setTeamIdState(pickTeam()); }, [actor.id]);
  const setTeamId = (id) => { setTeamIdState(id); writeTeam(actor.id, id); };
  if (!quarter) return <NoQuarter />;
  const epics = byId(state.epics); const teams = byId(state.teams);
  const followed = followsOf(state, actor.id);
  const setFollowOnly = (on) => { setFollowOnlyState(on); writeFollowOnly(actor.id, on); };
  const keep = (epicId) => !followOnly || followed.has(epicId);
  const rankOf = (epicId) => planFor(state, epicId, quarter.id)?.rank ?? 1e9;
  const byRank = (a, b) => rankOf(a.epicId) - rankOf(b.epicId);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const teamOf = (epicId) => epics.get(epicId)?.teamId;
  const inTeam = (d) => !teamId || d.providerTeamId === teamId || teamOf(d.epicId) === teamId;

  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const atRiskAll = deps.filter(hasSignal);
  const impsAll = openImpediments(state, quarter.id);
  const epicTitle = (epicId) => epics.get(epicId)?.title;
  const teamName = (id) => teams.get(id)?.name;
  const sigOrder = (d) => SIGNAL_META[signalOf(d)].order;
  const atRisk = sortRisk.apply(atRiskAll.filter((d) => keep(d.epicId) && inTeam(d)).sort(byRank), { main: (d) => epicTitle(d.epicId), team: (d) => teamName(d.providerTeamId), state: sigOrder, note: (d) => d.signalNote || null });
  const imps = sortImp.apply(impsAll.filter((i) => keep(i.epicId) && (!teamId || teamOf(i.epicId) === teamId)), { main: (i) => i.title, team: (i) => teamName(teamOf(i.epicId)), state: (i) => IMPEDIMENT_STATUSES.indexOf(i.status), note: (i) => i.actionOwnerName || null });
  const fresh = sortNew.apply(newSinceLock(state, quarter).filter((p) => keep(p.epicId)), { main: (p) => epicTitle(p.epicId), team: (p) => teamName(teamOf(p.epicId)), state: (p) => epics.get(p.epicId)?.ownerName || null, note: (p) => p.createdAt }); // epics added after the lock (D97)
  const followedInQuarter = state.plans.filter((p) => p.quarterId === quarter.id && followed.has(p.epicId)).length;
  const { week, total } = quarterWeek(quarter, state.settings);
  const executing = inExecution(quarter.phase);
  const mayRaise = isPlanner(actor) && executing;
  const mayClose = isAdmin(actor) && executing;
  // "Onze toezeggingen" (section 26, D86): every committed ask the chosen team provides (all teams: every committed
  // ask), with the signal control for whoever may write that provider team. Viewers see chips only.
  const ours = sortOurs.apply(deps.filter((d) => normAsk(d.response) === 'accepted' && keep(d.epicId) && (!teamId || d.providerTeamId === teamId)).sort(byRank), { main: (d) => d.ask, team: (d) => teamName(d.requesterTeamId), state: sigOrder, note: (d) => d.signalNote || null });
  const maySignal = (d) => executing && canWriteTeam(actor, d.providerTeamId);
  const title = (epicId, className = '') => {
    const e = epics.get(epicId);
    return <button className={`text-left hover:underline focus-ring rounded-control truncate max-w-full ${className}`} onClick={() => setOpenEpic(epicId)}>{e?.title}<FollowStar on={followed.has(epicId)} className="inline ml-1.5 -mt-0.5" /></button>;
  };
  const sectionHead = (label, n) => <h2 className="text-subtitle font-semibold mb-2">{label} <span className="text-muted font-normal tnum">({n})</span></h2>;
  const head = (main, stateLabel, note, sort) => {
    const labels = { main, team: t('Team'), state: stateLabel, note };
    const th = (col, extra) => <SortTh col={col} label={labels[col]} sort={sort.sort} onToggle={sort.toggle} className={`${TC[col]} ${TH} ${extra || ''}`} />;
    return (
      <thead>
        {sort.sort && <tr><td colSpan={5} className="px-3 pt-2"><SortedChip sort={sort.sort} labels={labels} onClear={sort.clear} /></td></tr>}
        <tr className="text-caption text-muted border-b border-border"><th scope="col" className={`${TC.rank} ${TH}`}>#</th>{th('main')}{th('team')}{th('state')}{th('note')}</tr>
      </thead>
    );
  };
  const table = (label, children) => (
    <div className={`${cls.card} panel-table overflow-x-auto`}><table className="w-full table-fixed min-w-[1120px] text-body" aria-label={label}>{children}</table></div>
  );
  const nothing = atRisk.length === 0 && imps.length === 0 && fresh.length === 0;
  const selectedDep = atRisk.find((d) => d.id === selectedId) || null;

  return (
    <div data-tour="progress">
      <ViewHeader title={t('Progress')} meta={quarterMeta(quarter, t)} right={
        <>
          <FollowOnlyToggle on={followOnly} onChange={setFollowOnly} count={followedInQuarter} />
          {mayRaise && <button className={cls.secondary} onClick={() => setRaising(true)} data-tour="add-impediment"><Plus size={14} aria-hidden="true" />{t('Impediment')}</button>}
          <label className="flex items-center gap-2.5 text-label text-muted w-full sm:w-auto"><span className="whitespace-nowrap">{t('Choose team')}</span>
            <select className={`${cls.input} !h-10 sm:!w-60 text-subtitle font-medium text-ink`} value={teamId} onChange={(e) => setTeamId(e.target.value)} data-tour="team-select">
              <option value="">{t('All teams')}</option>
              {state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </>
      } />
      <p className="mb-5 text-label tnum text-ink" data-tour="progress-line">
        <span className="font-medium">{t('Week {w} of {n}', { w: week, n: total })}</span>
        <span className="text-faint"> · </span><span className={atRiskAll.length ? 'text-warn-fg font-medium' : 'text-muted'}>{t('{n} deadlines at risk', { n: atRiskAll.length })}</span>
        <span className="text-faint"> · </span><span className={impsAll.length ? 'text-ink' : 'text-muted'}>{impsAll.length === 1 ? t('1 impediment') : t('{n} impediments', { n: impsAll.length })}</span>
      </p>
      <ErrorLine error={err} />
      {executing && <QuarterBar week={week} total={total} selected={selectedDep} />}

      {nothing && (
        <div className={`${cls.card} mb-6`}><EmptyLine>{followOnly && followedInQuarter === 0 ? t('No followed epics here.') : t('All on track.')}</EmptyLine></div>
      )}

      {atRisk.length > 0 && (
        <section className="mb-6" aria-label={t('Deadline at risk')} data-tour="at-risk">
          {sectionHead(t('Deadline at risk'), atRisk.length)}
          {table(t('Deadline at risk'), (
            <>
              {head(t('Epic'), t('Signal'), t('Note'), sortRisk)}
              <tbody className="divide-y divide-border">
                {atRisk.map((d) => (
                  <SignalTr key={d.id} dep={d} rank={planFor(state, d.epicId, quarter.id)?.rank} team={teams.get(d.providerTeamId)?.name} may={maySignal(d)} act={act}
                    selected={selectedId === d.id} onSelect={() => setSelectedId((s) => (s === d.id ? null : d.id))}
                    main={<><div className="text-body font-medium truncate">{title(d.epicId)}</div><div className="text-caption text-muted truncate">{d.ask}</div></>} />
                ))}
              </tbody>
            </>
          ))}
        </section>
      )}

      {imps.length > 0 && (
        <section className="mb-6" aria-label={t('Impediments')} data-tour="impediments">
          {sectionHead(t('Impediments'), imps.length)}
          {table(t('Impediments'), (
            <>
              {head(t('Impediment'), t('Status'), t('Action holder'), sortImp)}
              <tbody className="divide-y divide-border">
                {imps.map((i) => <ImpedimentTr key={i.id} imp={i} epic={epics.get(i.epicId)} rank={planFor(state, i.epicId, quarter.id)?.rank} title={title} act={act} onEdit={isPlanner(actor) ? () => setEditing(i) : null} />)}
              </tbody>
            </>
          ))}
        </section>
      )}

      {fresh.length > 0 && (
        <section className="mb-6" aria-label={t('New unplanned work')} data-tour="new-since-lock">
          {sectionHead(t('New unplanned work'), fresh.length)}
          {table(t('New unplanned work'), (
            <>
              {head(t('Epic'), t('Owner'), t('Added'), sortNew)}
              <tbody className="divide-y divide-border">
                {fresh.map((p) => {
                  const e = epics.get(p.epicId);
                  return (
                    <tr key={p.id} className="h-row">
                      <td className={TC.rank}><RankNo rank={p.rank} hash /></td>
                      <td className={`${TC.main} min-w-0`}><div className="text-body font-medium truncate">{title(p.epicId)}</div></td>
                      <td className={`${TC.team} text-label text-muted truncate`}>{teams.get(e?.teamId)?.name}</td>
                      <td className={`${TC.state} text-label text-muted truncate`}>{e?.ownerName}</td>
                      <td className={`${TC.note} text-label text-muted tnum`}>{fmtDay(p.createdAt, t.lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </>
          ))}
        </section>
      )}

      {executing && (isPlanner(actor) || ours.length > 0) && (
        <section className="mb-6" aria-label={t('Our commitments')} data-tour="our-commitments">
          <Disclosure defaultOpen={ours.length <= 5} summary={<>{t('Our commitments')} <span className="tnum">({ours.length})</span></>}>
            {ours.length === 0 ? <div className={cls.card}><EmptyLine>{t('No commitments.')}</EmptyLine></div> : table(t('Our commitments'), (
              <>
                {head(t('Ask'), t('Signal'), t('Note'), sortOurs)}
                <tbody className="divide-y divide-border">
                  {ours.map((d) => (
                    <SignalTr key={d.id} dep={d} rank={planFor(state, d.epicId, quarter.id)?.rank} team={teams.get(d.requesterTeamId)?.name} may={maySignal(d)} act={act}
                      main={<><div className="text-body font-medium truncate">{d.ask}</div><div className="text-caption text-muted truncate">{teams.get(d.providerTeamId)?.name} · {t('for')} {title(d.epicId, 'text-accent')}</div></>} />
                  ))}
                </tbody>
              </>
            ))}
          </Disclosure>
        </section>
      )}

      {mayClose && (
        <div className="mt-8 flex justify-end">
          <button className={cls.secondary} onClick={() => setClosing(true)} data-tour="close-quarter"><Lock size={14} aria-hidden="true" />{t('Close quarter')}</button>
        </div>
      )}

      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {raising && <ImpedimentDialog onClose={() => setRaising(false)} />}
      {editing && <ImpedimentDialog imp={editing} onClose={() => setEditing(null)} />}
      {closing && <CloseQuarterDialog quarter={quarter} onClose={() => setClosing(false)} onDone={() => { window.location.hash = 'resultaat'; }} />}
    </div>
  );
}

// Quarter bar (D96, variant A): the quarter's weeks (quarter-relative, "week 3 van 13"), past weeks filled, a
// "▼ nu · week n" marker, and for the selected Deadline in gevaar row the span from now to that epic's deadline
// (Moet deadline, else the latest needed_by of its asks, else the quarter end) with "Tot deadline (wk 11): 8 weken".
// No "nog nodig / marge": there is no remaining estimate to show (docs section 27, TODO).
function QuarterBar({ week, total, selected }) {
  const { state, quarter } = usePlan();
  const t = useT();
  const epics = byId(state.epics); const themes = byId(state.themes);
  const dl = selected ? epicDeadline(state, selected.epicId, quarter, (e) => effectiveMust(e, themes.get(e.themeId))) : null;
  const dlWeek = dl ? weekOf(dl.date, quarter, state.settings) : null;
  const left = (w) => `${((w - 1) / total) * 100}%`;
  const epic = selected ? epics.get(selected.epicId) : null;
  return (
    <section className={`${cls.card} px-4 pt-7 pb-3 mb-6`} aria-label={t('Quarter bar')} data-tour="quarter-bar">
      <div className="relative">
        <div className="absolute -top-5 text-caption font-medium text-ink whitespace-nowrap tnum -translate-x-1/2" style={{ left: `${((week - 0.5) / total) * 100}%` }} aria-hidden="true">▼ {t('now · week {n}', { n: week })}</div>
        {dlWeek != null && <div className="absolute -top-5 text-caption font-medium text-warn-fg whitespace-nowrap tnum -translate-x-1/2" style={{ left: `${((dlWeek - 0.5) / total) * 100}%` }} aria-hidden="true">⚑ wk {dlWeek}</div>}
        <div className="relative flex gap-px h-3 rounded-control overflow-hidden bg-surface-2" role="img" aria-label={t('Week {w} of {n}', { w: week, n: total })}>
          {Array.from({ length: total }, (_, i) => i + 1).map((w) => (
            <div key={w} className={`flex-1 ${w < week ? 'bg-border-strong' : w === week ? 'bg-accent' : 'bg-surface-2'}`} />
          ))}
          {dlWeek != null && dlWeek >= week && <div className="absolute top-0 bottom-0 bg-warn opacity-40" style={{ left: left(week), width: `${((dlWeek - week + 1) / total) * 100}%` }} aria-hidden="true" />}
        </div>
        <div className="mt-1 flex justify-between text-micro text-faint tnum" aria-hidden="true"><span>{t('Week')} 1</span><span>{total}</span></div>
      </div>
      {selected && (
        <p className="mt-2 text-label tnum text-ink">
          <RankNo rank={planFor(state, selected.epicId, quarter.id)?.rank} size="sm" /> <span className="font-medium">{epic?.title}</span>
          <span className="text-faint"> · </span>
          {dlWeek >= week ? t('Until deadline (wk {w}): {n} weeks', { w: dlWeek, n: dlWeek - week }) : t('Deadline passed (wk {w})', { w: dlWeek })}
          {dl.source === 'must' && <span className="text-muted"> · {t('Must')}</span>}
        </p>
      )}
    </section>
  );
}

// One signal row: # · main · Team · Signaal (control for the provider, chip for everyone else) · Toelichting (the note,
// truncated with a tooltip, and the sprint-cadence "Bevestigen"). Op koers clears the note; Deadline in gevaar / Gaat
// niet halen open an optional one-line note on a second row (L7).
function SignalTr({ dep, rank, main, team, may, act, selected, onSelect }) {
  const { state, quarter } = usePlan();
  const t = useT();
  const [noteFor, setNoteFor] = useState(null);
  const signal = signalOf(dep);
  // Selectable rows (D96): click or Enter / Space outside the controls selects the row for the quarter bar.
  const rowProps = onSelect ? {
    tabIndex: 0, 'aria-selected': !!selected,
    onClick: (ev) => { if (!ev.target.closest('button, input, select, a')) onSelect(); },
    onKeyDown: (ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onSelect(); } },
  } : {};
  const confirmDue = may && needsConfirmation(dep, quarter, state.settings);
  const pickSignal = async (s) => {
    if (s === signal && noteFor == null) return;
    if (s === 'on_track') { setNoteFor(null); await act('setSignal', dep.id, s, ''); return; }
    setNoteFor(s);
  };
  const note = signal !== 'on_track' ? dep.signalNote : '';
  return (
    <>
      <tr className={`h-row ${onSelect ? 'cursor-pointer focus-ring-inset transition-base' : ''} ${selected ? 'bg-accent-50' : onSelect ? 'hover:bg-surface-2' : ''}`} {...rowProps}>
        <td className={TC.rank}><RankNo rank={rank} hash /></td>
        <td className={`${TC.main} min-w-0`}>{main}</td>
        <td className={`${TC.team} text-label text-muted truncate`}>{team}</td>
        <td className={TC.state}>{may ? <SignalControl value={signal} onPick={pickSignal} /> : <SignalChip dep={dep} withNote={false} />}</td>
        <td className={`${TC.note} min-w-0`}>
          <div className="flex items-center gap-2 min-w-0">
            {note && <span className="text-label text-muted truncate" title={note}>{note}</span>}
            {confirmDue && noteFor == null && <button type="button" className={`${cls.quiet} shrink-0`} onClick={() => act('confirmSignal', dep.id)} title={t('Still on track, no change')}>{t('Confirm')}</button>}
          </div>
        </td>
      </tr>
      {noteFor && (
        <tr className="bg-accent-50"><td colSpan={5} className="px-3 pb-3 pt-1 pl-[60px]">
          <InlineReason label={t('Note (optional)')} defaultValue={dep.signalNote || ''} placeholder={t('One line, e.g. what shifts')}
            onSave={async (n) => { const r = await act('setSignal', dep.id, noteFor, n); if (r.ok) setNoteFor(null); }} onCancel={() => setNoteFor(null)} />
        </td></tr>
      )}
    </>
  );
}

// One impediment row (D92/D93): # · title + "IMP-0001 · Epic · n dagen open" · Team · Status (select for whoever may
// change it, chip otherwise; "Escalatie" chip and red title past the threshold) · Actiehouder with "melder <naam>".
function ImpedimentTr({ imp, epic, rank, title, act, onEdit }) {
  const { state, actor } = usePlan();
  const t = useT();
  const teams = byId(state.teams);
  const age = daysSince(imp.raisedAt) ?? 0;
  const esc = isEscalated(imp, state.settings);
  const may = canChangeImpediment(actor, imp, epic);
  const m = IMPEDIMENT_STATUS_META[imp.status] || IMPEDIMENT_STATUS_META.open;
  return (
    <tr className="group h-row">
      <td className={TC.rank}><RankNo rank={rank} hash /></td>
      <td className={`${TC.main} min-w-0`}>
        <div className={`text-body font-medium truncate ${esc ? 'text-danger-fg' : 'text-ink'}`} title={imp.title}>{imp.title}</div>
        <div className="text-caption text-muted truncate tnum"><span className="mono">{imp.refCode}</span> · {title(imp.epicId, 'text-accent')} · <span className={esc ? 'text-danger-fg font-medium' : ''}>{age === 1 ? t('1 day open') : t('{n} days open', { n: age })}</span></div>
      </td>
      <td className={`${TC.team} text-label text-muted truncate`}>{teams.get(epic?.teamId)?.name}</td>
      <td className={TC.state}>
        <div className="flex items-center gap-2">
          {may ? (
            <select className={`${cls.input} !w-auto !h-7 text-caption`} value={imp.status} aria-label={`${t('Status')} ${imp.refCode}`} onChange={(e) => act('setImpedimentStatus', imp.id, e.target.value)}>
              {IMPEDIMENT_STATUSES.map((s) => <option key={s} value={s}>{t(IMPEDIMENT_STATUS_META[s].label)}</option>)}
            </select>
          ) : <span className={`inline-flex items-center rounded-full px-2 h-6 text-caption font-medium whitespace-nowrap ${toneClass(m.tone)}`}>{t(m.label)}</span>}
          {esc && <span className={`inline-flex items-center gap-1 rounded-full px-2 h-6 text-caption font-semibold whitespace-nowrap ${toneClass('danger')}`}><TriangleAlert size={12} strokeWidth={2.25} aria-hidden="true" />{t('Escalation')}</span>}
        </div>
      </td>
      <td className={`${TC.note} min-w-0`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="text-label text-ink truncate" title={imp.actionOwnerName || undefined}>{imp.actionOwnerName || <span className="text-faint">–</span>}</div>
            <div className="text-caption text-muted truncate">{t('Reporter').toLowerCase()} {imp.ownerName}</div>
          </div>
          {onEdit && <button type="button" className={`${cls.icon} shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-base`} aria-label={`${t('Edit impediment')} ${imp.refCode}`} title={t('Edit impediment')} onClick={onEdit}><Pencil size={14} /></button>}
        </div>
      </td>
    </tr>
  );
}

// "+ Impediment" and "Impediment bewerken": title, epic (plans of the quarter by rank), Melder (set to the raiser;
// admins may change it), Actiehouder (free text, members suggested) and status (whoever may change it).
function ImpedimentDialog({ imp, onClose }) {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const epics = byId(state.epics);
  const plans = state.plans.filter((p) => p.quarterId === quarter.id).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const [title, setTitle] = useState(imp?.title || '');
  const [epicId, setEpicId] = useState(imp?.epicId || plans[0]?.epicId || '');
  const [reporter, setReporter] = useState(imp?.ownerName ?? actor.name);
  const [holder, setHolder] = useState(imp?.actionOwnerName || '');
  const [status, setStatus] = useState(imp?.status || 'open');
  const [err, setErr] = useState(null);
  const admin = isAdmin(actor);
  const mayStatus = !imp || canChangeImpediment(actor, imp, epics.get(imp.epicId));
  const members = state.members || [];
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErr('Title is required');
    const holderName = holder.trim();
    const holderId = members.find((x) => x.name === holderName)?.id || null;
    const patch = imp ? { id: imp.id } : { kind: 'impediment' };
    if (!imp || title.trim() !== imp.title) patch.title = title.trim();
    if (!imp || epicId !== imp.epicId) patch.epicId = epicId;
    if (admin && imp && reporter.trim() !== imp.ownerName) { patch.ownerName = reporter.trim(); patch.reporterId = members.find((x) => x.name === reporter.trim())?.id || null; }
    if (mayStatus && (!imp ? holderName !== '' : holderName !== (imp.actionOwnerName || ''))) { patch.actionOwnerName = holderName; patch.actionOwnerId = holderId; }
    if (mayStatus && imp && status !== imp.status) patch.status = status;
    const r = await run('upsertImpediment', patch);
    if (!r.ok) return setErr(r.error);
    return onClose();
  };
  return (
    <Dialog title={t(imp ? 'Edit impediment' : 'New impediment')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className={cls.label}>{t('Title')}</span><input className={cls.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('What is blocking?')} /></label>
        <label className="block"><span className={cls.label}>{t('Epic')}</span>
          <select className={cls.input} value={epicId} onChange={(e) => setEpicId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.epicId}>{p.rank != null ? `${p.rank} · ` : ''}{epics.get(p.epicId)?.title}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={cls.label}>{t('Reporter')}</span><input className={cls.input} value={reporter} disabled={!admin || !imp} list={admin ? 'kp-members' : undefined} onChange={(e) => setReporter(e.target.value)} /></label>
          <label className="block"><span className={cls.label}>{t('Action holder')}</span><input className={cls.input} value={holder} disabled={!mayStatus} list="kp-members" onChange={(e) => setHolder(e.target.value)} /></label>
        </div>
        <datalist id="kp-members">{members.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        {imp && (
          <label className="block max-w-[200px]"><span className={cls.label}>{t('Status')}</span>
            <select className={cls.input} value={status} disabled={!mayStatus} onChange={(e) => setStatus(e.target.value)}>{IMPEDIMENT_STATUSES.map((s) => <option key={s} value={s}>{t(IMPEDIMENT_STATUS_META[s].label)}</option>)}</select>
          </label>
        )}
        <ErrorLine error={err} />
        <div className="flex justify-end gap-2 pt-1"><button type="button" className={cls.secondary} onClick={onClose}>{t('Cancel')}</button><button type="submit" className={cls.primary} disabled={!epicId}>{t('Save')}</button></div>
      </form>
    </Dialog>
  );
}
