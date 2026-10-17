import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { canWriteTeam, canRank } from '../../data/repository';
import { COMMITMENTS, COMMITMENT_META, CONFIDENCE, RESPONSE_META, quarterLabel, isLockedPhase } from '../../domain/model';
import { planFor, epicDeps, latestCheckIn, daysSince, changedSinceBaseline, timingConflict } from '../../domain/plan';
import { CommitmentPill, ResponsePill, ConfidenceMark, Field, input, btn, ErrorNote, ReasonPrompt, Modal, Empty, fmtDate } from './ui';
import { DependencyForm } from './DependencyForm';

// Side panel for one epic: edit, plan for the selected quarter, dependencies, check-ins, history.
export function EpicPanel({ epicId, onClose }) {
  const { state, actor, quarter, run } = usePlan();
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
  const team = state.teams.find((t) => t.id === epic.teamId);
  const theme = state.themes.find((t) => t.id === epic.themeId);
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
    if (needsReason && !reason) { setReasonFor({ patch, title: patch.rank !== undefined ? 'Reason for changing the strategic rank' : 'Quarter is locked: reason for this change' }); return { ok: true }; }
    const r = await run('upsertPlan', { id: plan?.id, epicId: epic.id, quarterId: quarter.id, ...patch }, reason);
    setErr(r.ok ? null : r.error);
    return r;
  };

  return (
    <aside role="dialog" aria-modal="false" aria-label={`${epic.refCode} ${epic.title}`} className="fixed right-0 top-0 h-full w-[520px] max-w-[95vw] bg-white shadow-2xl border-l border-gray-200 z-30 overflow-y-auto">
      <header className="sticky top-0 bg-white border-b px-4 py-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-mono text-gray-500">{epic.refCode} · {team?.name}{epic.externalSource && <> · <a className="text-indigo-700 hover:underline" href={epic.externalUrl} target="_blank" rel="noreferrer">Open in Azure DevOps ↗</a></>}</div>
          {mayEdit && !epic.externalSource ? (
            <input className="text-lg font-semibold w-full border-b border-transparent focus:border-indigo-400 focus:outline-none" defaultValue={epic.title} onBlur={(e) => e.target.value !== epic.title && saveEpic({ title: e.target.value })} />
          ) : <h2 className="text-lg font-semibold">{epic.title}</h2>}
          {epic.externalSource && <p className="text-xs text-gray-600">Title and state come from Azure DevOps (read-only){epic.externalState ? `, state there: ${epic.externalState}` : ''}{epic.externalSyncedAt ? `, last synced ${fmtDate(epic.externalSyncedAt)}` : ', not synced yet'}. Rank, effort, commitment and asks live only here.</p>}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-xl leading-none" aria-label="Close">×</button>
      </header>

      <div className="p-4 space-y-5">
        <ErrorNote error={err} />
        {changed && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1">Changed since the plan was locked — see the Session diff.</p>}

        {/* Epic attributes */}
        <section className="grid grid-cols-2 gap-3">
          <Field l="Team">
            <select className={input} value={epic.teamId} disabled={!mayEdit} onChange={(e) => saveEpic({ teamId: e.target.value })}>
              {state.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field l="Strategic theme">
            <select className={input} value={epic.themeId || ''} disabled={!mayEdit && !mayRank} onChange={(e) => saveEpic({ themeId: e.target.value || null })}>
              <option value="">— unaligned —</option>
              {state.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field l="Program / portfolio label (used as a filter)">
            <input className={input} defaultValue={epic.label} disabled={!mayEdit} onBlur={(e) => e.target.value !== epic.label && saveEpic({ label: e.target.value })} />
          </Field>
          <Field l="Owner">
            <input className={input} defaultValue={epic.ownerName} disabled={!mayEdit} onBlur={(e) => e.target.value !== epic.ownerName && saveEpic({ ownerName: e.target.value })} />
          </Field>
          <Field l="Regulatory">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={epic.regulatory} disabled={!mayEdit} onChange={(e) => saveEpic({ regulatory: e.target.checked })} /> Regulatory / compliance</label>
          </Field>
          <Field l="Deadline">
            <input type="date" className={input} value={epic.regulatoryDeadline || ''} disabled={!mayEdit || !epic.regulatory} onChange={(e) => saveEpic({ regulatoryDeadline: e.target.value || null })} />
          </Field>
          {epic.regulatory && <div className="col-span-2"><Field l="Regulation / regulator (e.g. DORA (DNB), AVG, IFRS 17)"><input className={input} defaultValue={epic.regulation || ''} disabled={!mayEdit} onBlur={(e) => e.target.value !== (epic.regulation || '') && saveEpic({ regulation: e.target.value })} /></Field></div>}
        </section>

        {/* Plan for the selected quarter */}
        <section>
          <h3 className="font-semibold text-sm mb-2">Plan for {quarterLabel(quarter)}</h3>
          {!plan ? (
            <div className="flex items-center gap-3">
              <Empty>Not planned in this quarter.</Empty>
              {mayEdit && <button className={btn.secondary} onClick={() => savePlan({ commitment: 'draft', effortLow: 0, effortHigh: 0 })}>Add to this quarter</button>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field l="Strategic rank (top-down)">
                <input type="number" min="1" className={input} defaultValue={plan.rank ?? ''} disabled={!mayRank} title={mayRank ? '' : 'Needs rank permission'}
                  onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== plan.rank) savePlan({ rank: v }); }} />
              </Field>
              <Field l="Commitment">
                <select className={input} value={plan.commitment} disabled={!mayEdit} onChange={(e) => savePlan({ commitment: e.target.value })}>
                  {COMMITMENTS.map((c) => <option key={c} value={c}>{COMMITMENT_META[c].label}</option>)}
                </select>
              </Field>
              <Field l="Effort low (person-weeks)">
                <input type="number" min="0" step="0.5" className={input} defaultValue={plan.effortLow} disabled={!mayEdit} onBlur={(e) => Number(e.target.value) !== plan.effortLow && savePlan({ effortLow: Number(e.target.value) })} />
              </Field>
              <Field l="Effort high (person-weeks)">
                <input type="number" min="0" step="0.5" className={input} defaultValue={plan.effortHigh} disabled={!mayEdit} onBlur={(e) => Number(e.target.value) !== plan.effortHigh && savePlan({ effortHigh: Number(e.target.value) })} />
              </Field>
              <Field l="How sure is the team about this estimate?">
                <select className={input} value={plan.confidence} disabled={!mayEdit} onChange={(e) => savePlan({ confidence: e.target.value })}>
                  {CONFIDENCE.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <div className="flex items-end gap-3">
                <CommitmentPill value={plan.commitment} />
                {mayEdit && <button className={btn.danger} onClick={() => locked ? setReasonFor({ remove: true, title: 'Quarter is locked: reason for removing this epic' }) : run('removePlan', plan.id)}>Remove from quarter</button>}
              </div>
            </div>
          )}
        </section>

        {/* Dependencies */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Asks to other teams ({deps.length})</h3>
            {mayEdit && <button className={btn.secondary} onClick={() => setShowAsk(true)}>+ Ask a team</button>}
          </div>
          {deps.length === 0 ? <Empty>No dependencies in this quarter.</Empty> : (
            <ul className="space-y-2">
              {deps.map((d) => {
                const prov = state.teams.find((t) => t.id === d.providerTeamId);
                return (
                  <li key={d.id} className="border rounded p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-gray-500">{d.refCode} → {prov?.name}</span>
                      <ResponsePill value={d.response} />
                    </div>
                    <div>{d.ask} <span className="text-gray-500">({d.effortLow}–{d.effortHigh} pw)</span></div>
                    {d.respondedAt && <div className="text-xs text-gray-600 mt-1">Answered {fmtDate(d.respondedAt)}{(() => { const ev = state.events.filter((x) => x.entityId === d.id && x.action === 'dependency_answered').sort((a, b) => b.at.localeCompare(a.at))[0]; return ev?.actorName ? ` by ${ev.actorName}` : ''; })()}{['declined', 'deferred', 'needs_priority_call'].includes(d.response) && (d.acknowledgedAt ? ' · acknowledged' : mayEdit ? <> · <button className="text-indigo-700 hover:underline" onClick={() => run('acknowledgeDependency', d.id)}>Acknowledge</button></> : '')}</div>}
                    {d.responseReason && <div className="text-xs text-gray-700 mt-1">Answer: {d.responseReason}{d.deferredToQuarterId && ` (to ${quarterLabel(state.quarters.find((q) => q.id === d.deferredToQuarterId))})`}</div>}
                    {timingConflict(state, d) && <div className="text-xs text-red-700 mt-1">▲ Timing conflict: needed after the epic's planned quarter</div>}
                    {d.response === 'proposed' && <div className="text-xs text-gray-500 mt-1">No answer yet · {daysSince(d.createdAt)} days</div>}
                    {d.neededBy && <div className="text-xs text-gray-600">Needed by {fmtDate(d.neededBy)}</div>}
                    {d.response === 'partial' && d.grantedHigh != null && <div className="text-xs text-lime-800">Granted {d.grantedLow}–{d.grantedHigh} pw of {d.effortLow}–{d.effortHigh}</div>}
                    {mayEdit && <div className="flex gap-3 mt-1"><button className={btn.ghost} onClick={() => setEditAsk(d)}>Edit ask</button><button className={btn.danger} onClick={() => setRemoveAsk(d)}>Remove ask</button></div>}
                  </li>
                );
              })}
            </ul>
          )}
          {incoming.length > 0 && <p className="text-xs text-gray-500 mt-2">Team {team?.name} also has {incoming.length} incoming ask(s) this quarter — see Dependencies.</p>}
        </section>

        {/* Check-ins */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Check-ins</h3>
            {canWriteTeam(actor, epic.teamId) && <button className={btn.secondary} onClick={() => setShowCheckIn(true)}>+ Check-in</button>}
          </div>
          {!ci ? <Empty>No check-in yet.</Empty> : (
            <ul className="space-y-1 text-sm">
              {state.checkIns.filter((c) => c.epicId === epic.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((c) => (
                <li key={c.id} className="flex gap-2"><ConfidenceMark value={c.confidence} /><span className="text-gray-500 text-xs">{daysSince(c.createdAt)}d ago · {c.authorName}</span><span>{c.note}</span></li>
              ))}
            </ul>
          )}
        </section>

        {/* History */}
        <section>
          <h3 className="font-semibold text-sm mb-2">History</h3>
          {history.length === 0 ? <Empty>No changes recorded.</Empty> : (
            <ul className="space-y-1 text-xs text-gray-700">
              {history.slice(0, 12).map((e) => (
                <li key={e.id}><span className="text-gray-600">{fmtDate(e.at)} · {e.actorName || 'system'}</span> — {describeEvent(e)}{e.reason && <span className="italic"> — "{e.reason}"</span>}</li>
              ))}
            </ul>
          )}
        </section>
        {mayEdit && <div className="border-t pt-3"><button className={btn.danger} onClick={() => setConfirmDelete(true)}>Delete epic…</button></div>}
      </div>

      {reasonFor && <ReasonPrompt title={reasonFor.title} onClose={() => setReasonFor(null)} onSubmit={(reason) => reasonFor.remove ? run('removePlan', plan.id, reason) : savePlan(reasonFor.patch, reason)} />}
      {editAsk && <Modal title={`Edit ask ${editAsk.refCode}`} onClose={() => setEditAsk(null)}><DependencyForm epic={epic} existing={editAsk} onDone={() => setEditAsk(null)} /></Modal>}
      {removeAsk && <ReasonPrompt title={`Remove ask ${removeAsk.refCode}`} hint={locked ? 'The quarter is locked; a reason is required.' : 'Optional reason, kept in history.'} submitLabel="Remove" onClose={() => setRemoveAsk(null)} onSubmit={(reason) => run('deleteDependency', removeAsk.id, reason)} />}
      {confirmDelete && (
        <Modal title={`Delete ${epic.refCode}?`} onClose={() => setConfirmDelete(false)}>
          <p className="text-sm">This removes the epic, {state.plans.filter((p) => p.epicId === epic.id).length} quarter plan(s), {state.dependencies.filter((d) => d.epicId === epic.id).length} ask(s), {state.checkIns.filter((c) => c.epicId === epic.id).length} check-in(s) and {state.impediments.filter((i) => i.epicId === epic.id).length} impediment(s). History entries are kept.</p>
          <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={() => setConfirmDelete(false)}>Cancel</button><button className="bg-red-600 text-white text-sm px-3 py-1.5 rounded hover:bg-red-700" onClick={async () => { await run('deleteEpic', epic.id); onClose(); }}>Delete epic</button></div>
        </Modal>
      )}
      {showAsk && <Modal title={`Ask a team for ${epic.refCode}`} onClose={() => setShowAsk(false)}><DependencyForm epic={epic} onDone={() => setShowAsk(false)} /></Modal>}
      {showCheckIn && <CheckInForm epic={epic} onClose={() => setShowCheckIn(false)} />}
    </aside>
  );
}

function CheckInForm({ epic, onClose }) {
  const { run, quarter } = usePlan();
  const [confidence, setConfidence] = useState('medium');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  return (
    <Modal title={`Check-in: ${epic.title}`} onClose={onClose}>
      <div className="flex gap-2 mb-3">
        {CONFIDENCE.map((c) => <button key={c} className={`${btn.secondary} ${confidence === c ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setConfidence(c)}>{c}</button>)}
      </div>
      <input className={input} placeholder="One line (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>Cancel</button>
        <button className={btn.primary} onClick={async () => { const r = await run('addCheckIn', { epicId: epic.id, quarterId: quarter.id, confidence, note }); if (r.ok) onClose(); else setErr(r.error); }}>Save</button>
      </div>
    </Modal>
  );
}

// Human-readable history line (review: PO).
function describeEvent(e) {
  const fmt = (v) => (v == null ? '–' : String(v).replace(/_/g, ' '));
  switch (e.action) {
    case 'rank_changed': return `strategic rank ${fmt(e.before?.rank ?? e.before?.strategic_rank)} → ${fmt(e.after?.rank ?? e.after?.strategic_rank)}`;
    case 'commitment_changed': return `commitment ${fmt(e.before?.commitment)} → ${fmt(e.after?.commitment)}`;
    case 'effort_changed': return `effort ${e.before?.effortLow}–${e.before?.effortHigh} → ${e.after?.effortLow}–${e.after?.effortHigh} pw`;
    case 'dependency_answered': return `answer ${fmt(e.before?.response)} → ${fmt(e.after?.response)}${e.after?.grantedHigh != null ? ` (granted ${e.after.grantedLow}–${e.after.grantedHigh} pw)` : ''}`;
    case 'dependency_added': return `ask sent: ${e.after?.ask ?? ''}`;
    case 'dependency_edited': return `ask edited (${e.before?.effortLow}–${e.before?.effortHigh} → ${e.after?.effortLow}–${e.after?.effortHigh} pw)`;
    case 'dependency_removed': return 'ask removed';
    case 'dependency_acknowledged': return `answer "${fmt(e.after?.response)}" acknowledged`;
    case 'plan_added': return 'added to the quarter';
    case 'plan_removed': return 'removed from the quarter';
    case 'phase_changed': return `phase ${fmt(e.before?.phase)} → ${fmt(e.after?.phase)}`;
    default: return e.action.replace(/_/g, ' ');
  }
}
