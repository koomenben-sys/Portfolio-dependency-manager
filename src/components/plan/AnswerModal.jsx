import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { RESPONSE_META, quarterLabel } from '../../domain/model';
import { simulateAsk } from '../../domain/capacity';
import { useT } from '../../i18n';
import { Modal, Field, input, btn, ErrorNote } from './ui';

// Provider answers an ask (AC C3). Partial asks for the granted effort; defer asks for a quarter.
export function AnswerModal({ dep, onClose }) {
  const { state, run } = usePlan();
  const t = useT();
  const [response, setResponse] = useState(dep.response === 'proposed' ? 'accepted' : dep.response);
  const [reason, setReason] = useState(dep.responseReason || '');
  const [to, setTo] = useState(dep.deferredToQuarterId || '');
  const [granted, setGranted] = useState({ low: dep.grantedLow ?? 0, high: dep.grantedHigh ?? '' });
  const [err, setErr] = useState(null);
  const later = state.quarters.filter((q) => q.id !== dep.quarterId && q.phase !== 'closed');
  const epic = state.epics.find((e) => e.id === dep.epicId);
  const sim = simulateAsk(state, dep, { response, grantedLow: granted.low === '' ? null : Number(granted.low), grantedHigh: granted.high === '' ? null : Number(granted.high) });
  return (
    <Modal title={t('Answer {ref}', { ref: dep.refCode })} onClose={onClose}>
      <p className="text-sm mb-1"><b>{epic?.refCode} {epic?.title}</b> {t('asks:')} {dep.ask} <span className="text-muted">({dep.effortLow}–{dep.effortHigh} pw{dep.neededBy ? `, ${t('needed by {date}', { date: new Date(dep.neededBy).toLocaleDateString('nl-NL') })}` : ''})</span></p>
      {dep.ifDeclined && <p className="text-xs text-muted mb-1">{t('If declined:')} {dep.ifDeclined}</p>}
      <p className="text-xs text-muted mb-3">{t('Contact:')} {dep.requesterName || epic?.ownerName || '–'} · {t("With this answer your team's ranked load becomes {total} of {available} pw", { total: sim.total, available: sim.available })}{sim.item ? (sim.fits ? <span className="text-emerald-700"> — {t('the ask fits at rank {rank} (cum. {cum})', { rank: sim.item.rank ?? '–', cum: sim.cum })}</span> : <span className="text-red-700 font-medium"> — {t('the ask lands below the cut line (cum. {cum})', { cum: sim.cum })}</span>) : ''}{sim.pushed.length > 0 && <span className="text-amber-900"> — {t('pushes {refs} below the cut line', { refs: sim.pushed.map((id) => state.epics.find((e) => e.id === id)?.refCode).join(', ') })}</span>}</p>
      <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label={t('Answer')}>
        {['accepted', 'partial', 'deferred', 'declined', 'needs_priority_call'].map((r) => (
          <button key={r} role="radio" aria-checked={response === r} className={`${btn.secondary} ${response === r ? 'ring-2 ring-accent' : ''}`} onClick={() => setResponse(r)}>{RESPONSE_META[r].icon} {t(RESPONSE_META[r].label)}</button>
        ))}
      </div>
      {response === 'partial' && (
        <div className="grid grid-cols-2 gap-3 mb-2">
          <Field l={t('Granted low (pw)')}><input type="number" min="0" step="0.5" className={input} value={granted.low} onChange={(e) => setGranted({ ...granted, low: e.target.value })} /></Field>
          <Field l={t('Granted high (pw)')}><input type="number" min="0" step="0.5" className={input} value={granted.high} onChange={(e) => setGranted({ ...granted, high: e.target.value })} /></Field>
        </div>
      )}
      {response === 'deferred' && <Field l={t('Defer to quarter')}><select className={input} value={to} onChange={(e) => setTo(e.target.value)}><option value="">{t('— choose —')}</option>{later.map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}</option>)}</select></Field>}
      <div className="mt-2"><Field l={response === 'accepted' ? t('Note (optional)') : t('Reason (required, the requester sees it)')}><textarea className={input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
      {response === 'needs_priority_call' && <p className="text-xs text-amber-800 mt-1">{t("This puts the ask on the session's discussion queue automatically.")}</p>}
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>{t('Cancel')}</button>
        <button className={btn.primary} onClick={async () => {
          const r = await run('answerDependency', dep.id, { response, reason, deferredToQuarterId: to || null, grantedLow: granted.low === '' ? null : Number(granted.low), grantedHigh: granted.high === '' ? null : Number(granted.high) });
          if (r.ok) onClose(); else setErr(r.error);
        }}>{t('Send answer')}</button>
      </div>
    </Modal>
  );
}
