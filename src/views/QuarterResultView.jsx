import React, { useState } from 'react';
import { Printer, Download, ArrowLeft } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { quarterLabel } from '../domain/model';
import { quarterResult, THEME_TYPE_LABEL, fmtMonth } from '../domain/value';
import { useT } from '../i18n';
import { cls, ViewHeader, RankNo, EmptyLine } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';

// Kwartaalresultaat (docs/design.md section 21, D45): the output of the quarter meeting. Reached from a button
// on Afstemmen (#kwartaalresultaat, not in the nav), readable by every role. One line, one table, print and CSV.
export function QuarterResultView() {
  const { state, quarter } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  if (!quarter) return <NoQuarter />;
  const model = state.settings.valueModel || 'none';
  const res = quarterResult(state, quarter.id, model);
  const label = (r) => (r.theme ? r.theme.name : t('Without goal'));
  const kind = (r) => (r.theme ? `${t(THEME_TYPE_LABEL[r.theme.type] || THEME_TYPE_LABEL.goal)}${r.theme.must ? ` · ${t('Must')}${r.theme.mustDeadline ? ` ${fmtMonth(r.theme.mustDeadline, t.lang)}` : ''}` : ''}` : '');
  const fmtN = (n) => String(n).replace('.', t.lang === 'nl' ? ',' : '.');
  const valueHead = model === 'none' ? t('Epics') : t('Value');

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = [t('Goal'), t('Type'), t('Committed'), t('Planned'), t('At risk'), valueHead, t('Not committed')];
    const lines = res.rows.map((r) => [label(r), kind(r), r.committed, r.planned, r.atRisk, fmtN(r.value), r.notCommitted.map((x) => `${x.title}${x.team ? ` — ${x.team}` : x.status === 'open' ? ` — ${t('open')}` : ''}`).join(' | ')].map(esc).join(';'));
    const csv = `﻿${head.map(esc).join(';')}\n${lines.join('\n')}\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `kwartaalresultaat-${quarter.year}-Q${quarter.q}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="print-landscape" data-tour="quarter-result">
      <ViewHeader title={t('Quarter result')} meta={quarterLabel(quarter)} right={
        <>
          <a className={`${cls.quiet} print:hidden`} href="#afstemmen"><ArrowLeft size={13} aria-hidden="true" />{t('Align')}</a>
          <button className={`${cls.secondary} print:hidden`} onClick={exportCsv}><Download size={14} aria-hidden="true" />{t('Export (CSV)')}</button>
          <button className={`${cls.secondary} print:hidden`} onClick={() => window.print()}><Printer size={14} aria-hidden="true" />{t('Print / PDF')}</button>
        </>
      } />

      {res.top > 0 && (
        <p className={`mb-4 text-label tnum ${res.topAtRisk ? 'text-ink' : 'text-muted'}`}>
          <span className="font-medium">{t('Top {n}', { n: res.top })}:</span> {t('{n} committed', { n: res.topCommitted })} <span aria-hidden="true">·</span> {t('{n} at risk', { n: res.topAtRisk })}
        </p>
      )}

      {res.rows.every((r) => r.planned === 0) ? <div className={cls.card}><EmptyLine>{t('No epics in this quarter yet.')}</EmptyLine></div> : (
        <div className={`${cls.card} overflow-hidden`}>
          <table className="w-full text-body" aria-label={t('Quarter result')}>
            <thead>
              <tr className="text-caption text-muted text-left border-b border-border">
                <th className="h-9 pl-3 font-medium" scope="col">{t('Goal')}</th>
                <th className="w-28 pr-3 font-medium tnum text-right" scope="col">{t('Committed')}</th>
                <th className="w-20 pr-3 font-medium tnum text-right" scope="col">{valueHead}</th>
                <th className="font-medium pl-3" scope="col">{t('Not committed')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {res.rows.map((r) => (
                <tr key={r.theme?.id || 'none'} className={r.planned === 0 ? 'text-muted' : ''}>
                  <td className="py-2.5 pl-3 align-top">
                    <div className={`text-body ${r.theme ? 'text-ink font-medium' : 'text-muted'}`}>{label(r)}</div>
                    {kind(r) && <div className="text-caption text-muted">{kind(r)}</div>}
                  </td>
                  <td className="py-2.5 pr-3 align-top text-right tnum"><span className={r.committed < r.planned && r.planned > 0 ? 'text-ink font-medium' : ''}>{r.committed}</span><span className="text-muted"> / {r.planned}</span></td>
                  <td className="py-2.5 pr-3 align-top text-right tnum">{r.planned ? fmtN(r.value) : '–'}</td>
                  <td className="py-2.5 pl-3 pr-3 align-top">
                    {r.notCommitted.length === 0 ? <span className="text-faint">–</span> : (
                      <ul className="space-y-1">
                        {r.notCommitted.map((x) => (
                          <li key={x.epicId} className="flex items-center gap-2 min-w-0">
                            <RankNo rank={x.rank} size="sm" />
                            <button className="text-left hover:underline focus-ring rounded-control truncate print:no-underline" onClick={() => setOpenEpic(x.epicId)}>{x.title}</button>
                            <span className={`text-caption whitespace-nowrap ${x.status === 'at_risk' ? 'text-danger-fg font-medium' : 'text-muted'}`}>{x.team ? `— ${x.team}` : `— ${t('open')}`}</span>
                          </li>
                        ))}
                        {r.more > 0 && <li className="text-caption text-muted pl-8">+{r.more}</li>}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}
