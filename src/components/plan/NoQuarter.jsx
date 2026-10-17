import React from 'react';
import { Panel } from './ui';

// Shown by every quarter-bound view when the organisation has no quarter yet (fresh database).
export function NoQuarter() {
  return (
    <Panel title="No quarter yet">
      <p className="text-sm text-gray-700">Create the quarter you want to plan in <a className="text-indigo-700 hover:underline" href="#settings">Settings › Quarters</a>. The organisation setup checklist there walks through the rest.</p>
    </Panel>
  );
}
