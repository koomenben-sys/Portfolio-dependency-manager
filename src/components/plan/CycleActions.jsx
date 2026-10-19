import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { useT } from '../../i18n';
import { ConfirmDialog } from './core';

// Phase transitions are buttons at the end of step 3 (docs/design.md section 23, D64/M7): "Plan vastzetten" on
// Afstemmen, "Kwartaal afsluiten" on Voortgang. The phase word in the header is plain text (App.jsx); the menu
// behind it (Release B, D56) is gone. Both dialogs confirm without a reason field (D62).

// "Plan vastzetten": no reason field (D62), one command (baseline + locked), the word becomes Uitvoeren.
export function LockPlanDialog({ quarter, onClose, onDone }) {
  const { run } = usePlan();
  const t = useT();
  const [err, setErr] = useState(null);
  return (
    <ConfirmDialog title={t('Lock plan')} line={t('Changes then need a reason.')} confirmLabel={t('Lock plan')} onClose={onClose} error={err} withReason={false}
      onConfirm={async () => { const r = await run('lockPlan', quarter.id, ''); if (r.ok) { onClose(); onDone?.(); } else setErr(r.error); }} />
  );
}

export function CloseQuarterDialog({ quarter, onClose, onDone }) {
  const { run } = usePlan();
  const t = useT();
  const [err, setErr] = useState(null);
  return (
    <ConfirmDialog title={t('Close quarter')} line={t('Then Result opens.')} confirmLabel={t('Close quarter')} onClose={onClose} error={err} withReason={false}
      onConfirm={async () => { const r = await run('closeQuarter', quarter.id, ''); if (r.ok) { onClose(); onDone?.(); } else setErr(r.error); }} />
  );
}
