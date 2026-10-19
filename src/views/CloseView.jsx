import React, { useState } from 'react';
import { Check, FileBarChart, ArrowRightToLine } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { quarterLabel, cyclePhase } from '../domain/model';
import { closeRows, nextQuarter } from '../domain/rhythm';
import { useT } from '../i18n';
import { cls, ViewHeader, RankNo, EmptyLine, ErrorLine } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';

// Afsluiten (docs/design.md section 22, D56; L10). Reached from the cycle-phase word (#afsluiten, not in the nav).
// Per team: the epics committed at the baseline (or now, without one) with a "Geleverd" checkbox (team planner or
// admin), "Voorspelbaarheid 75% (3 van 4)", "Doorschuiven" per undelivered epic, and a link to Kwartaalresultaat.
export function CloseView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  const [err, setErr] = useState(null);
  if (!quarter) return <NoQuarter />;
  const rows = closeRows(state, quarter.id);
  const next = nextQuarter(state, quarter.id);
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const total = rows.reduce((s, r) => s + r.committed, 0);
  const delivered = rows.reduce((s, r) => s + r.delivered, 0);

  return (
    <div data-tour="close">
      <ViewHeader title={t('Closing')} meta={`${quarterLabel(quarter)} · ${t(cyclePhase(quarter.phase))}`} right={<a className={cls.secondary} href="#kwartaalresultaat"><FileBarChart size={14} aria-hidden="true" />{t('Quarter result')}</a>} />
      <ErrorLine error={err} />
      {total > 0 && <p className="mb-4 text-label tnum text-muted"><span className="font-medium text-ink">{t('Predictability')} {Math.round((delivered / total) * 100)}%</span> ({t('{d} of {n}', { d: delivered, n: total })})</p>}
      {total === 0 ? <div className={cls.card}><EmptyLine>{t('No committed epics in this quarter.')}</EmptyLine></div> : (
        <div className="space-y-4">
          {rows.filter((r) => r.committed > 0).map((r) => {
            const mayEdit = canWriteTeam(actor, r.team.id);
            return (
              <section key={r.team.id} className={cls.card} aria-label={r.team.name}>
                <header className="flex items-center gap-3 px-3 h-11 border-b border-border">
                  <h2 className="text-body font-medium text-ink flex-1 truncate">{r.team.name}</h2>
                  <span className={`text-label tnum ${r.pct != null && r.pct < 100 ? 'text-ink-2' : 'text-muted'}`}>{t('Predictability')} <span className="font-medium">{r.pct}%</span> <span className="text-muted">({t('{d} of {n}', { d: r.delivered, n: r.committed })})</span></span>
                </header>
                <ul className="divide-y divide-border">
                  {r.rows.map((x) => (
                    <li key={x.epic.id} className="flex items-center gap-3 px-3 min-h-10 py-1.5 flex-wrap md:flex-nowrap">
                      <RankNo rank={x.rank} size="sm" />
                      <button className="min-w-0 flex-1 text-left text-body truncate hover:underline focus-ring rounded-control" onClick={() => setOpenEpic(x.epic.id)}>{x.epic.title}</button>
                      {!x.plan && <span className="text-caption text-muted">{t('removed from the quarter')}</span>}
                      {x.plan && (mayEdit ? (
                        <label className="inline-flex items-center gap-2 h-8 px-1.5 rounded-control text-label cursor-pointer hover:bg-surface-2">
                          <input type="checkbox" className="w-4 h-4 accent-[var(--color-accent-500)]" checked={x.delivered} onChange={(e) => act('setDelivered', x.plan.id, e.target.checked)} />{t('Delivered')}
                        </label>
                      ) : x.delivered ? <span className="inline-flex items-center gap-1 text-label text-ok-fg"><Check size={14} aria-hidden="true" />{t('Delivered')}</span> : <span className="text-label text-muted">{t('Not delivered')}</span>)}
                      {x.plan && !x.delivered && mayEdit && (x.carried
                        ? <span className="inline-flex items-center gap-1 text-caption text-muted w-32 justify-end">{t('In {q}', { q: quarterLabel(next) })}</span>
                        : <button className={`${cls.quiet} w-32 justify-end`} disabled={!next} title={next ? t('Add unranked to {q}', { q: quarterLabel(next) }) : t('Add the next quarter first')} onClick={() => act('carryOver', x.plan.id)}><ArrowRightToLine size={13} aria-hidden="true" />{t('Carry over')}</button>)}
                      {x.plan && !x.delivered && !mayEdit && x.carried && <span className="text-caption text-muted w-32 text-right">{t('In {q}', { q: quarterLabel(next) })}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}
