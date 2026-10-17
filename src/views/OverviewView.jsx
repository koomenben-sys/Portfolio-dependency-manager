import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { overview } from '../domain/plan';
import { quarterLabel, BAND_META } from '../domain/model';
import { Kpi, Panel, CapacityBar, Empty } from '../components/plan/ui';
import { EpicPanel } from '../components/plan/EpicPanel';

// Director one-pager, derived entirely from board data (AC E1-E6, D11).
export function OverviewView() {
  const { state, quarter } = usePlan();
  const [openEpic, setOpenEpic] = useState(null);
  if (!quarter) return null;
  const o = overview(state, quarter.id);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">Overview · {quarterLabel(quarter)} <span className="text-sm font-normal text-gray-500">({quarter.phase})</span></h2>
        <span className="text-xs text-gray-500">Data as of {o.asOf ? new Date(o.asOf).toLocaleString() : '–'}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Top-10 committed" value={`${o.topCommitted}/${o.topN}`} sub={`${pct(o.topCommitted, o.topN)}% of top strategic epics`} tone={o.topCommitted === o.topN ? 'good' : o.topCommitted >= o.topN * 0.7 ? 'warn' : 'bad'} />
        <Kpi label="Teams over capacity" value={o.overTeams.length} sub={o.overTeams.map((l) => l.team.name).join(', ') || 'none'} tone={o.overTeams.length ? 'bad' : 'good'} />
        <Kpi label="Regulatory at risk" value={`${o.regRisk.length}/${o.regulatoryCount}`} sub="not committed or at risk" tone={o.regRisk.length ? 'bad' : 'good'} />
        <Kpi label="Asks without answer" value={o.openAsks} sub={o.openAsks ? `oldest ${o.oldestAsk} days` : 'all answered'} tone={o.oldestAsk >= 5 ? 'warn' : 'neutral'} />
        <Kpi label="Open impediments" value={o.openImp} sub={o.openImp ? `oldest ${o.oldestImp} days` : 'none'} tone={o.oldestImp > 7 ? 'warn' : 'neutral'} />
        <Kpi label="Team confidence" value={o.avgVote ? o.avgVote.toFixed(1) : '–'} sub={`${o.voteCount}/${state.teams.length} teams voted`} tone={o.avgVote == null ? 'neutral' : o.avgVote >= 3.5 ? 'good' : o.avgVote >= 3 ? 'warn' : 'bad'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Red flags — what needs a decision" className="xl:col-span-2">
          {o.flags.length === 0 ? <Empty>No red flags.</Empty> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left"><tr><th className="py-1">Flag</th><th>Item</th><th>Owner</th><th>Age</th></tr></thead>
              <tbody>{o.flags.map((f) => (
                <tr key={f.key} className="border-t">
                  <td className="py-1.5 pr-2 whitespace-nowrap"><span className={`text-xs px-1.5 py-0.5 rounded border ${f.severity >= 4 ? 'bg-red-50 text-red-800 border-red-200' : f.severity === 3 ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>▲ {f.kind}</span></td>
                  <td className="py-1.5 pr-2"><button className="text-left hover:underline" onClick={() => f.epicId && setOpenEpic(f.epicId)}>{f.text}</button></td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{f.owner || '–'}</td>
                  <td className="py-1.5 text-xs text-gray-500 whitespace-nowrap">{f.age ?? '–'}d</td>
                </tr>))}</tbody>
            </table>
          )}
        </Panel>

        <Panel title="Theme coverage">
          <ul className="space-y-1.5 text-sm">
            {o.themeRows.map((r) => (
              <li key={r.theme.id} className="flex justify-between gap-2">
                <span className="truncate">{r.uncovered ? <span className="text-red-700" title="No committed epic">▲ </span> : <span className="text-emerald-700">✓ </span>}{r.theme.name}</span>
                <span className="text-xs text-gray-600 whitespace-nowrap">{r.committed}/{r.epics} committed · {r.weeks} pw</span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t pt-1.5 text-gray-600"><span>Unaligned (no theme)</span><span className="text-xs">{o.unaligned} epics</span></li>
          </ul>
        </Panel>
      </div>

      <Panel title="Teams — load and freshness">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {o.loads.map((l) => { const f = o.teamFreshness.find((x) => x.team.id === l.team.id); return (
            <div key={l.team.id} className="border rounded p-2">
              <div className="flex justify-between text-sm"><b>{l.team.name}</b><span className={`text-xs ${f.stale ? 'text-red-700' : 'text-gray-500'}`}>{f.stale ? '▲ stale · ' : ''}updated {f.days == null ? 'never' : `${f.days}d ago`}</span></div>
              <div className="mt-1"><CapacityBar load={l} compact /></div>
            </div>); })}
        </div>
      </Panel>
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}
