import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { canWriteTeam, canRank } from '../../data/repository';
import { COMMITMENTS, COMMITMENT_META, CONFIDENCE, CONFIDENCE_META, RESPONSE_META, quarterLabel, isLockedPhase } from '../../domain/model';
import { planFor, epicDeps, latestCheckIn, daysSince, changedSinceBaseline, timingConflict } from '../../domain/plan';
import { useT } from '../../i18n';
import { CommitmentPill, ResponsePill, ConfidenceMark, Field, input, btn, ErrorNote, ReasonPrompt, Modal, Empty, fmtDate } from './ui';
import { DependencyForm } from './DependencyForm';

// Side panel for one epic: edit, plan for the selected quarter, dependencies, check-ins, history.
export function EpicPanel({ epicId, onClose }) {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const epic = state.epics.find((e) => e.id === epicId);
  const [err, setErr] = useState(null);
  const [reasonFor, setReasonFor] = useState(null); // { patch, title }
  const [showAsk, setShowAsk] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [editAsk, setEditAsk] = useState(null);
  const [removeAsk, setRemoveAsk] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!epic || !quarter) return null;
  const plan = planFor(state, epic.id, quarter.id);
  const team = state.teams.find((x) => x.id === epic.teamId);
  const theme = state.themes.find((x) => x.id === epic.themeId);
  const mayEdit = canWriteTeam(actor, epic.teamId) && quarter.phase !== 'closed';
  const mayRank = canRank(actor) && quarter.phase !== 'closed';
  const locked = isLockedPhase(quarter.phase);
  const deps = epicDeps(state, epic.id, quarter.id);
  const incoming = state.dependencies.filter((d) => d.providerTeamId === epic.teamId && d.quarterId === quarter.id);
  const history = state.events.filter((e) => e.entityId === plan?.id || e.entityId === epic.id || deps.some((d) => d.id === e.entityId)).sort((a, b) => b.at.localeCompare(a.at));
  const ci = latestCheckIn(state, epic.id);
  const changed = plan && changedSinceBaseline(state, epic.id, quarter.id);

  const saveEpic = async (patch) => { const r = await run('upsertEpic', { id: epic.id, ...patch }); setErr(r.ok ? null : r.error); };
  const savePlan = async (patch, reason = '') => {
    const needsReason = (patch.rank !== undefined && patch.rank !== plan?.rank) || (locked && plan);
    if (needsReason && !reason) { setReasonFor({ patch, title: patch.rank !== undefined ? t('Reason for changing the strategic rank') : t('Quarter is locked: reason for this change') }); return { ok: true }; }
    const r = await run('upsertPlan', { id: plan?.id, epicId: epic.id, quarterId: quarter.id, ...patch }, reason);
    setErr(r.ok ? null : r.error);
    return r;
  };

  return (
    <aside role="dialog" aria-modal="false" aria-label={`${epic.refCode} ${epic.title}`} className="fixed right-0 top-0 h-full w-[520px] max-w-[95vw] bg-white shadow-2xl border-l border-gray-200 z-30 overflow-y-auto">
      <header className="sticky top-0 bg-white border-b px-4 py-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-mono text-gray-500">{epic.refCode} · {team?.name}{epic.externalSource && <> · <a className="text-indigo-700 hover:underline" href={epic.externalUrl} target="_blank" rel="noreferrer">{t('Open in Azure DevOps')} ↗</a></>}</div>
          {mayEdit && !epic.externalSource ? (
            <input className="text-lg font-semibold w-full border-b border-transparent focus:border-indigo-400 focus:outline-none" defaultValue={epic.title} onBlur={(e) => e.target.value !== epic.title && saveEpic({ title: e.target.value })} />
          ) : <h2 className="text-lg font-semibold">{epic.title}</h2>}
          {epic.externalSource && <p className="text-xs text-gray-600">{t('Title and state come from Azure DevOps (read-only)')}{epic.externalState ? `, ${t('state there: {state}', { state: epic.externalState })}` : ''}{epic.externalSyncedAt ? `, ${t('last synced {date}', { date: fmtDate(epic.externalSyncedAt) })}` : `, ${t('not synced yet')}`}. {t('Rank, effort, commitment and asks live only here.')}</p>}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-xl leading-none" aria-label={t('Close')}>×</button>
      </header>

      <div className="p-4 space-y-5">
        <ErrorNote error={err} />
        {changed && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1">{t('Changed since the plan was locked — see the Session diff.')}</p>}

        {/* Epic attributes */}
        <section className="grid grid-cols-2 gap-3">
          <Field l={t('Team')}>
            <select className={input} value={epic.teamId} disabled={!mayEdit} onChange={(e) => saveEpic({ teamId: e.target.value })}>
              {state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field l={t('Strategic theme')}>
            <select className={input} value={epic.themeId || ''} disabled={!mayEdit} onChange={(e) => saveEpic({ themeId: e.target.value || null })}>
              <option value="">{t('— unaligned —')}</option>
              {state.themes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field l={t('Program / portfolio label (used as a filter)')}>
            <input className={input} defaultValue={epic.label} disabled={!mayEdit} onBlur={(e) => e.target.value !== epic.label && saveEpic({ label: e.target.value })} />
          </Field>
          <Field l={t('Owner')}>
            <input className={input} defaultValue={epic.ownerName} disabled={!mayEdit} onBlur={(e) => e.target.value !== epic.ownerName && saveEpic({ ownerName: e.target.value })} />
          </Field>
          <Field l={t('Regulatory')}>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={epic.regulatory} disabled={!mayEdit} onChange={(e) => saveEpic({ regulatory: e.target.checked })} /> {t('Regulatory / compliance')}</label>
          </Field>
          <Field l={t('Deadline')}>
            <input type="date" className={input} value={epic.regulatoryDeadline || ''} disabled={!mayEdit || !epic.regulatory} onChange={(e) => saveEpic({ regulatoryDeadline: e.target.value || null })} />
          </Field>
          {epic.regulatory && <div className="col-span-2"><Field l={t('Regulation / regulator (e.g. DORA (DNB), AVG, IFRS 17)')}><input className={input} defaultValue={epic.regulation || ''} disabled={!mayEdit} onBlur={(e) => e.target.value !== (epic.regulation || '') && saveEpic({ regulation: e.target.value })} /></Field></div>}
        </section>

        {/* Plan for the selected quarter */}
        <section>
          <h3 className="font-semibold text-sm mb-2">{t('Plan for {quarter}', { quarter: quarterLabel(quarter) })}</h3>
          {!plan ? (
            <div className="flex items-center gap-3">
              <Empty>{t('Not planned in this quarter.')}</Empty>
              {mayEdit && <button className={btn.secondary} onClick={() => savePlan({ commitment: 'draft', effortLow: 0, effortHigh: 0 })}>{t('Add to this quarter')}</button>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field l={t('Strategic rank (top-down)')}>
                <input type="number" min="1" className={input} defaultValue={plan.rank ?? ''} disabled={!mayRank} title={mayRank ? '' : t('Needs rank permission')}
                  onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== plan.rank) savePlan({ rank: v }); }} />
              </Field>
              <Field l={t('Commitment')}>
                <select className={input} value={plan.commitment} disabled={!mayEdit} onChange={(e) => savePlan({ commitment: e.target.value })}>
                  {COMMITMENTS.map((c) => <option key={c} value={c}>{t(COMMITMENT_META[c].label)}</option>)}
                </select>
              </Field>
              <Field l={t('Effort low (person-weeks)')}>
                <input type="number" min="0" step="0.5" className={input} defaultValue={plan.effortLow} disabled={!mayEdit} onBlur={(e) => Number(e.target.value) !== plan.effortLow && savePlan({ effortLow: Number(e.target.value) })} />
              </Field>
              <Field l={t('Effort high (person-weeks)')}>
                <input type="number" min="0" step="0.5" className={input} defaultValue={plan.effortHigh} disabled={!mayEdit} onBlur={(e) => Number(e.target.value) !== plan.effortHigh && savePlan({ effortHigh: Number(e.target.value) })} />
              </Field>
              <Field l={t('How sure is the team about this estimate?')}>
                <select className={input} value={plan.confidence} disabled={!mayEdit} onChange={(e) => savePlan({ confidence: e.target.value })}>
                  {CONFIDENCE.map((c) => <option key={c} value={c}>{t(CONFIDENCE_META[c].label)}</option>)}
                </select>
              </Field>
              <div className="flex items-end gap-3">
                <CommitmentPill value={plan.commitment} />
                {mayEdit && <button className={btn.danger} onClick={() => locked ? setReasonFor({ remove: true, title: t('Quarter is locked: reason for removing this epic') }) : run('removePlan', plan.id)}>{t('Remove from quarter')}</button>}
              </div>
            </div>
          )}
        </section>

        {/* Dependencies */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">{t('Asks to other teams')} ({deps.length})</h3>
            {mayEdit && <button className={btn.secondary} onClick={() => setShowAsk(true)}>{t('+ Ask a team')}</button>}
          </div>
          {deps.length === 0 ? <Empty>{t('No dependencies in this quarter.')}</Empty> : (
            <ul className="space-y-2">
              {deps.map((d) => {
                const prov = state.teams.find((x) => x.id === d.providerTeamId);
                return (
                  <li key={d.id} className="border rounded p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-gray-500">{d.refCode} → {prov?.name}</span>
                      <ResponsePill value={d.response} />
                    </div>
                    <div>{d.ask} <span className="text-gray-500">({d.effortLow}–{d.effortHigh} pw)</span></div>
                    {d.respondedAt && <div className="text-xs text-gray-600 mt-1">{t('Answered {date}', { date: fmtDate(d.respondedAt) })}{(() => { const ev = state.events.filter((x) => x.entityId === d.id && x.action === 'dependency_answered').sort((a, b) => b.at.localeCompare(a.at))[0]; return ev?.actorName ? ` ${t('by {name}', { name: ev.actorName })}` : ''; })()}{['declined', 'deferred', 'needs_priority_call'].includes(d.response) && (d.acknowledgedAt ? ` · ${t('acknowledged')}` : mayEdit ? <> · <button className="text-indigo-700 hover:underline" onClick={() => run('acknowledgeDependency', d.id)}>{t('Acknowledge')}</button></> : '')}</div>}
                    {d.responseReason && <div className="text-xs text-gray-700 mt-1">{t('Answer:')} {d.responseReason}{d.deferredToQuarterId && ` (${t('to {quarter}', { quarter: quarterLabel(state.quarters.find((q) => q.id === d.deferredToQuarterId)) })})`}</div>}
                    {timingConflict(state, d) && <div className="text-xs text-red-700 mt-1">▲ {t("Timing conflict: needed after the epic's planned quarter")}</div>}
                    {d.response === 'proposed' && <div className="text-xs text-gray-500 mt-1">{t('No answer yet')} · {t('{n} days', { n: daysSince(d.createdAt) })}</div>}
                    {d.neededBy && <div className="text-xs text-gray-600">{t('Needed by {date}', { date: fmtDate(d.neededBy) })}</div>}
                    {d.response === 'partial' && d.grantedHigh != null && <div className="text-xs text-lime-800">{t('Granted {gl}–{gh} pw of {el}–{eh}', { gl: d.grantedLow, gh: d.grantedHigh, el: d.effortLow, eh: d.effortHigh })}</div>}
                    {mayEdit && <div className="flex gap-3 mt-1"><button className={btn.ghost} onClick={() => setEditAsk(d)}>{t('Edit ask')}</button><button className={btn.danger} onClick={() => setRemoveAsk(d)}>{t('Remove ask')}</button></div>}
                  </li>
                );
              })}
            </ul>
          )}
          {incoming.length > 0 && <p className="text-xs text-gray-500 mt-2">{t('Team {team} also has {n} incoming ask(s) this quarter — see Dependencies.', { team: team?.name, n: incoming.length })}</p>}
        </section>

        {/* Check-ins */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">{t('Check-ins')}</h3>
            {canWriteTeam(actor, epic.teamId) && <button className={btn.secondary} onClick={() => setShowCheckIn(true)}>{t('+ Check-in')}</button>}
          </div>
          {!ci ? <Empty>{t('No check-in yet.')}</Empty> : (
            <ul className="space-y-1 text-sm">
              {state.checkIns.filter((c) => c.epicId === epic.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((c) => (
                <li key={c.id} className="flex gap-2"><ConfidenceMark value={c.confidence} /><span className="text-gray-500 text-xs">{t('{n}d ago', { n: daysSince(c.createdAt) })} · {c.authorName}</span><span>{c.note}</span></li>
              ))}
            </ul>
          )}
        </section>

        {/* History */}
        <section>
          <h3 className="font-semibold text-sm mb-2">{t('History')}</h3>
          {history.length === 0 ? <Empty>{t('No changes recorded.')}</Empty> : (
            <ul className="space-y-1 text-xs text-gray-700">
              {history.slice(0, 12).map((e) => (
                <li key={e.id}><span className="text-gray-600">{fmtDate(e.at)} · {e.actorName || t('system')}</span> — {describeEvent(e, t)}{e.reason && <span className="italic"> — "{e.reason}"</span>}</li>
              ))}
            </ul>
          )}
        </section>
        {mayEdit && <div className="border-t pt-3"><button className={btn.danger} onClick={() => setConfirmDelete(true)}>{t('Delete epic…')}</button></div>}
      </div>

      {reasonFor && <ReasonPrompt title={reasonFor.title} onClose={() => setReasonFor(null)} onSubmit={(reason) => reasonFor.remove ? run('removePlan', plan.id, reason) : savePlan(reasonFor.patch, reason)} />}
      {editAsk && <Modal title={t('Edit ask {ref}', { ref: editAsk.refCode })} onClose={() => setEditAsk(null)}><DependencyForm epic={epic} existing={editAsk} onDone={() => setEditAsk(null)} /></Modal>}
      {removeAsk && <ReasonPrompt title={t('Remove ask {ref}', { ref: removeAsk.refCode })} hint={locked ? t('The quarter is locked; a reason is required.') : t('Optional reason, kept in history.')} submitLabel={t('Remove')} onClose={() => setRemoveAsk(null)} onSubmit={(reason) => run('deleteDependency', removeAsk.id, reason)} />}
      {confirmDelete && (
        <Modal title={t('Delete {ref}?', { ref: epic.refCode })} onClose={() => setConfirmDelete(false)}>
          <p className="text-sm">{t('This removes the epic, {plans} quarter plan(s), {asks} ask(s), {checkins} check-in(s) and {impediments} impediment(s). History entries are kept.', { plans: state.plans.filter((p) => p.epicId === epic.id).length, asks: state.dependencies.filter((d) => d.epicId === epic.id).length, checkins: state.checkIns.filter((c) => c.epicId === epic.id).length, impediments: state.impediments.filter((i) => i.epicId === epic.id).length })}</p>
          <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={() => setConfirmDelete(false)}>{t('Cancel')}</button><button className="bg-red-600 text-white text-sm px-3 py-1.5 rounded hover:bg-red-700" onClick={async () => { await run('deleteEpic', epic.id); onClose(); }}>{t('Delete epic')}</button></div>
        </Modal>
      )}
      {showAsk && <Modal title={t('Ask a team for {ref}', { ref: epic.refCode })} onClose={() => setShowAsk(false)}><DependencyForm epic={epic} onDone={() => setShowAsk(false)} /></Modal>}
      {showCheckIn && <CheckInForm epic={epic} onClose={() => setShowCheckIn(false)} />}
    </aside>
  );
}

function CheckInForm({ epic, onClose }) {
  const { run, quarter } = usePlan();
  const t = useT();
  const [confidence, setConfidence] = useState('medium');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  return (
    <Modal title={t('Check-in: {title}', { title: epic.title })} onClose={onClose}>
      <div className="flex gap-2 mb-3">
        {CONFIDENCE.map((c) => <button key={c} className={`${btn.secondary} ${confidence === c ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setConfidence(c)}>{t(CONFIDENCE_META[c].label)}</button>)}
      </div>
      <input className={input} placeholder={t('One line (optional)')} value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>{t('Cancel')}</button>
        <button className={btn.primary} onClick={async () => { const r = await run('addCheckIn', { epicId: epic.id, quarterId: quarter.id, confidence, note }); if (r.ok) onClose(); else setErr(r.error); }}>{t('Save')}</button>
      </div>
    </Modal>
  );
}

// Human-readable history line (review: PO).
export function describeEvent(e, t) {
  const fmt = (v) => (v == null ? '–' : String(v).replace(/_/g, ' '));
  switch (e.action) {
    case 'rank_changed': return t('strategic rank {from} → {to}', { from: fmt(e.before?.rank ?? e.before?.strategic_rank), to: fmt(e.after?.rank ?? e.after?.strategic_rank) });
    case 'commitment_changed': return t('commitment {from} → {to}', { from: fmt(e.before?.commitment), to: fmt(e.after?.commitment) });
    case 'effort_changed': return t('effort {fl}–{fh} → {tl}–{th} pw', { fl: e.before?.effortLow, fh: e.before?.effortHigh, tl: e.after?.effortLow, th: e.after?.effortHigh });
    case 'dependency_answered': return t('answer {from} → {to}', { from: fmt(e.before?.response), to: fmt(e.after?.response) }) + (e.after?.grantedHigh != null ? ` (${t('granted {low}–{high} pw', { low: e.after.grantedLow, high: e.after.grantedHigh })})` : '');
    case 'dependency_added': return t('ask sent: {ask}', { ask: e.after?.ask ?? '' });
    case 'dependency_edited': return t('ask edited ({fl}–{fh} → {tl}–{th} pw)', { fl: e.before?.effortLow, fh: e.before?.effortHigh, tl: e.after?.effortLow, th: e.after?.effortHigh });
    case 'dependency_removed': return t('ask removed');
    case 'dependency_acknowledged': return t('answer "{answer}" acknowledged', { answer: fmt(e.after?.response) });
    case 'plan_added': return t('added to the quarter');
    case 'plan_removed': return t('removed from the quarter');
    case 'phase_changed': return t('phase {from} → {to}', { from: fmt(e.before?.phase), to: fmt(e.after?.phase) });
    default: return e.action.replace(/_/g, ' ');
  }
}
