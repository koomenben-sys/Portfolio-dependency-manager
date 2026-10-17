import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam, isPlanner } from '../data/repository';
import { latestCheckIn, isStale, daysSince, teamPlans } from '../domain/plan';
import { quarterLabel, ROAM, IMPEDIMENT_AGING_DAYS, CONFIDENCE, CONFIDENCE_META, PHASES } from '../domain/model';
import { useT } from '../i18n';
import { Panel, btn, input, Field, Modal, ErrorNote, Empty, ConfidenceMark, CommitmentPill } from '../components/plan/ui';
import { NoQuarter } from '../components/plan/NoQuarter';
import { EpicPanel } from '../components/plan/EpicPanel';

// In-quarter: quick check-ins, impediments/risks, stale panel (AC F1-F3).
export function InQuarterView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  const [raise, setRaise] = useState(false);
  const [quick, setQuick] = useState(null); // epic for quick check-in
  const [err, setErr] = useState(null);
  if (!quarter) return <NoQuarter />;
  const active = quarter.phase === 'active';
  const open = state.impediments.filter((i) => i.status === 'open');
  const resolved = state.impediments.filter((i) => i.status === 'resolved');
  const epicsById = new Map(state.epics.map((e) => [e.id, e]));
  const phaseLabel = t(PHASES.find((p) => p.id === quarter.phase)?.label || quarter.phase);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('In-quarter')} · {quarterLabel(quarter)}</h2>
        {!active && <span className="text-xs bg-gray-100 border rounded px-2 py-0.5">{t('Stale flags apply only while the quarter is active (now: {phase})', { phase: phaseLabel })}</span>}
      </div>
      <ErrorNote error={err} />

      <Panel title={t('Check-ins per team')} right={<span className="text-xs text-gray-500">{t('cadence {n} days', { n: state.settings.staleDays })}</span>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.teams.map((team) => {
            const plans = teamPlans(state, team.id, quarter.id).filter((p) => p.commitment !== 'not_committed');
            if (!plans.length) return null;
            const mayEdit = canWriteTeam(actor, team.id);
            return (
              <div key={team.id}>
                <h4 className="font-semibold text-sm mb-1">{team.name}</h4>
                <ul className="space-y-1 text-sm">
                  {plans.map((p) => { const e = epicsById.get(p.epicId); const ci = latestCheckIn(state, e.id); const st = active ? isStale(state, e.id) : null; return (
                    <li key={p.id} className={`flex items-center gap-2 rounded px-2 py-1 ${st ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <button className="flex-1 text-left truncate hover:underline" onClick={() => setOpenEpic(e.id)}>{e.refCode} {e.title}</button>
                      <CommitmentPill value={p.commitment} size="xs" />
                      {ci ? <span className="text-xs text-gray-600 whitespace-nowrap"><ConfidenceMark value={ci.confidence} /> {daysSince(ci.createdAt)}d</span> : <span className="text-xs text-amber-900">{t('no check-in yet')}</span>}
                      {st && <span className="text-xs text-red-700 whitespace-nowrap">▲ {st.days == null ? t('never') : `${st.days}d`}</span>}
                      {mayEdit && <button className="text-xs text-indigo-700 hover:underline" aria-label={t('Check in on {ref}', { ref: e.refCode })} onClick={() => setQuick(e)}>{t('check-in')}</button>}
                    </li>); })}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title={t('Impediments and risks ({n} open)', { n: open.length })} right={isPlanner(actor) && <button className={btn.secondary} onClick={() => setRaise(true)}>{t('+ Raise')}</button>}>
        {open.length === 0 ? <Empty>{t('Nothing open.')}</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 text-left"><tr><th className="py-1">{t('Ref')}</th><th>{t('Kind')}</th><th>{t('Title')}</th><th>{t('Epic')}</th><th>{t('Owner')}</th><th>ROAM</th><th>{t('Age')}</th><th></th></tr></thead>
            <tbody>{open.sort((a, b) => a.raisedAt.localeCompare(b.raisedAt)).map((i) => { const e = epicsById.get(i.epicId); const age = daysSince(i.raisedAt); return (
              <tr key={i.id} className="border-t">
                <td className="py-1.5 font-mono text-xs">{i.refCode}</td>
                <td className="py-1.5 text-xs">{t(i.kind)}</td>
                <td className="py-1.5">{i.title}</td>
                <td className="py-1.5 text-xs"><button className="hover:underline" onClick={() => e && setOpenEpic(e.id)}>{e?.refCode}</button></td>
                <td className="py-1.5 text-xs">{i.ownerName}</td>
                <td className="py-1.5 text-xs">{i.kind === 'risk' ? (isPlanner(actor) ? <select className={`${input} !w-auto !py-0`} value={i.roam || ''} onChange={(ev) => run('upsertImpediment', { id: i.id, roam: ev.target.value || null })}><option value="">–</option>{ROAM.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select> : (i.roam ? t(i.roam) : '–')) : '–'}</td>
                <td className={`py-1.5 text-xs whitespace-nowrap ${age > IMPEDIMENT_AGING_DAYS ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{age}d{age > IMPEDIMENT_AGING_DAYS && ` ▲ ${t('aging')}`}</td>
                <td className="py-1.5">{isPlanner(actor) && <button className={btn.ghost} onClick={async () => { const r = await run('resolveImpediment', i.id); setErr(r.ok ? null : r.error); }}>{t('Resolve')}</button>}</td>
              </tr>); })}</tbody>
          </table>
        )}
        {resolved.length > 0 && <details className="mt-3 text-xs text-gray-600"><summary>{t('{n} resolved', { n: resolved.length })}</summary><ul className="mt-1 space-y-0.5">{resolved.map((i) => <li key={i.id}>{i.refCode} {i.title} — {t('resolved {date}', { date: new Date(i.resolvedAt).toLocaleDateString() })}</li>)}</ul></details>}
      </Panel>

      {quick && <QuickCheckIn epic={quick} onClose={() => setQuick(null)} />}
      {raise && <RaiseImpediment onClose={() => setRaise(false)} />}
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}

function QuickCheckIn({ epic, onClose }) {
  const { run, quarter } = usePlan();
  const t = useT();
  const [confidence, setConfidence] = useState('medium');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  return (
    <Modal title={`${t('Check-in')} · ${epic.title}`} onClose={onClose}>
      <div className="flex gap-2 mb-3">{CONFIDENCE.map((c) => <button key={c} className={`${btn.secondary} ${confidence === c ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setConfidence(c)}>{t(CONFIDENCE_META[c].label)}</button>)}</div>
      <input className={input} placeholder={t('One line (optional)')} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={onClose}>{t('Cancel')}</button><button className={btn.primary} onClick={async () => { const r = await run('addCheckIn', { epicId: epic.id, quarterId: quarter.id, confidence, note }); if (r.ok) onClose(); else setErr(r.error); }}>{t('Save')}</button></div>
    </Modal>
  );
}

function RaiseImpediment({ onClose }) {
  const { state, quarter, run, actor } = usePlan();
  const t = useT();
  const plans = state.plans.filter((p) => p.quarterId === quarter.id);
  const [form, setForm] = useState({ kind: 'impediment', title: '', epicId: plans[0]?.epicId || '', ownerName: actor.name, roam: null });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title={t('Raise an impediment or risk')} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field l={t('Kind')}><select className={input} value={form.kind} onChange={set('kind')}><option value="impediment">{t('Impediment (in-quarter blocker)')}</option><option value="risk">{t('Risk (planning, ROAM)')}</option></select></Field>
        <Field l={t('Owner')}><input className={input} value={form.ownerName} onChange={set('ownerName')} /></Field>
      </div>
      <div className="mt-2"><Field l={t('Title')}><input className={input} value={form.title} onChange={set('title')} autoFocus /></Field></div>
      <div className="mt-2"><Field l={t('Epic')}><select className={input} value={form.epicId} onChange={set('epicId')}>{plans.map((p) => { const e = state.epics.find((x) => x.id === p.epicId); return <option key={p.id} value={e.id}>{e.refCode} {e.title}</option>; })}</select></Field></div>
      {form.kind === 'risk' && <div className="mt-2"><Field l="ROAM"><select className={input} value={form.roam || ''} onChange={(e) => setForm({ ...form, roam: e.target.value || null })}><option value="">–</option>{ROAM.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></Field></div>}
      {plans.length === 0 && <p className="text-xs text-amber-900 mt-2">{t('Plan an epic in this quarter first; impediments are linked to an epic.')}</p>}
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={onClose}>{t('Cancel')}</button><button className={btn.primary} disabled={!form.epicId} onClick={async () => { const r = await run('upsertImpediment', { ...form, roam: form.kind === 'risk' ? form.roam : null }); if (r.ok) onClose(); else setErr(r.error); }}>{t('Raise')}</button></div>
    </Modal>
  );
}
