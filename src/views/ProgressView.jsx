import React, { useEffect, useState } from 'react';
import { Plus, Check, Lock } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { isPlanner, isAdmin, canWriteTeam } from '../data/repository';
import { IMPEDIMENT_AGING_DAYS } from '../domain/model';
import { planFor, byId, daysSince } from '../domain/plan';
import { hasSignal, inExecution, quarterWeek, openImpediments, signalOf, needsConfirmation } from '../domain/rhythm';
import { followsOf, readFollowOnly, writeFollowOnly } from '../domain/follows';
import { useT } from '../i18n';
import { cls, ViewHeader, quarterMeta, RankNo, StatusChip, SignalChip, SignalControl, InlineReason, EmptyLine, ErrorLine, Dialog, Disclosure, FollowStar, FollowOnlyToggle, isPostLock, normAsk } from '../components/plan/core';
import { CloseQuarterDialog } from '../components/plan/CycleActions';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';

// Step 3 during Uitvoering — Voortgang (docs/design.md section 23, D65; acceptance M5). One top line, then three
// compact sections that hide when empty: Deadline in gevaar (signals on committed asks), Impediments (open, kind
// 'impediment'), Nieuw sinds vastzetten (asks created after lockedAt). "Alleen gevolgd" filters all three (M8).
// Admins close the quarter at the bottom (M7); the steps then switch and Resultaat opens.
export function ProgressView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  const [raising, setRaising] = useState(false);
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState(null);
  const [followOnly, setFollowOnlyState] = useState(() => readFollowOnly(actor.id));
  useEffect(() => { setFollowOnlyState(readFollowOnly(actor.id)); }, [actor.id]);
  if (!quarter) return <NoQuarter />;
  const epics = byId(state.epics); const teams = byId(state.teams);
  const followed = followsOf(state, actor.id);
  const setFollowOnly = (on) => { setFollowOnlyState(on); writeFollowOnly(actor.id, on); };
  const keep = (epicId) => !followOnly || followed.has(epicId);
  const rankOf = (epicId) => planFor(state, epicId, quarter.id)?.rank ?? 1e9;
  const byRank = (a, b) => rankOf(a.epicId) - rankOf(b.epicId);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };

  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const atRiskAll = deps.filter(hasSignal);
  const impsAll = openImpediments(state, quarter.id);
  const atRisk = atRiskAll.filter((d) => keep(d.epicId)).sort(byRank);
  const imps = impsAll.filter((i) => keep(i.epicId));
  const fresh = deps.filter((d) => isPostLock(d, quarter) && keep(d.epicId)).sort(byRank);
  const followedInQuarter = state.plans.filter((p) => p.quarterId === quarter.id && followed.has(p.epicId)).length;
  const { week, total } = quarterWeek(quarter, state.settings);
  const mayRaise = isPlanner(actor) && inExecution(quarter.phase);
  const mayClose = isAdmin(actor) && inExecution(quarter.phase);
  // "Onze toezeggingen" (section 26, D86): every committed ask the team provides, with the signal control, so a first
  // Deadline in gevaar can be raised here. Planners see their own team; admins pick one. Viewers see no controls.
  const [ownTeam, setOwnTeam] = useState(actor.teamId || state.teams[0]?.id || '');
  useEffect(() => { setOwnTeam(actor.teamId || state.teams[0]?.id || ''); }, [actor.id]);
  const ours = deps.filter((d) => d.providerTeamId === ownTeam && normAsk(d.response) === 'accepted' && keep(d.epicId)).sort(byRank);
  const maySignal = inExecution(quarter.phase) && canWriteTeam(actor, ownTeam);
  const title = (epicId, className = '') => {
    const e = epics.get(epicId);
    return <button className={`text-left hover:underline focus-ring rounded-control truncate ${className}`} onClick={() => setOpenEpic(epicId)}>{e?.title}<FollowStar on={followed.has(epicId)} className="inline ml-1.5 -mt-0.5" /></button>;
  };
  const sectionHead = (label, n) => <h2 className="text-subtitle font-semibold mb-2">{label} <span className="text-muted font-normal tnum">({n})</span></h2>;

  return (
    <div data-tour="progress">
      <ViewHeader title={t('Progress')} meta={quarterMeta(quarter, t)} right={
        <>
          <FollowOnlyToggle on={followOnly} onChange={setFollowOnly} count={followedInQuarter} />
          {mayRaise && <button className={cls.secondary} onClick={() => setRaising(true)} data-tour="add-impediment"><Plus size={14} aria-hidden="true" />{t('Impediment')}</button>}
        </>
      } />
      <p className="mb-5 text-label tnum text-ink" data-tour="progress-line">
        <span className="font-medium">{t('Week {w} of {n}', { w: week, n: total })}</span>
        <span className="text-faint"> · </span><span className={atRiskAll.length ? 'text-warn-fg font-medium' : 'text-muted'}>{t('{n} deadlines at risk', { n: atRiskAll.length })}</span>
        <span className="text-faint"> · </span><span className={impsAll.length ? 'text-ink' : 'text-muted'}>{impsAll.length === 1 ? t('1 impediment') : t('{n} impediments', { n: impsAll.length })}</span>
      </p>
      <ErrorLine error={err} />

      {atRisk.length === 0 && imps.length === 0 && fresh.length === 0 && (
        <div className={cls.card}><EmptyLine>{followOnly && followedInQuarter === 0 ? t('No followed epics here.') : t('All on track.')}</EmptyLine></div>
      )}

      {atRisk.length > 0 && (
        <section className="mb-6" aria-label={t('Deadline at risk')} data-tour="at-risk">
          {sectionHead(t('Deadline at risk'), atRisk.length)}
          <ul className={`${cls.card} divide-y divide-border`}>
            {atRisk.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 min-h-10 py-1.5 flex-wrap md:flex-nowrap">
                <RankNo rank={planFor(state, d.epicId, quarter.id)?.rank} size="sm" />
                {title(d.epicId, 'text-body font-medium min-w-0 flex-1')}
                <span className="w-40 shrink-0 text-label text-muted truncate">{teams.get(d.providerTeamId)?.name}</span>
                {inExecution(quarter.phase) && canWriteTeam(actor, d.providerTeamId) ? <SignalRow dep={d} act={act} /> : <SignalChip dep={d} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {imps.length > 0 && (
        <section className="mb-6" aria-label={t('Impediments')} data-tour="impediments">
          {sectionHead(t('Impediments'), imps.length)}
          <ul className={`${cls.card} divide-y divide-border`}>
            {imps.map((i) => {
              const age = daysSince(i.raisedAt) ?? 0;
              return (
                <li key={i.id} className="flex items-center gap-3 px-3 min-h-10 py-1.5 flex-wrap md:flex-nowrap">
                  <span className="mono text-caption text-muted w-20 shrink-0">{i.refCode}</span>
                  <span className="text-body text-ink min-w-0 flex-1 truncate">{i.title}</span>
                  {title(i.epicId, 'text-label text-muted max-w-[220px]')}
                  <span className="w-32 shrink-0 text-label text-muted truncate">{i.ownerName}</span>
                  <span className={`w-24 shrink-0 text-label tnum whitespace-nowrap ${age > IMPEDIMENT_AGING_DAYS ? 'text-warn-fg font-medium' : 'text-muted'}`}>{age === 1 ? t('1 day open') : t('{n} days open', { n: age })}</span>
                  {mayRaise && <button className={cls.quiet} onClick={() => act('resolveImpediment', i.id)}><Check size={13} aria-hidden="true" />{t('Resolved')}</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="mb-6" aria-label={t('New since lock')} data-tour="new-since-lock">
          {sectionHead(t('New since lock'), fresh.length)}
          <ul className={`${cls.card} divide-y divide-border`}>
            {fresh.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 min-h-10 py-1.5 flex-wrap md:flex-nowrap">
                <RankNo rank={planFor(state, d.epicId, quarter.id)?.rank} size="sm" />
                <div className="min-w-0 flex-1">
                  {title(d.epicId, 'text-body font-medium')}
                  <div className="text-caption text-muted truncate">{teams.get(d.providerTeamId)?.name} · {d.ask}</div>
                </div>
                <SignalChip dep={d} />
                <StatusChip response={d.response} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {inExecution(quarter.phase) && (isPlanner(actor) || isAdmin(actor)) && (
        <section className="mb-6" aria-label={t('Our commitments')} data-tour="our-commitments">
          <Disclosure defaultOpen={ours.length <= 5} summary={<>{t('Our commitments')} <span className="tnum">({ours.length})</span>{isAdmin(actor) && !actor.teamId && (
            <select className={`${cls.input} !w-auto !h-7 ml-2 text-caption`} value={ownTeam} onClick={(e) => e.preventDefault()} onChange={(e) => setOwnTeam(e.target.value)} aria-label={t('Team')}>{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>)}</>}>
            {ours.length === 0 ? <div className={cls.card}><EmptyLine>{t('No commitments.')}</EmptyLine></div> : (
              <ul className={`${cls.card} divide-y divide-border`}>
                {ours.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 min-h-10 py-1.5 flex-wrap md:flex-nowrap">
                    <RankNo rank={planFor(state, d.epicId, quarter.id)?.rank} hash />
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-medium">{d.ask}</div>
                      <div className="text-caption text-muted">{teams.get(d.requesterTeamId)?.name} · {t('for')} {title(d.epicId, 'text-accent')}</div>
                    </div>
                    {maySignal ? <SignalRow dep={d} act={act} /> : <SignalChip dep={d} />}
                  </li>
                ))}
              </ul>
            )}
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
      {closing && <CloseQuarterDialog quarter={quarter} onClose={() => setClosing(false)} onDone={() => { window.location.hash = 'resultaat'; }} />}
    </div>
  );
}

// The provider changes a signal here (section 26: signals belong on Voortgang, not on Afgestemd). Op koers clears
// the note; Deadline in gevaar / Gaat niet halen open an optional one-line note (L7).
function SignalRow({ dep, act }) {
  const { state, quarter } = usePlan();
  const t = useT();
  const [noteFor, setNoteFor] = useState(null);
  const signal = signalOf(dep);
  const confirmDue = needsConfirmation(dep, quarter, state.settings);
  const pickSignal = async (s) => {
    if (s === signal && noteFor == null) return;
    if (s === 'on_track') { setNoteFor(null); await act('setSignal', dep.id, s, ''); return; }
    setNoteFor(s);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SignalControl value={signal} onPick={pickSignal} />
      {noteFor == null && dep.signalNote && signal !== 'on_track' && <span className="text-label text-muted truncate max-w-[320px]">{dep.signalNote}</span>}
      {confirmDue && noteFor == null && <button type="button" className={cls.quiet} onClick={() => act('confirmSignal', dep.id)} title={t('Still on track, no change')}>{t('Confirm')}</button>}
      {noteFor && (
        <InlineReason label={t('Note (optional)')} defaultValue={dep.signalNote || ''} placeholder={t('One line, e.g. what shifts')}
          onSave={async (note) => { const r = await act('setSignal', dep.id, noteFor, note); if (r.ok) setNoteFor(null); }} onCancel={() => setNoteFor(null)} />
      )}
    </div>
  );
}

// "+ Impediment": title + epic picker (plans of the quarter by rank); owner = the raiser (M5).
function ImpedimentDialog({ onClose }) {
  const { state, quarter, run } = usePlan();
  const t = useT();
  const epics = byId(state.epics);
  const plans = state.plans.filter((p) => p.quarterId === quarter.id).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const [title, setTitle] = useState('');
  const [epicId, setEpicId] = useState(plans[0]?.epicId || '');
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErr('Title is required');
    const r = await run('upsertImpediment', { kind: 'impediment', title: title.trim(), epicId });
    if (!r.ok) return setErr(r.error);
    return onClose();
  };
  return (
    <Dialog title={t('New impediment')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className={cls.label}>{t('Title')}</span><input className={cls.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('What is blocking?')} /></label>
        <label className="block"><span className={cls.label}>{t('Epic')}</span>
          <select className={cls.input} value={epicId} onChange={(e) => setEpicId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.epicId}>{p.rank != null ? `${p.rank} · ` : ''}{epics.get(p.epicId)?.title}</option>)}
          </select>
        </label>
        <ErrorLine error={err} />
        <div className="flex justify-end gap-2 pt-1"><button type="button" className={cls.secondary} onClick={onClose}>{t('Cancel')}</button><button type="submit" className={cls.primary} disabled={!epicId}>{t('Save')}</button></div>
      </form>
    </Dialog>
  );
}
