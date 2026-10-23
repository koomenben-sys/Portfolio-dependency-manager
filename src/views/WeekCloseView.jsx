import React, { useState } from 'react';
import { Printer, ArrowLeft, Download } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { byId } from '../domain/plan';
import { changesSince, lastUpdateMoment, quarterWeek, STAND_META, cadenceOf, periodWeeks } from '../domain/rhythm';
import { useT } from '../i18n';
import { cls, ViewHeader, quarterMeta, RankNo, EmptyLine, fmtDay } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';

// Weekafsluiting (docs/design.md section 28, D105): what changed since the previous bijwerkmoment — started, done,
// new impediments, escalations, resolved — per epic in rank order. Reached from Voortgang (#weekafsluiting, not in the
// nav), readable by every role, printable, and downloadable as CSV. Without a bijwerkmoment yet it takes one period back.
const DAY = 86400000;
const STAND_LABEL = (t, p) => (p == null ? t('Derived') : t(STAND_META[p]?.label || p));
export function describeChange(r, t) {
  switch (r.action) {
    case 'progress_set': return `${STAND_LABEL(t, r.before.progress)} → ${STAND_LABEL(t, r.after.progress)}${r.after.progress === 'started' && r.after.startedWeek ? ` (wk ${r.after.startedWeek})` : ''}`;
    case 'progress_confirmed': return t('confirmed, still as is');
    case 'impediment_raised': return t('New impediment');
    case 'impediment_status_changed': return r.after.status === 'resolved' ? t('Resolved') : `${t('Impediment')} ${t(r.before.status === 'in_progress' ? 'In progress' : 'Open').toLowerCase()} → ${t(r.after.status === 'in_progress' ? 'In progress' : 'Open').toLowerCase()}`;
    case 'impediment_escalated': return `${t('Escalated')}${r.after.escalatedTo ? ` → ${r.after.escalatedTo}` : ''}`;
    default: return r.action;
  }
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function WeekCloseView() {
  const { state, quarter } = usePlan();
  const t = useT();
  const [all, setAll] = useState(false);
  if (!quarter) return <NoQuarter />;
  const teams = byId(state.teams); const epics = byId(state.epics);
  const now = Date.now();
  const since = all ? null : (lastUpdateMoment(quarter, state.settings, now) ?? now - periodWeeks(cadenceOf(state.settings)) * 7 * DAY);
  const groups = changesSince(state, quarter.id, since ? new Date(since).toISOString() : null);
  const n = groups.reduce((s, g) => s + g.rows.length, 0);
  const { week, total } = quarterWeek(quarter, state.settings, now);
  const period = since ? `${t('since {d}', { d: fmtDay(since, t.lang) })}` : t('whole quarter');
  const subjectOf = (r) => (r.entity === 'dependencies' ? r.subject : r.entity === 'impediments' ? r.subject : epics.get(r.epicId)?.title || '');
  const download = () => {
    const head = ['rank', 'epic', 'team', 'date', 'who', 'what', 'change'];
    const lines = [head.join(';')];
    for (const g of groups) for (const r of g.rows) lines.push([g.rank ?? '', g.title, teams.get(epics.get(g.epicId)?.teamId)?.name || '', fmtDay(r.at, t.lang), r.name, subjectOf(r), describeChange(r, t)].map(csvCell).join(';'));
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `weekafsluiting-${quarter.year}-Q${quarter.q}-wk${week}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="print-landscape" data-tour="week-close">
      <a className={`${cls.quiet} print:hidden -ml-2 mb-1`} href="#voortgang"><ArrowLeft size={13} aria-hidden="true" />{t('Progress')}</a>
      <ViewHeader title={t('Week close')} meta={`${quarterMeta(quarter, t)} · ${t('Week {w} of {n}', { w: week, n: total })} · ${period}`} right={
        <>
          <label className="inline-flex items-center gap-2 text-label text-muted print:hidden"><input type="checkbox" className="w-4 h-4 accent-[var(--color-accent-500)]" checked={all} onChange={(e) => setAll(e.target.checked)} />{t('Whole quarter')}</label>
          <button className={`${cls.secondary} print:hidden`} onClick={download} disabled={!n}><Download size={14} aria-hidden="true" />CSV</button>
          <button className={`${cls.secondary} print:hidden`} onClick={() => window.print()}><Printer size={14} aria-hidden="true" />{t('Print / PDF')}</button>
        </>
      } />
      {n === 0 ? <div className={cls.card}><EmptyLine>{t('No changes.')}</EmptyLine></div> : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.epicId} className={cls.card} aria-label={g.title}>
              <header className="flex items-center gap-3 px-3 h-11 border-b border-border bg-surface-2">
                <RankNo rank={g.rank} hash /><h2 className="text-body font-semibold flex-1 truncate">{g.title}</h2>
                <span className="text-caption text-muted truncate">{teams.get(epics.get(g.epicId)?.teamId)?.name}</span>
              </header>
              <table className="w-full text-body" aria-label={g.title}>
                <tbody className="divide-y divide-border">
                  {g.rows.map((r) => (
                    <tr key={r.id} className="h-row">
                      <td className="w-20 pl-3 text-caption text-muted tnum whitespace-nowrap">{fmtDay(r.at, t.lang)}</td>
                      <td className="px-3 min-w-0"><span className="block truncate" title={subjectOf(r)}>{subjectOf(r)}</span></td>
                      <td className="px-3 w-[260px] text-label font-medium">{describeChange(r, t)}</td>
                      <td className="pr-3 w-44 text-caption text-muted truncate">{r.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
