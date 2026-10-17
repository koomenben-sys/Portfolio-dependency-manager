import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { overview } from '../domain/plan';
import { quarterLabel, PHASES } from '../domain/model';
import { useT } from '../i18n';
import { Kpi, Panel, CapacityBar, CapacityLegend, Empty, btn, fmtDate, CommitmentPill } from '../components/plan/ui';
import { NoQuarter } from '../components/plan/NoQuarter';
import { EpicPanel } from '../components/plan/EpicPanel';

// Director one-pager, derived entirely from board data (AC E1-E6, D11).
export function OverviewView() {
  const { state, quarter } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  if (!quarter) return <NoQuarter />;
  const o = overview(state, quarter.id);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const phaseLabel = t(PHASES.find((p) => p.id === quarter.phase)?.label || quarter.phase);
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">{t('Overview')} · {quarterLabel(quarter)} <span className="text-sm font-normal text-gray-500">({phaseLabel})</span></h2>
        <span className="text-xs text-gray-600 flex items-center gap-3">{t('Data as of {time}', { time: o.asOf ? new Date(o.asOf).toLocaleString('nl-NL') : '–' })} <button className={`${btn.secondary} print:hidden`} onClick={() => window.print()}>{t('Print / PDF')}</button></span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label={t('Top-10 committed')} value={`${o.topCommitted}/${o.topN}`} sub={t('{pct}% of top strategic epics', { pct: pct(o.topCommitted, o.topN) })} tone={o.topCommitted === o.topN ? 'good' : o.topCommitted >= o.topN * 0.7 ? 'warn' : 'bad'} />
        <Kpi label={t('Teams over capacity')} value={o.overTeams.length} sub={o.overTeams.map((l) => l.team.name).join(', ') || t('none')} tone={o.overTeams.length ? 'bad' : 'good'} />
        <Kpi label={t('Regulatory at risk')} value={`${o.regRisk.length}/${o.regulatoryCount}`} sub={t('not committed or at risk')} tone={o.regRisk.length ? 'bad' : 'good'} />
        <Kpi label={t('Asks without answer')} value={o.openAsks} sub={o.openAsks ? t('oldest {n} days', { n: o.oldestAsk }) : t('all answered')} tone={o.oldestAsk >= 5 ? 'warn' : 'neutral'} />
        <Kpi label={t('Open impediments')} value={o.openImp} sub={o.openImp ? t("on this quarter's epics · oldest {n} days", { n: o.oldestImp }) : t("none on this quarter's epics")} tone={o.oldestImp > 7 ? 'warn' : 'neutral'} />
        <Kpi label={t('Team confidence')} value={o.avgVote ? `${o.avgVote.toFixed(1)} / 5` : o.voteCount && !o.votesRevealed ? t('hidden') : '–'} sub={`${t('{voted}/{total} teams voted', { voted: o.voteCount, total: state.teams.length })}${o.voteCount && !o.votesRevealed ? ` · ${t('revealed by the facilitator in the session')}` : ` (${t('fist of five')})`}`} tone={o.avgVote == null ? 'neutral' : o.avgVote >= 3.5 ? 'good' : o.avgVote >= 3 ? 'warn' : 'bad'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title={t('Red flags — what needs a decision')} className="xl:col-span-2">
          {o.flags.length === 0 ? <Empty>{t('No red flags.')}</Empty> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-600 text-left"><tr><th className="py-1">{t('Item (highest severity first)')}</th><th>{t('Why it needs a decision')}</th><th>{t('Owner')}</th><th>{t('Since last change (days)')}</th></tr></thead>
              <tbody>{o.flags.map((f) => (
                <tr key={f.key} className="border-t align-top">
                  <td className="py-1.5 pr-2"><button className="text-left hover:underline font-medium" onClick={() => f.epicId && setOpenEpic(f.epicId)}>{f.label}</button></td>
                  <td className="py-1.5 pr-2">
                    <div className="flex flex-wrap gap-1 mb-0.5">{f.kinds.map((k, i) => <span key={i} className={`text-xs px-1.5 py-0.5 rounded border ${f.severity >= 4 ? 'bg-red-50 text-red-800 border-red-200' : f.severity === 3 ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>▲ {t(k)}</span>)}</div>
                    <ul className="text-xs text-gray-700">{f.texts.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{f.owner || '–'}</td>
                  <td className="py-1.5 text-xs text-gray-600 whitespace-nowrap">{f.age ?? '–'}</td>
                </tr>))}</tbody>
            </table>
          )}
        </Panel>

        <Panel title={t('Theme coverage')}>
          <ul className="space-y-1.5 text-sm">
            {o.themeRows.map((r) => (
              <li key={r.theme.id} className="flex justify-between gap-2">
                <span className="truncate">{r.uncovered ? <span className="text-red-700" title={t('No committed epic')}>▲ </span> : <span className="text-emerald-700">✓ </span>}{r.theme.name}</span>
                <span className="text-xs text-gray-600 whitespace-nowrap">{t('{committed}/{epics} committed · {weeks} pw', { committed: r.committed, epics: r.epics, weeks: r.weeks })}</span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t pt-1.5 text-gray-600"><span>{t('Unaligned (no theme)')}</span><span className="text-xs">{t('{n} epics', { n: o.unaligned })}</span></li>
          </ul>
        </Panel>
      </div>

      <Panel title={t('Regulatory register — what we must deliver and whether it fits')}>
        {o.regulatoryRows.length === 0 ? <Empty>{t('No regulatory epics this quarter.')}</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-600 text-left"><tr><th className="py-1">{t('Regulation')}</th><th>{t('Epic')}</th><th>{t('Team')}</th><th>{t('Deadline')}</th><th>{t('Rank')}</th><th>{t('Commitment')}</th><th>{t('Fits capacity?')}</th><th>{t('Owner')}</th></tr></thead>
            <tbody>{o.regulatoryRows.map((r) => (
              <tr key={r.epicId} className="border-t">
                <td className="py-1.5 pr-2 font-medium">{r.regulation || '–'}</td>
                <td className="py-1.5 pr-2"><button className="hover:underline text-left" onClick={() => setOpenEpic(r.epicId)}>{r.refCode} {r.title}</button></td>
                <td className="py-1.5 pr-2">{r.team}</td>
                <td className={`py-1.5 pr-2 whitespace-nowrap ${r.daysLeft != null && r.daysLeft < 90 ? 'text-red-700 font-medium' : ''}`}>{fmtDate(r.deadline)}{r.daysLeft != null && ` (${r.daysLeft}d)`}</td>
                <td className="py-1.5 pr-2">{r.rank ?? t('unranked')}</td>
                <td className="py-1.5 pr-2"><CommitmentPill value={r.commitment} size="xs" /></td>
                <td className="py-1.5 pr-2">{r.deadlineState === 'before_start' ? <span className="text-red-700 font-medium">▲ {t('deadline before quarter start, not planned earlier')}</span> : r.belowCut ? <span className="text-red-700 font-medium">▲ {t('below cut line')}</span> : <span className="text-emerald-700">✓ {t('fits')}{r.deadlineState === 'earlier' ? ` (${t('deadline in an earlier quarter where it is also planned')})` : ''}</span>}</td>
                <td className="py-1.5">{r.owner}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Panel>

      <Panel title={t('Teams — load and freshness')} right={<details className="text-xs"><summary className="cursor-pointer text-indigo-700">{t('How are these numbers built?')}</summary><div className="mt-1 max-w-md"><CapacityLegend /></div></details>}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {o.loads.map((l) => { const f = o.teamFreshness.find((x) => x.team.id === l.team.id); return (
            <div key={l.team.id} className="border rounded p-2">
              <div className="flex justify-between text-sm"><b>{l.team.name}</b><span className={`text-xs ${f.stale ? 'text-red-700' : 'text-gray-600'}`}>{f.stale ? `▲ ${t('stale')} · ` : ''}{f.days == null ? t('updated never') : t('updated {n} days ago', { n: f.days })}</span></div>
              <div className="mt-1"><CapacityBar load={l} compact /></div>
            </div>); })}
        </div>
      </Panel>
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}
