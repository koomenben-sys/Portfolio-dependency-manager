import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { quarterLabel } from '../../domain/model';
import { Field, input, btn, ErrorNote } from './ui';

// Request a dependency from another team (AC C1).
export function DependencyForm({ epic, onDone }) {
  const { state, quarter, run } = usePlan();
  const others = state.teams.filter((t) => t.id !== epic.teamId);
  const [form, setForm] = useState({ providerTeamId: others[0]?.id, quarterId: quarter.id, ask: '', ifDeclined: '', effortLow: 1, effortHigh: 2 });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field l="Team we need"><select className={input} value={form.providerTeamId} onChange={set('providerTeamId')}>{others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field l="Needed in quarter"><select className={input} value={form.quarterId} onChange={set('quarterId')}>{state.quarters.filter((q) => q.phase !== 'closed').map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}</option>)}</select></Field>
        <Field l="Effort low (pw)"><input type="number" min="0" step="0.5" className={input} value={form.effortLow} onChange={set('effortLow')} /></Field>
        <Field l="Effort high (pw)"><input type="number" min="0" step="0.5" className={input} value={form.effortHigh} onChange={set('effortHigh')} /></Field>
      </div>
      <Field l="What do we need?"><textarea className={input} rows={2} value={form.ask} onChange={set('ask')} autoFocus /></Field>
      <Field l="What happens if they say no? (optional)"><input className={input} value={form.ifDeclined} onChange={set('ifDeclined')} /></Field>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2">
        <button className={btn.secondary} onClick={onDone}>Cancel</button>
        <button className={btn.primary} onClick={async () => { const r = await run('addDependency', { epicId: epic.id, ...form }); if (r.ok) onDone(); else setErr(r.error); }}>Send ask</button>
      </div>
    </div>
  );
}
