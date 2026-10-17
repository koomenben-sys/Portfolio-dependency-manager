import React, { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { attention } from '../domain/plan';
import { Panel, Empty } from '../components/plan/ui';
import { EpicPanel } from '../components/plan/EpicPanel';

// Notification-free inbox derived from state (AC F4).
export function AttentionView() {
  const { state, actor, quarter } = usePlan();
  const [openEpic, setOpenEpic] = useState(null);
  const items = attention(state, actor, quarter?.id);
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">My attention <span className="text-sm font-normal text-gray-500">— {actor.name}{actor.teamId ? ` · ${state.teams.find((t) => t.id === actor.teamId)?.name}` : ''}</span></h2>
      {!actor.teamId && <Empty>This list is team-based. Pick a planner persona (or, with a database, a user with a team) to see asks, answers and stale items.</Empty>}
      {actor.teamId && items.length === 0 && <Panel><p className="text-sm">✓ Nothing needs your attention.</p></Panel>}
      {groups.map((g) => (
        <Panel key={g} title={`${g} (${items.filter((i) => i.group === g).length})`}>
          <ul className="space-y-1 text-sm">
            {items.filter((i) => i.group === g).map((i) => (
              <li key={i.key} className="flex justify-between gap-3 border-b last:border-0 py-1">
                <button className="text-left hover:underline" onClick={() => i.epicId && setOpenEpic(i.epicId)}>{i.text}</button>
                <span className={`text-xs whitespace-nowrap ${i.meta === 'new' ? 'text-indigo-700 font-semibold' : 'text-gray-500'}`}>{i.meta}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}
