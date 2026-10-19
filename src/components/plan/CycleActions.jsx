import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePlan } from '../../context/PlanContext';
import { isAdmin } from '../../data/repository';
import { cyclePhase, isLockedPhase } from '../../domain/model';
import { inExecution } from '../../domain/rhythm';
import { useT } from '../../i18n';
import { Menu, menuItem, ConfirmDialog } from './core';

// Release B (D54/D56, L6/L10): the cycle-phase word in the header. Admins get a small menu — "Plan vastzetten"
// while Voorbereiden / Event, "Kwartaal afsluiten" while Uitvoeren, "Afsluiten openen" once closed; everyone else
// sees the word, which becomes a link to #afsluiten when the quarter is closed.
export function CyclePhaseWord({ quarter, setView }) {
  const { actor } = usePlan();
  const t = useT();
  const [dialog, setDialog] = useState(null); // 'lock' | 'close'
  if (!quarter) return null;
  const word = t(cyclePhase(quarter.phase));
  const closed = quarter.phase === 'closed';
  const base = 'hidden md:inline-flex items-center gap-1 h-8 px-2 rounded-control text-caption text-muted whitespace-nowrap focus-ring';
  if (!isAdmin(actor)) {
    return closed
      ? <button type="button" className={`${base} hover:bg-surface-2 hover:text-ink`} onClick={() => setView('afsluiten')} title={t('Open Closing')} data-tour="cycle">{word}</button>
      : <span className={base} title={t('Cycle phase')} data-tour="cycle">{word}</span>;
  }
  return (
    <>
      <Menu ariaLabel={t('Cycle phase')} width="w-56" button={({ ref, toggle, open, ...a }) => (
        <button ref={ref} type="button" onClick={toggle} {...a} className={`${base} hover:bg-surface-2 hover:text-ink ${open ? 'bg-surface-2 text-ink' : ''}`} title={t('Cycle phase')} data-tour="cycle">{word}<ChevronDown size={12} aria-hidden="true" /></button>
      )}>
        {!isLockedPhase(quarter.phase) && <button role="menuitem" data-close className={menuItem} onClick={() => setDialog('lock')}>{t('Lock plan')}</button>}
        {inExecution(quarter.phase) && <button role="menuitem" data-close className={menuItem} onClick={() => setDialog('close')}>{t('Close quarter')}</button>}
        {closed && <button role="menuitem" data-close className={menuItem} onClick={() => setView('afsluiten')}>{t('Open Closing')}</button>}
      </Menu>
      {dialog === 'lock' && <LockPlanDialog quarter={quarter} onClose={() => setDialog(null)} />}
      {dialog === 'close' && <CloseQuarterDialog quarter={quarter} onClose={() => setDialog(null)} onDone={() => setView('afsluiten')} />}
    </>
  );
}

// "Plan vastzetten": optional reason, one command (baseline + locked), the word becomes Uitvoeren.
export function LockPlanDialog({ quarter, onClose, onDone }) {
  const { run } = usePlan();
  const t = useT();
  const [err, setErr] = useState(null);
  return (
    <ConfirmDialog title={t('Lock plan')} line={t('Changes then need a reason.')} confirmLabel={t('Lock plan')} onClose={onClose} error={err}
      onConfirm={async (reason) => { const r = await run('lockPlan', quarter.id, reason); if (r.ok) { onClose(); onDone?.(); } else setErr(r.error); }} />
  );
}

export function CloseQuarterDialog({ quarter, onClose, onDone }) {
  const { run } = usePlan();
  const t = useT();
  const [err, setErr] = useState(null);
  return (
    <ConfirmDialog title={t('Close quarter')} line={t('Then Closing opens.')} confirmLabel={t('Close quarter')} onClose={onClose} error={err}
      onConfirm={async (reason) => { const r = await run('closeQuarter', quarter.id, reason); if (r.ok) { onClose(); onDone?.(); } else setErr(r.error); }} />
  );
}
