import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { quarterLabel, isLockedPhase } from '../../domain/model';
import { useT } from '../../i18n';
import { Field, input, btn, ErrorNote } from './ui';

// Request a dependency from another team, or edit an existing ask (AC C1). No prefilled effort (review: PO).
export function DependencyForm({ epic, existing = null, onDone }) {
  const { state, quarter, run } = usePlan();
  const t = useT();
  const others = state.teams.filter((t) => t.id !== epic.teamId);
  const [form, setForm] = useState(existing
    ? { providerTeamId: existing.providerTeamId, quarterId: existing.quarterId, ask: existing.ask, ifDeclined: existing.ifDeclined, effortLow: existing.effortLow, effortHigh: existing.effortHigh, neededBy: existing.neededBy || '', reason: '' }
    : { providerTeamId: others[0]?.id, quarterId: quarter.id, ask: '', ifDeclined: '', effortLow: '', effortHigh: '', neededBy: '', reason: '' });
  const [err, setErr] = useState(null);
  const locked = isLockedPhase(state.quarters.find((q) => q.id === form.quarterId)?.phase);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async () => {
    const payload = { ...form, effortLow: Number(form.effortLow || 0), effortHigh: Number(form.effortHigh || 0), neededBy: form.neededBy || null };
    const r = existing
      ? await run('updateDependency', existing.id, { ask: payload.ask, ifDeclined: payload.ifDeclined, effortLow: payload.effortLow, effortHigh: payload.effortHigh, neededBy: payload.neededBy, reason: payload.reason })
      : await run('addDependency', { epicId: epic.id, ...payload });
    if (r.ok) onDone(); else setErr(r.error);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field l={t('Team we need')}><select className={input} value={form.providerTeamId} disabled={!!existing} onChange={set('providerTeamId')}>{others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field l={t('Needed in quarter')}><select className={input} value={form.quarterId} disabled={!!existing} onChange={set('quarterId')}>{state.quarters.filter((q) => q.phase !== 'closed').map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}</option>)}</select></Field>
        <Field l={t('Effort low (person-weeks)')}><input type="number" min="0" step="0.5" className={input} value={form.effortLow} onChange={set('effortLow')} placeholder={t('e.g. 2')} /></Field>
        <Field l={t('Effort high (person-weeks)')}><input type="number" min="0" step="0.5" className={input} value={form.effortHigh} onChange={set('effortHigh')} placeholder={t('e.g. 3')} /></Field>
        <Field l={t('Needed by (optional date within the quarter)')}><input type="date" className={input} value={form.neededBy} onChange={set('neededBy')} /></Field>
        <div className="text-xs text-muted self-end pb-1">{t('Contact:')} {epic.ownerName || t('epic owner not set')}</div>
      </div>
      <Field l={t('What do we need? (required)')}><textarea className={input} rows={2} value={form.ask} onChange={set('ask')} /></Field>
      <Field l={t('What happens if they say no? (optional, helps the provider decide)')}><input className={input} value={form.ifDeclined} onChange={set('ifDeclined')} /></Field>
      {(existing || locked) && <Field l={locked ? t('Reason (quarter is locked)') : t('Reason for the change (optional, kept in history)')}><input className={input} value={form.reason} onChange={set('reason')} /></Field>}
      {existing && existing.response !== 'proposed' && <p className="text-xs text-amber-800">{t('Changing the ask text or effort sends it back to {team} for a new answer.', { team: state.teams.find((t) => t.id === existing.providerTeamId)?.name })}</p>}
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2">
        <button className={btn.secondary} onClick={onDone}>{t('Cancel')}</button>
        <button className={btn.primary} onClick={submit}>{existing ? t('Save changes') : t('Send ask')}</button>
      </div>
    </div>
  );
}
