import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { attention } from '../domain/plan';
import { Panel, Empty, btn } from '../components/plan/ui';
import { EpicPanel } from '../components/plan/EpicPanel';
import { AnswerModal } from '../components/plan/AnswerModal';

// Notification-free inbox derived from state (AC F4). Rows are actionable (review: PO, UX).
export function AttentionView() {
  const { state, actor, quarter } = usePlan();
  const [openEpic, setOpenEpic] = useState(null);
  const [answering, setAnswering] = useState(null);
  const items = attention(state, actor, quarter?.id);
  const groups = [...new Set(items.map((i) => i.group))];
  const decisions = items.filter((i) => i.action === 'answer').length;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">My attention <span className="text-sm font-normal text-gray-600">— {actor.name}{actor.teamId ? ` · ${state.teams.find((t) => t.id === actor.teamId)?.name}` : ''}</span></h2>
        {actor.teamId && <p className="text-sm text-gray-700 mt-1">{decisions > 0 ? `${decisions} ask${decisions > 1 ? 's' : ''} need an answer from your team.` : 'No asks waiting for your team.'} {items.length - decisions > 0 && `${items.length - decisions} other item${items.length - decisions > 1 ? 's' : ''} to look at.`}</p>}
      </div>
      {!actor.teamId && <Empty>This list is team-based. Pick a planner persona (or, with a database, a user with a team) to see asks, answers and stale items.</Empty>}
      {actor.teamId && items.length === 0 && <Panel><p className="text-sm">✓ Nothing needs your attention.</p></Panel>}
      {groups.map((g) => (
        <Panel key={g} title={`${g} (${items.filter((i) => i.group === g).length})`}>
          <ul className="space-y-1 text-sm">
            {items.filter((i) => i.group === g).map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5">
                <button className="text-left hover:underline flex-1" onClick={() => i.epicId && setOpenEpic(i.epicId)}>{i.text}</button>
                <span className={`text-xs whitespace-nowrap ${i.meta === 'new' ? 'text-indigo-700 font-semibold' : 'text-gray-600'}`}>{i.meta === 'new' ? 'new since your last visit' : i.meta}</span>
                {i.action === 'answer' && <button className={btn.primary} onClick={() => setAnswering(state.dependencies.find((d) => d.id === i.depId))}>Answer</button>}
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
