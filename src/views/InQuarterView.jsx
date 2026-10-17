import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam, isPlanner } from '../data/repository';
import { latestCheckIn, isStale, daysSince, teamPlans } from '../domain/plan';
import { quarterLabel, ROAM, IMPEDIMENT_AGING_DAYS, CONFIDENCE } from '../domain/model';
import { Panel, btn, input, Field, Modal, ErrorNote, Empty, ConfidenceMark, CommitmentPill } from '../components/plan/ui';
import { NoQuarter } from '../components/plan/NoQuarter';
import { EpicPanel } from '../components/plan/EpicPanel';

// In-quarter: quick check-ins, impediments/risks, stale panel (AC F1-F3).
export function InQuarterView() {
  const { state, actor, quarter, run } = usePlan();
  const [openEpic, setOpenEpic] = useState(null);
  const [raise, setRaise] = useState(false);
  const [quick, setQuick] = useState(null); // epic for quick check-in
  const [err, setErr] = useState(null);
  if (!quarter) return <NoQuarter />;
  const active = quarter.phase === 'active';
  const open = state.impediments.filter((i) => i.status === 'open');
  const resolved = state.impediments.filter((i) => i.status === 'resolved');
  const epicsById = new Map(state.epics.map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">In-quarter · {quarterLabel(quarter)}</h2>
        {!active && <span className="text-xs bg-gray-100 border rounded px-2 py-0.5">Stale flags apply only while the quarter is active (now: {quarter.phase})</span>}
      </div>
      <ErrorNote error={err} />

      <Panel title="Check-ins per team" right={<span className="text-xs text-gray-500">cadence {state.settings.staleDays} days</span>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.teams.map((t) => {
            const plans = teamPlans(state, t.id, quarter.id).filter((p) => p.commitment !== 'not_committed');
            if (!plans.length) return null;
            const mayEdit = canWriteTeam(actor, t.id);
            return (
              <div key={t.id}>
                <h4 className="font-semibold text-sm mb-1">{t.name}</h4>
                <ul className="space-y-1 text-sm">
                  {plans.map((p) => { const e = epicsById.get(p.epicId); const ci = latestCheckIn(state, e.id); const st = active ? isStale(state, e.id) : null; return (
                    <li key={p.id} className={`flex items-center gap-2 rounded px-2 py-1 ${st ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <button className="flex-1 text-left truncate hover:underline" onClick={() => setOpenEpic(e.id)}>{e.refCode} {e.title}</button>
                      <CommitmentPill value={p.commitment} size="xs" />
                      {ci ? <span className="text-xs text-gray-600 whitespace-nowrap"><ConfidenceMark value={ci.confidence} /> {daysSince(ci.createdAt)}d</span> : <span className="text-xs text-amber-900">no check-in yet</span>}
                      {st && <span className="text-xs text-red-700 whitespace-nowrap">▲ {st.days == null ? 'never' : `${st.days}d`}</span>}
                      {mayEdit && <button className="text-xs text-indigo-700 hover:underline" aria-label={`Check in on ${e.refCode}`} onClick={() => setQuick(e)}>check-in</button>}
                    </li>); })}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title={`Impediments and risks (${open.length} open)`} right={isPlanner(actor) && <button className={btn.secondary} onClick={() => setRaise(true)}>+ Raise</button>}>
        {open.length === 0 ? <Empty>Nothing open.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 text-left"><tr><th className="py-1">Ref</th><th>Kind</th><th>Title</th><th>Epic</th><th>Owner</th><th>ROAM</th><th>Age</th><th></th></tr></thead>
            <tbody>{open.sort((a, b) => a.raisedAt.localeCompare(b.raisedAt)).map((i) => { const e = epicsById.get(i.epicId); const age = daysSince(i.raisedAt); return (
              <tr key={i.id} className="border-t">
                <td className="py-1.5 font-mono text-xs">{i.refCode}</td>
                <td className="py-1.5 text-xs">{i.kind}</td>
                <td className="py-1.5">{i.title}</td>
                <td className="py-1.5 text-xs"><button className="hover:underline" onClick={() => e && setOpenEpic(e.id)}>{e?.refCode}</button></td>
                <td className="py-1.5 text-xs">{i.ownerName}</td>
                <td className="py-1.5 text-xs">{i.kind === 'risk' ? (isPlanner(actor) ? <select className={`${input} !w-auto !py-0`} value={i.roam || ''} onChange={(ev) => run('upsertImpediment', { id: i.id, roam: ev.target.value || null })}><option value="">–</option>{ROAM.map((r) => <option key={r} value={r}>{r}</option>)}</select> : i.roam || '–') : '–'}</td>
                <td className={`py-1.5 text-xs whitespace-nowrap ${age > IMPEDIMENT_AGING_DAYS ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{age}d{age > IMPEDIMENT_AGING_DAYS && ' ▲ aging'}</td>
                <td className="py-1.5">{isPlanner(actor) && <button className={btn.ghost} onClick={async () => { const r = await run('resolveImpediment', i.id); setErr(r.ok ? null : r.error); }}>Resolve</button>}</td>
              </tr>); })}</tbody>
          </table>
        )}
        {resolved.length > 0 && <details className="mt-3 text-xs text-gray-600"><summary>{resolved.length} resolved</summary><ul className="mt-1 space-y-0.5">{resolved.map((i) => <li key={i.id}>{i.refCode} {i.title} — resolved {new Date(i.resolvedAt).toLocaleDateString()}</li>)}</ul></details>}
      </Panel>

      {quick && <QuickCheckIn epic={quick} onClose={() => setQuick(null)} />}
      {raise && <RaiseImpediment onClose={() => setRaise(false)} />}
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}

function QuickCheckIn({ epic, onClose }) {
  const { run, quarter } = usePlan();
  const [confidence, setConfidence] = useState('medium');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  return (
    <Modal title={`Check-in · ${epic.title}`} onClose={onClose}>
      <div className="flex gap-2 mb-3">{CONFIDENCE.map((c) => <button key={c} className={`${btn.secondary} ${confidence === c ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setConfidence(c)}>{c}</button>)}</div>
      <input className={input} placeholder="One line (optional)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={onClose}>Cancel</button><button className={btn.primary} onClick={async () => { const r = await run('addCheckIn', { epicId: epic.id, quarterId: quarter.id, confidence, note }); if (r.ok) onClose(); else setErr(r.error); }}>Save</button></div>
    </Modal>
  );
}

function RaiseImpediment({ onClose }) {
  const { state, quarter, run, actor } = usePlan();
  const plans = state.plans.filter((p) => p.quarterId === quarter.id);
  const [form, setForm] = useState({ kind: 'impediment', title: '', epicId: plans[0]?.epicId || '', ownerName: actor.name, roam: null });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Raise an impediment or risk" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field l="Kind"><select className={input} value={form.kind} onChange={set('kind')}><option value="impediment">Impediment (in-quarter blocker)</option><option value="risk">Risk (planning, ROAM)</option></select></Field>
        <Field l="Owner"><input className={input} value={form.ownerName} onChange={set('ownerName')} /></Field>
      </div>
      <div className="mt-2"><Field l="Title"><input className={input} value={form.title} onChange={set('title')} autoFocus /></Field></div>
      <div className="mt-2"><Field l="Epic"><select className={input} value={form.epicId} onChange={set('epicId')}>{plans.map((p) => { const e = state.epics.find((x) => x.id === p.epicId); return <option key={p.id} value={e.id}>{e.refCode} {e.title}</option>; })}</select></Field></div>
      {form.kind === 'risk' && <div className="mt-2"><Field l="ROAM"><select className={input} value={form.roam || ''} onChange={(e) => setForm({ ...form, roam: e.target.value || null })}><option value="">–</option>{ROAM.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field></div>}
      {plans.length === 0 && <p className="text-xs text-amber-900 mt-2">Plan an epic in this quarter first; impediments are linked to an epic.</p>}
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={onClose}>Cancel</button><button className={btn.primary} disabled={!form.epicId} onClick={async () => { const r = await run('upsertImpediment', { ...form, roam: form.kind === 'risk' ? form.roam : null }); if (r.ok) onClose(); else setErr(r.error); }}>Raise</button></div>
    </Modal>
  );
}
