import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { usePlan } from '../../context/PlanContext';
import { useT } from '../../i18n';
import { SCENARIOS } from './tourScenarios';
import { cls } from './core';

// Coach-mark card (docs/design.md section 19, D33): switches persona + screen per step, highlights the
// [data-tour] target, one sentence of text. Navigation only, no data changes. Started from the account menu.
export const TOUR_EVENT = 'kp-tour';

// Views subscribe to tour nudges (tab, matrix) with this hook.
export function useTourNudge(handler) {
  useEffect(() => { const on = (e) => handler(e.detail || {}); window.addEventListener(TOUR_EVENT, on); return () => window.removeEventListener(TOUR_EVENT, on); }, [handler]);
}

export function TourPanel({ scenarioId, onClose, setView }) {
  const t = useT();
  const { chooseActor, dataSource } = usePlan();
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  const [i, setI] = useState(0);
  const lang = t.lang;
  const step = sc?.steps[i];
  useEffect(() => {
    if (!step) return undefined;
    if (dataSource === 'mock') chooseActor(sc.persona);
    setView(step.view);
    let el = null;
    const raf = requestAnimationFrame(() => setTimeout(() => {
      if (step.ui) window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: step.ui }));
      setTimeout(() => {
        el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
        if (el) { el.classList.add('tour-highlight'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      }, 60);
    }, 30));
    return () => { cancelAnimationFrame(raf); el?.classList.remove('tour-highlight'); };
  }, [scenarioId, i]);
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [onClose]);
  if (!sc || !step) return null;
  return (
    <aside role="dialog" aria-label={sc.title[lang] || sc.title.nl} aria-live="polite" className="fixed bottom-4 right-4 z-toast w-[340px] max-w-[95vw] bg-surface border border-border rounded-panel shadow-lg anim-slide-in-up">
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-micro font-semibold uppercase tracking-wide text-accent-700 truncate">{sc.title[lang] || sc.title.nl}</div>
          <p className="text-body text-ink mt-1">{step.text[lang] || step.text.nl}</p>
        </div>
        <button className={cls.icon} aria-label={t('Close')} onClick={onClose}><X size={16} /></button>
      </div>
      <footer className="px-4 pb-3 flex items-center justify-between">
        <div className="flex gap-1" aria-label={t('Step {n} of {total}', { n: i + 1, total: sc.steps.length })} role="img">{sc.steps.map((_, k) => <span key={k} className={`w-1.5 h-1.5 rounded-full ${k === i ? 'bg-accent' : 'bg-border-strong'}`} />)}</div>
        <div className="flex gap-1">
          <button className={cls.secondary} disabled={i === 0} onClick={() => setI(i - 1)}>{t('Back')}</button>
          {i < sc.steps.length - 1 ? <button className={cls.primary} onClick={() => setI(i + 1)}>{t('Next')}</button> : <button className={cls.primary} onClick={onClose}>{t('Finish')}</button>}
        </div>
      </footer>
    </aside>
  );
}
