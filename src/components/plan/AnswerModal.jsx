import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { RESPONSE_META, quarterLabel } from '../../domain/model';
import { rankedLoad } from '../../domain/capacity';
import { Modal, Field, input, btn, ErrorNote } from './ui';

// Provider answers an ask (AC C3). Partial asks for the granted effort; defer asks for a quarter.
export function AnswerModal({ dep, onClose }) {
  const { state, run } = usePlan();
  const [response, setResponse] = useState(dep.response === 'proposed' ? 'accepted' : dep.response);
  const [reason, setReason] = useState(dep.responseReason || '');
  const [to, setTo] = useState(dep.deferredToQuarterId || '');
  const [granted, setGranted] = useState({ low: dep.grantedLow ?? '', high: dep.grantedHigh ?? '' });
  const [err, setErr] = useState(null);
  const later = state.quarters.filter((q) => q.id !== dep.quarterId && q.phase !== 'closed');
  const epic = state.epics.find((e) => e.id === dep.epicId);
  const { items, available } = rankedLoad(state, dep.providerTeamId, dep.quarterId);
  const used = items.reduce((s, i) => s + i.high, 0);
  const afterAccept = used + (dep.response === 'proposed' ? dep.effortHigh : 0);
  return (
    <Modal title={`Answer ${dep.refCode}`} onClose={onClose}>
      <p className="text-sm mb-1"><b>{epic?.refCode} {epic?.title}</b> asks: {dep.ask} <span className="text-gray-600">({dep.effortLow}–{dep.effortHigh} pw{dep.neededBy ? `, needed by ${new Date(dep.neededBy).toLocaleDateString('nl-NL')}` : ''})</span></p>
      {dep.ifDeclined && <p className="text-xs text-gray-600 mb-1">If declined: {dep.ifDeclined}</p>}
      <p className="text-xs text-gray-600 mb-3">Contact: {dep.requesterName || epic?.ownerName || '–'} · Your team's load after accepting in full: {Math.round(afterAccept * 10) / 10} of {available} pw{afterAccept > available ? <span className="text-red-700 font-medium"> (over capacity)</span> : ''}</p>
      <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label="Answer">
        {['accepted', 'partial', 'deferred', 'declined', 'needs_priority_call'].map((r) => (
          <button key={r} role="radio" aria-checked={response === r} className={`${btn.secondary} ${response === r ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setResponse(r)}>{RESPONSE_META[r].icon} {RESPONSE_META[r].label}</button>
        ))}
      </div>
      {response === 'partial' && (
        <div className="grid grid-cols-2 gap-3 mb-2">
          <Field l="Granted low (pw)"><input type="number" min="0" step="0.5" className={input} value={granted.low} onChange={(e) => setGranted({ ...granted, low: e.target.value })} /></Field>
          <Field l="Granted high (pw)"><input type="number" min="0" step="0.5" className={input} value={granted.high} onChange={(e) => setGranted({ ...granted, high: e.target.value })} /></Field>
        </div>
      )}
      {response === 'deferred' && <Field l="Defer to quarter"><select className={input} value={to} onChange={(e) => setTo(e.target.value)}><option value="">— choose —</option>{later.map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}</option>)}</select></Field>}
      <div className="mt-2"><Field l={response === 'accepted' ? 'Note (optional)' : 'Reason (required, the requester sees it)'}><textarea className={input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
      {response === 'needs_priority_call' && <p className="text-xs text-amber-800 mt-1">This puts the ask on the session's discussion queue automatically.</p>}
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>Cancel</button>
        <button className={btn.primary} onClick={async () => {
          const r = await run('answerDependency', dep.id, { response, reason, deferredToQuarterId: to || null, grantedLow: granted.low === '' ? null : Number(granted.low), grantedHigh: granted.high === '' ? null : Number(granted.high) });
          if (r.ok) onClose(); else setErr(r.error);
        }}>Send answer</button>
      </div>
    </Modal>
  );
}
