import React, { useEffect, useRef, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { usePlan } from '../../context/PlanContext';
import { canWriteTeam, canRank } from '../../data/repository';
import { quarterLabel, isLockedPhase } from '../../domain/model';
import { planFor, epicDeps } from '../../domain/plan';
import { useT } from '../../i18n';
import { cls, StatusChip, RankNo, InlineReason, Disclosure, ErrorLine, fmtDate } from './core';
import { describeEvent } from './EpicPanel';

// Simplified epic panel (docs/design.md section 19): title, team, quarter, rank, effort, asks, "Meer", "Historie".
// Docked right, slides in, Escape closes, focus returns to the row that opened it. The full panel (EpicPanel.jsx)
// stays for the extended modules.
export function SimpleEpicPanel({ epicId, onClose }) {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const ref = useRef(null);
  const closeBtn = useRef(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const [err, setErr] = useState(null);
  const [rankDraft, setRankDraft] = useState(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const prev = document.activeElement;
    closeBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onCloseRef.current(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [epicId]);

  const epic = state.epics.find((e) => e.id === epicId);
  if (!epic || !quarter) return null;
  const plan = planFor(state, epic.id, quarter.id);
  const team = state.teams.find((x) => x.id === epic.teamId);
  const mayEdit = canWriteTeam(actor, epic.teamId) && quarter.phase !== 'closed';
  const mayRank = canRank(actor) && quarter.phase !== 'closed' && !!plan;
  const locked = isLockedPhase(quarter.phase);
  const deps = epicDeps(state, epic.id, quarter.id);
  const history = state.events.filter((e) => e.entityId === plan?.id || e.entityId === epic.id || deps.some((d) => d.id === e.entityId)).sort((a, b) => b.at.localeCompare(a.at));
  const ranked = state.plans.filter((p) => p.quarterId === quarter.id && p.rank != null).sort((a, b) => a.rank - b.rank);

  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const saveEpic = (patch) => act('upsertEpic', { id: epic.id, ...patch });
  const savePlan = (patch, reason = '') => act('upsertPlan', { id: plan?.id, epicId: epic.id, quarterId: quarter.id, ...patch }, reason);
  // Rank changes go through reorderPlans so the list stays 1..n (D28); the reason is optional unless locked.
  const applyRank = async (reason) => {
    const target = Math.max(1, Math.min(ranked.length + (plan.rank == null ? 1 : 0), rankDraft));
    const ids = ranked.map((p) => p.id).filter((id) => id !== plan.id);
    ids.splice(target - 1, 0, plan.id);
    const r = await act('reorderPlans', quarter.id, ids, reason);
    if (r.ok) setRankDraft(null);
  };

  return (
    <aside ref={ref} role="dialog" aria-modal="false" aria-label={`${epic.refCode} ${epic.title}`} className="fixed right-0 top-14 bottom-0 w-[420px] max-w-[95vw] bg-surface border-l border-border z-panel overflow-y-auto scrollbar-thin anim-slide-in-right shadow-md">
      <header className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-caption text-muted mono flex items-center gap-2">{epic.refCode} · {team?.name}{epic.externalUrl && <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href={epic.externalUrl} target="_blank" rel="noreferrer">Azure DevOps<ExternalLink size={11} aria-hidden="true" /></a>}</div>
          {mayEdit && !epic.externalSource
            ? <input className="mt-0.5 w-full text-subtitle font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none" defaultValue={epic.title} aria-label={t('Title')} onBlur={(e) => e.target.value.trim() && e.target.value !== epic.title && saveEpic({ title: e.target.value.trim() })} />
            : <h2 className="mt-0.5 text-subtitle font-semibold leading-6">{epic.title}</h2>}
        </div>
        <button ref={closeBtn} className={cls.icon} onClick={onClose} aria-label={t('Close')}><X size={16} /></button>
      </header>

      <div className="p-4 space-y-5">
        <ErrorLine error={err} />
        <dl className="grid grid-cols-[96px_1fr] gap-y-2 gap-x-3 text-body items-center">
          <dt className="text-muted text-label">{t('Quarter')}</dt><dd>{quarterLabel(quarter)}{!plan && <span className="text-muted"> · {t('not planned')}</span>}</dd>
          <dt className="text-muted text-label">{t('Rank')}</dt>
          <dd className="flex items-center gap-2">
            {mayRank ? (
              <input type="number" min="1" max={ranked.length + 1} className={`${cls.input} !w-20 tnum`} value={rankDraft ?? plan.rank ?? ''} aria-label={t('Strategic rank')} placeholder="–"
                onChange={(e) => setRankDraft(e.target.value === '' ? null : Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter' && rankDraft != null && rankDraft !== plan.rank) applyRank(''); }} />
            ) : <RankNo rank={plan?.rank} size="sm" />}
          </dd>
          {rankDraft != null && rankDraft !== plan.rank && (
            <dd className="col-span-2"><InlineReason required={locked} autoFocus={false} onSave={applyRank} onCancel={() => setRankDraft(null)} /></dd>
          )}
          <dt className="text-muted text-label">{t('Effort (pw)')}</dt>
          <dd className="flex items-center gap-1 tnum">
            {plan && mayEdit ? (
              <>
                <input type="number" min="0" step="0.5" className={`${cls.input} !w-16`} defaultValue={plan.effortLow || ''} placeholder="0" aria-label={t('Effort low')} onBlur={(e) => Number(e.target.value) !== plan.effortLow && savePlan({ effortLow: Number(e.target.value) })} />
                <span className="text-muted">–</span>
                <input type="number" min="0" step="0.5" className={`${cls.input} !w-16`} defaultValue={plan.effortHigh || ''} placeholder="0" aria-label={t('Effort high')} onBlur={(e) => Number(e.target.value) !== plan.effortHigh && savePlan({ effortHigh: Number(e.target.value) })} />
              </>
            ) : plan ? <span>{plan.effortLow}–{plan.effortHigh}</span> : <span className="text-muted">–</span>}
          </dd>
          {!plan && mayEdit && <dd className="col-span-2"><button className={cls.secondary} onClick={() => savePlan({ commitment: 'draft', effortLow: 0, effortHigh: 0 })}>{t('Add to this quarter')}</button></dd>}
        </dl>

        <section>
          <h3 className="text-label font-semibold text-ink mb-2">{t('Asks')} <span className="text-muted font-normal tnum">({deps.length})</span></h3>
          {deps.length === 0 ? <p className="text-body text-muted">{t('No asks yet.')}</p> : (
            <ul className="divide-y divide-border border border-border rounded-card">
              {deps.map((d) => (
                <li key={d.id} className="px-3 py-2 text-body">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><span className="text-muted">{state.teams.find((x) => x.id === d.providerTeamId)?.name}</span> · {d.ask}</div>
                    <StatusChip response={d.response} />
                  </div>
                  {d.responseReason && <p className="text-caption text-muted mt-0.5">{d.responseReason}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption text-muted mt-2"><a className="text-accent hover:underline" href="#afhankelijkheden">{t('Manage asks in Dependencies')}</a></p>
        </section>

        <Disclosure summary={t('More')}>
          <div className="space-y-3">
            <label className="block"><span className={cls.label}>{t('Description')}</span><textarea className={cls.textarea} rows={3} defaultValue={epic.description || ''} disabled={!mayEdit} onBlur={(e) => e.target.value !== (epic.description || '') && saveEpic({ description: e.target.value })} /></label>
            <label className="block"><span className={cls.label}>{t('Label')}</span><input className={cls.input} defaultValue={epic.label || ''} disabled={!mayEdit} onBlur={(e) => e.target.value !== (epic.label || '') && saveEpic({ label: e.target.value })} /></label>
            {mayEdit && <label className="block"><span className={cls.label}>{t('Team')}</span><select className={cls.input} value={epic.teamId} onChange={(e) => saveEpic({ teamId: e.target.value })}>{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
            {plan && mayEdit && !removing && <button className={`${cls.quiet} text-danger-fg`} onClick={() => (locked ? setRemoving(true) : act('removePlan', plan.id).then((r) => r.ok && onClose()))}>{t('Remove from this quarter')}</button>}
            {removing && <InlineReason required saveLabel={t('Remove')} onSave={async (reason) => { const r = await act('removePlan', plan.id, reason); if (r.ok) onClose(); }} onCancel={() => setRemoving(false)} />}
          </div>
        </Disclosure>

        <Disclosure summary={<>{t('History')} <span className="tnum text-faint">({history.length})</span></>}>
          {history.length === 0 ? <p className="text-caption text-muted">{t('No changes recorded.')}</p> : (
            <ul className="space-y-1 text-caption text-ink-2">
              {history.slice(0, 15).map((e) => <li key={e.id}><span className="text-muted tnum">{fmtDate(e.at, t.lang)}</span> · {e.actorName || t('system')} — {describeEvent(e, t)}{e.reason && <span className="italic text-muted"> — “{e.reason}”</span>}</li>)}
            </ul>
          )}
        </Disclosure>
      </div>
    </aside>
  );
}
