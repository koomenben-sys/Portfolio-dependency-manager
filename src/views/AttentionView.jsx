import React, { useEffect, useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { attention } from '../domain/plan';
import { useT } from '../i18n';
import { Panel, Empty, btn } from '../components/plan/ui';
import { EpicPanel } from '../components/plan/EpicPanel';
import { AnswerModal } from '../components/plan/AnswerModal';

// Notification-free inbox derived from state (AC F4). Rows are actionable (review: PO, UX).
export function AttentionView() {
  const { state, actor, quarter, markAttentionSeen, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  useEffect(() => () => markAttentionSeen(), [markAttentionSeen]);
  const [answering, setAnswering] = useState(null);
  const items = attention(state, actor, quarter?.id);
  const groups = [...new Set(items.map((i) => i.group))];
  const decisions = items.filter((i) => i.action === 'answer').length;
  const others = items.length - decisions;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t('My attention')} <span className="text-sm font-normal text-gray-600">— {actor.name}{actor.teamId ? ` · ${state.teams.find((x) => x.id === actor.teamId)?.name}` : ''}</span></h2>
        {actor.teamId && <p className="text-sm text-gray-700 mt-1">{decisions > 1 ? t('{n} asks need an answer from your team.', { n: decisions }) : decisions === 1 ? t('1 ask needs an answer from your team.') : t('No asks waiting for your team.')} {others > 0 && (others > 1 ? t('{n} other items to look at.', { n: others }) : t('1 other item to look at.'))}</p>}
      </div>
      {!actor.teamId && <Empty>{t('This list is team-based. Pick a planner persona (or, with a database, a user with a team) to see asks, answers and stale items.')}</Empty>}
      {actor.teamId && items.length === 0 && <Panel><p className="text-sm">✓ {t('Nothing needs your attention.')}</p></Panel>}
      {groups.map((g) => (
        <Panel key={g} title={`${t(g)} (${items.filter((i) => i.group === g).length})`}>
          <ul className="space-y-1 text-sm">
            {items.filter((i) => i.group === g).map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5">
                <button className="text-left hover:underline flex-1" onClick={() => i.epicId && setOpenEpic(i.epicId)}>{i.text}</button>
                <span className={`text-xs whitespace-nowrap ${i.meta === 'new' ? 'text-indigo-700 font-semibold' : 'text-gray-600'}`}>{i.meta === 'new' ? t('new since your last visit') : t(i.meta)}</span>
                {i.action === 'answer' && <button className={btn.primary} onClick={() => setAnswering(state.dependencies.find((d) => d.id === i.depId))}>{t('Answer')}</button>}
                {i.action === 'acknowledge' && <button className={btn.secondary} title={t("Marks this answer as seen and handled; clears it from your team's readiness")} onClick={() => run('acknowledgeDependency', i.depId)}>{t('Acknowledge')}</button>}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {answering && <AnswerModal dep={answering} onClose={() => setAnswering(null)} />}
    </div>
  );
}
