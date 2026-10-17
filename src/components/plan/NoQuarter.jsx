import React from 'react';
import { Panel } from './ui';
import { useT } from '../../i18n';

// Shown by every quarter-bound view when the organisation has no quarter yet (fresh database).
export function NoQuarter() {
  const t = useT();
  return (
    <Panel title={t('No quarter yet')}>
      <p className="text-sm text-gray-700">{t('Create the quarter you want to plan in')} <a className="text-indigo-700 hover:underline" href="#instellingen">{t('Settings › Quarters')}</a>. {t('The organisation setup checklist there walks through the rest.')}</p>
    </Panel>
  );
}
