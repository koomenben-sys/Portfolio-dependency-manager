import React, { useState } from 'react';
import { Check, Printer, ArrowRightToLine } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { quarterLabel } from '../domain/model';
import { closeRows, nextQuarter } from '../domain/rhythm';
import { useT } from '../i18n';
import { cls, ViewHeader, RankNo, EmptyLine, ErrorLine, FollowStar } from '../components/plan/core';
import { followsOf } from '../domain/follows';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';
import { ResultTable, resultDate } from './QuarterResultView';

// Step 3 once the quarter is Afgesloten — Resultaat (docs/design.md section 23, D66; acceptance M6). Merges
// Kwartaalresultaat (the per-goal table) and the old Afsluiten (per team the committed epics with "Geleverd" and
// "Doorschuiven naar <next quarter>" on undelivered ones). Print / PDF. The old #kwartaalresultaat and #afsluiten
// routes land here (App.jsx). No predictability percentage (D62).
export function ResultView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  const [err, setErr] = useState(null);
  if (!quarter) return <NoQuarter />;
  const rows = closeRows(state, quarter.id);
  const next = nextQuarter(state, quarter.id);
  const followed = followsOf(state, actor.id);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const total = rows.reduce((s, r) => s + r.committed, 0);
  const carryLabel = next ? t('Carry over to {q}', { q: quarterLabel(next) }) : t('Carry over');

  return (
    <div className="print-landscape" data-tour="result">
      <ViewHeader title={t('What goes ahead and what does not')} meta={`${t('Result')} · ${quarterLabel(quarter)} · ${resultDate(t.lang)}`} right={
        <button className={`${cls.secondary} print:hidden`} onClick={() => window.print()}><Printer size={14} aria-hidden="true" />{t('Print / PDF')}</button>
      } />
      <ResultTable onOpen={setOpenEpic} />
      <ErrorLine error={err} />

      <section className="mt-8" aria-label={t('Delivered per team')} data-tour="delivered">
        <h2 className="text-subtitle font-semibold mb-2">{t('Delivered per team')}</h2>
        {total === 0 ? <div className={cls.card}><EmptyLine>{t('No committed epics in this quarter.')}</EmptyLine></div> : (
          <div className="space-y-4">
            {rows.filter((r) => r.committed > 0).map((r) => {
              const mayEdit = canWriteTeam(actor, r.team.id);
              return (
                <section key={r.team.id} className={cls.card} aria-label={r.team.name}>
                  <header className="flex items-center gap-3 px-3 h-11 border-b border-border">
                    <h3 className="text-body font-medium text-ink flex-1 truncate">{r.team.name}</h3>
                  </header>
                  <ul className="divide-y divide-border">
                    {r.rows.map((x) => (
                      <li key={x.epic.id} className="flex items-center gap-3 px-3 min-h-10 py-1.5 flex-wrap md:flex-nowrap">
                        <RankNo rank={x.rank} size="sm" />
                        <button className="min-w-0 flex-1 text-left text-body truncate hover:underline focus-ring rounded-control" onClick={() => setOpenEpic(x.epic.id)}>{x.epic.title}<FollowStar on={followed.has(x.epic.id)} className="inline ml-1.5 -mt-0.5" /></button>
                        {!x.plan && <span className="text-caption text-muted">{t('removed from the quarter')}</span>}
                        {x.plan && (mayEdit ? (
                          <label className="inline-flex items-center gap-2 h-8 px-1.5 rounded-control text-label cursor-pointer hover:bg-surface-2 print:hidden">
                            <input type="checkbox" className="w-4 h-4 accent-[var(--color-accent-500)]" checked={x.delivered} onChange={(e) => act('setDelivered', x.plan.id, e.target.checked)} />{t('Delivered')}
                          </label>
                        ) : null)}
                        {x.plan && !mayEdit && (x.delivered ? <span className="inline-flex items-center gap-1 text-label text-ok-fg"><Check size={14} aria-hidden="true" />{t('Delivered')}</span> : <span className="text-label text-muted">{t('Not delivered')}</span>)}
                        {x.plan && mayEdit && <span className="hidden print:inline text-label">{x.delivered ? t('Delivered') : t('Not delivered')}</span>}
                        {x.plan && !x.delivered && (x.carried
                          ? <span className="inline-flex items-center gap-1 text-caption text-muted">{t('In {q}', { q: quarterLabel(next) })}</span>
                          : mayEdit && <button className={`${cls.quiet} print:hidden`} disabled={!next} title={next ? t('Add unranked to {q}', { q: quarterLabel(next) }) : t('Add the next quarter first')} onClick={() => act('carryOver', x.plan.id)}><ArrowRightToLine size={13} aria-hidden="true" />{carryLabel}</button>)}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>
      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}
