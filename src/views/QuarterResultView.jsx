import React, { useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { quarterLabel } from '../domain/model';
import { quarterResult, THEME_TYPE_LABEL } from '../domain/value';
import { useT } from '../i18n';
import { cls, ViewHeader, RankNo, EmptyLine, MustChip } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';

// Kwartaalresultaat (docs/design.md section 21, D45): the output of the quarter meeting. Reached from a button
// on Afstemmen (#kwartaalresultaat, not in the nav), readable by every role. One line, one table, print (iteration 1:
// plain-words title and reasons, Moet deadlines, no CSV).
export function QuarterResultView() {
  const { state, quarter } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  if (!quarter) return <NoQuarter />;
  const model = state.settings.valueModel || 'none';
  const res = quarterResult(state, quarter.id, model);
  const label = (r) => (r.theme ? r.theme.name : t('Without goal'));
  const kind = (r) => (r.theme ? t(THEME_TYPE_LABEL[r.theme.type] || THEME_TYPE_LABEL.goal) : '');

  const today = new Date().toLocaleDateString(t.lang === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  // "Kan niet — reden" / "Bespreken — nog in gesprek" / "Open — wacht op Team" (iteration 1, item 8).
  const why = (x) => (x.worst === 'declined' ? `${t("Can't")} — ${x.reason || x.team || ''}`
    : x.worst === 'needs_priority_call' ? `${t('Discuss')} — ${x.reason || t('still in talks')}`
    : `${t('Open')} — ${t('waiting for {team}', { team: x.team || '?' })}`);
  const rows = res.rows.filter((r) => r.theme || r.planned > 0);

  return (
    <div className="print-landscape" data-tour="quarter-result">
      <a className={`${cls.quiet} print:hidden -ml-2 mb-1`} href="#afstemmen"><ArrowLeft size={13} aria-hidden="true" />{t('Align')}</a>
      <ViewHeader title={t('What goes ahead and what does not')} meta={`${t('Quarter result')} · ${quarterLabel(quarter)} · ${today}`} right={
        <>
          <button className={`${cls.secondary} print:hidden`} onClick={() => window.print()}><Printer size={14} aria-hidden="true" />{t('Print / PDF')}</button>
        </>
      } />

      {res.top > 0 && (
        <p className={`mb-4 text-label tnum ${res.topAtRisk ? 'text-ink' : 'text-muted'}`}>
          {t('Of the top {n}: {c} committed, {r} at risk', { n: res.top, c: res.topCommitted, r: res.topAtRisk })}
        </p>
      )}

      {rows.every((r) => r.planned === 0) ? <div className={cls.card}><EmptyLine>{t('No epics in this quarter yet.')}</EmptyLine></div> : (
        <div className={`${cls.card} overflow-hidden`}>
          <table className="w-full text-body" aria-label={t('Quarter result')}>
            <thead>
              <tr className="text-caption text-muted text-left border-b border-border">
                <th className="h-9 pl-3 font-medium" scope="col">{t('Goal')}</th>
                <th className="w-28 pr-3 font-medium tnum text-right" scope="col">{t('Committed')}</th>
                <th className="font-medium pl-3" scope="col">{t('Not committed')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.theme?.id || 'none'} className={r.planned === 0 ? 'text-muted' : ''}>
                  <td className="py-2.5 pl-3 align-top">
                    <div className={`text-body ${r.theme ? 'text-ink font-medium' : 'text-muted'}`}>{label(r)}</div>
                    {kind(r) && <div className="text-caption text-muted flex items-center gap-1.5 mt-0.5">{kind(r)}{r.theme.must && <MustChip must={{ deadline: r.theme.mustDeadline }} />}</div>}
                  </td>
                  <td className="py-2.5 pr-3 align-top text-right tnum"><span className={r.committed < r.planned && r.planned > 0 ? 'text-ink font-medium' : ''}>{r.committed}</span><span className="text-muted"> / {r.planned}</span></td>
                  <td className="py-2.5 pl-3 pr-3 align-top">
                    {r.notCommitted.length === 0 ? <span className="text-faint">–</span> : (
                      <ul className="space-y-2">
                        {r.notCommitted.map((x) => (
                          <li key={x.epicId} className="flex items-start gap-2 min-w-0">
                            <RankNo rank={x.rank} size="sm" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button className="text-left hover:underline focus-ring rounded-control print:no-underline" onClick={() => setOpenEpic(x.epicId)}>{x.title}</button>
                                {x.must && <MustChip must={x.must} className="shrink-0" />}
                              </div>
                              <div className={`text-caption ${x.worst === 'declined' ? 'text-danger-fg' : x.worst === 'needs_priority_call' ? 'text-warn-fg' : 'text-muted'}`}>{why(x)}{x.worst !== 'proposed' && x.team && x.reason ? <span className="text-muted"> · {x.team}</span> : null}</div>
                            </div>
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
