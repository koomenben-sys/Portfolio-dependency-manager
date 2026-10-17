import React, { useEffect, useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { useT } from '../../i18n';
import { SCENARIOS } from './tourScenarios';
import { Modal, btn } from './ui';

// Demo tour: pick a role, then step through screens with an explanation. Navigation only, no data changes.
export function TourLauncher({ onStart }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const lang = t.lang;
  return (
    <>
      <button className={btn.secondary} onClick={() => setOpen(true)}>{t('Demo tour')}</button>
      {open && (
        <Modal title={t('Choose a role to follow')} onClose={() => setOpen(false)} wide>
          <p className="text-sm text-gray-700 mb-3">{t('Each tour switches the persona and the screen for you and explains what to look at. Nothing is changed in the data.')}</p>
          <ul className="space-y-2">
            {SCENARIOS.map((sc) => (
              <li key={sc.id}>
                <button className="w-full text-left border rounded p-3 hover:border-indigo-400" onClick={() => { setOpen(false); onStart(sc.id); }}>
                  <div className="font-medium">{sc.title[lang]}</div>
                  <div className="text-xs text-gray-600">{sc.intro[lang]} · {sc.steps.length} {t('steps')}</div>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

export function TourPanel({ scenarioId, onClose, setView }) {
  const t = useT();
  const { chooseActor, dataSource } = usePlan();
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  const [i, setI] = useState(0);
  const lang = t.lang;
  const step = sc?.steps[i];
  useEffect(() => {
    if (!step) return;
    if (dataSource === 'mock') chooseActor(sc.persona);
    setView(step.view);
  }, [scenarioId, i]);
  if (!sc || !step) return null;
  return (
    <aside role="dialog" aria-label={sc.title[lang]} className="fixed bottom-4 right-4 z-40 w-[420px] max-w-[95vw] bg-white border border-indigo-200 rounded-lg shadow-2xl">
      <header className="px-4 py-2 border-b flex items-center justify-between bg-indigo-50 rounded-t-lg">
        <div className="text-xs text-indigo-900 font-medium truncate">{sc.title[lang]}</div>
        <button className="text-gray-500 hover:text-gray-800 ml-2" aria-label={t('Close')} onClick={onClose}>×</button>
      </header>
      <div className="p-4">
        <div className="text-xs text-gray-600 mb-1">{t('Step {n} of {total}', { n: i + 1, total: sc.steps.length })}</div>
        <h3 className="font-semibold mb-1">{step.title[lang]}</h3>
        <p className="text-sm text-gray-800">{step.text[lang]}</p>
      </div>
      <footer className="px-4 py-2 border-t flex items-center justify-between">
        <button className={btn.secondary} disabled={i === 0} onClick={() => setI(i - 1)}>{t('Back')}</button>
        <div className="flex gap-1" aria-hidden="true">{sc.steps.map((_, k) => <span key={k} className={`w-2 h-2 rounded-full ${k === i ? 'bg-indigo-600' : 'bg-gray-300'}`} />)}</div>
        {i < sc.steps.length - 1 ? <button className={btn.primary} onClick={() => setI(i + 1)}>{t('Next')}</button> : <button className={btn.primary} onClick={onClose}>{t('Finish')}</button>}
      </footer>
    </aside>
  );
}
