import React from 'react';
import { usePlan } from '../../context/PlanContext';
import { useT } from '../../i18n';

// Small status dot (docs/design.md section 18). `liveStatus` from PlanContext:
// 'live' (Supabase Realtime, or other demo tabs via the storage event), 'polling' (refresh every 30 s), 'offline'.
const META = { live: ['bg-emerald-500', 'Live'], polling: ['bg-amber-500', '30 s'], offline: ['bg-gray-400', 'Offline'] };

export function LiveIndicator({ className = '' }) {
  const { liveStatus = 'polling' } = usePlan() || {};
  const t = useT();
  const [dot, label] = META[liveStatus] || META.polling;
  return (
    <span role="status" className={`inline-flex items-center gap-1 text-xs text-gray-600 ${className}`}>
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${dot}`} />{t(label)}
    </span>
  );
}
