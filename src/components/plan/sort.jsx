import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Undo2 } from 'lucide-react';
import { useT } from '../../i18n';
import { cls } from './core';

// Generic sorting for every table and list (docs/design.md section 27, D99; owner proposal "Voorstel — sorteren").
// Click a column header: ascending; again: descending; a third time: back to the default order (rank). Remembered
// per table per person per device (localStorage `kp.sort.<table>.<actorId>`, try/catch). Sorting is a temporary
// view: Prioriteren hides the drag handle while sorted, and the chip "Gesorteerd op <kolom> ↑ · Terug naar rang"
// sits above the table. Strings compare with localeCompare, numbers numerically, empty values last; ties keep the
// default order.
const storageKey = (table, actorId) => `kp.sort.${table}.${actorId || 'anon'}`;
const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v.col === 'string' && (v.dir === 'asc' || v.dir === 'desc') ? v : null; } catch { return null; } };
const write = (k, v) => { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* private mode */ } };
const cmp = (a, b) => {
  const ea = a == null || a === ''; const eb = b == null || b === '';
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

export function useTableSort(table, actorId) {
  const k = storageKey(table, actorId);
  const [sort, setSort] = useState(() => read(k));
  useEffect(() => { setSort(read(storageKey(table, actorId))); }, [table, actorId]);
  const toggle = (col) => setSort((s) => { const n = !s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null; write(k, n); return n; });
  const clear = () => { write(k, null); setSort(null); };
  // `accessors`: { col: (row) => value }. Rows whose column has no accessor keep their order.
  const apply = (rows, accessors) => {
    const get = sort && accessors[sort.col];
    if (!get) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    // Empty values stay last in both directions: compare emptiness first, then the value with the direction.
    return rows.map((r, i) => [r, i, get(r)]).sort(([, i, a], [, j, b]) => {
      const ea = a == null || a === ''; const eb = b == null || b === '';
      if (ea !== eb) return ea ? 1 : -1;
      return cmp(a, b) * dir || i - j;
    }).map(([r]) => r);
  };
  return { sort, toggle, clear, apply };
}

// Header button: label + ↑ / ↓ when active. Use inside a <th> (SortTh sets aria-sort) or a list header.
export function SortButton({ col, label, sort, onToggle, className = '' }) {
  const t = useT();
  const active = sort?.col === col;
  return (
    <button type="button" onClick={() => onToggle(col)} title={t('Sort by {col}', { col: label })} aria-pressed={active}
      className={`inline-flex items-center gap-1 h-7 -mx-1 px-1 rounded-control font-medium hover:text-ink focus-ring transition-base ${active ? 'text-ink' : ''} ${className}`}>
      {label}{active && (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
    </button>
  );
}
export function SortTh({ col, label, sort, onToggle, className = '' }) {
  const active = sort?.col === col;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <SortButton col={col} label={label} sort={sort} onToggle={onToggle} />
    </th>
  );
}
// "Gesorteerd op Team ↑ · Terug naar rang" (nothing when the default order is shown).
export function SortedChip({ sort, labels, onClear, backLabel, className = '' }) {
  const t = useT();
  if (!sort) return null;
  return (
    <span className={`inline-flex items-center gap-2 h-7 pl-2.5 pr-1 rounded-full bg-accent-50 text-accent-700 text-caption font-medium whitespace-nowrap ${className}`} role="status">
      {t('Sorted by {col}', { col: labels[sort.col] || sort.col })} {sort.dir === 'asc' ? '↑' : '↓'}
      <button type="button" className={`${cls.quiet} !h-6 text-accent-700 hover:bg-accent-50`} onClick={onClear}><Undo2 size={12} aria-hidden="true" />{backLabel || t('Back to rank')}</button>
    </span>
  );
}
