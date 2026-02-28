// ─── Cards ────────────────────────────────────────────────────────────────────
export const card = {
  base:      'bg-white rounded-lg shadow-sm border border-gray-200',
  entity:    'bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-indigo-500',
  fullWidth: 'bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-indigo-500 col-span-2',
  padding:   'p-6',
};

// ─── Status ───────────────────────────────────────────────────────────────────
// Keyed by DEPENDENCY_STATUSES values from constants/index.js
export const status = {
  Committed: {
    bg:            'bg-green-50',
    bgMedium:      'bg-green-100',
    bgStrong:      'bg-green-200',
    badge:         'bg-green-100 text-green-800',
    text:          'text-green-800',
    textLight:     'text-green-600',
    border:        'border-green-200',
    button:        'bg-green-100 hover:bg-green-200',
    buttonActive:  'bg-green-600 text-white',
    icon:          '✓',
  },
  Pending: {
    bg:            'bg-gray-50',
    bgMedium:      'bg-gray-100',
    bgStrong:      'bg-gray-200',
    badge:         'bg-gray-200 text-gray-700',
    text:          'text-gray-700',
    textLight:     'text-gray-500',
    border:        'border-gray-200',
    button:        'bg-gray-100 hover:bg-gray-200',
    buttonActive:  'bg-gray-600 text-white',
    icon:          '⏳',
  },
  'Under Discussion': {
    bg:            'bg-yellow-50',
    bgMedium:      'bg-yellow-100',
    bgStrong:      'bg-yellow-200',
    badge:         'bg-yellow-100 text-yellow-800',
    text:          'text-yellow-800',
    textLight:     'text-yellow-600',
    border:        'border-yellow-200',
    button:        'bg-yellow-100 hover:bg-yellow-200',
    buttonActive:  'bg-yellow-600 text-white',
    icon:          '💬',
  },
  "Can't Commit": {
    bg:            'bg-red-50',
    bgMedium:      'bg-red-100',
    bgStrong:      'bg-red-200',
    badge:         'bg-red-100 text-red-800',
    text:          'text-red-800',
    textLight:     'text-red-600',
    border:        'border-red-200',
    button:        'bg-red-100 hover:bg-red-200',
    buttonActive:  'bg-red-600 text-white',
    icon:          '🚫',
  },
};

// ─── Buttons ──────────────────────────────────────────────────────────────────
export const btn = {
  primary:   'bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700',
  primarySm: 'bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700',
  secondary: 'bg-gray-100 px-3 py-1 rounded hover:bg-gray-200',
  danger:    'text-red-600 hover:text-red-800',
  dangerSm:  'text-red-500 hover:text-red-700 text-sm px-1',
};

// ─── Inputs ───────────────────────────────────────────────────────────────────
export const input = {
  sm: 'border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500',
  md: 'border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500',
  lg: 'border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500',
};

// ─── Typography ───────────────────────────────────────────────────────────────
export const type = {
  pageHeading:    'text-2xl font-bold mb-6',
  sectionHeading: 'font-bold mb-4',
  label:          'font-semibold text-sm',
  body:           'text-sm',
  meta:           'text-xs text-gray-500',
  metaMono:       'text-xs text-gray-400 font-mono',
};

// ─── Left accent borders ──────────────────────────────────────────────────────
export const accent = {
  indigo: 'border-l-4 border-l-indigo-500',
  green:  'border-l-4 border-l-green-500',
  red:    'border-l-4 border-l-red-500',
  orange: 'border-l-4 border-l-orange-500',
};

// ─── Navigation ───────────────────────────────────────────────────────────────
export const nav = {
  tabActive:    'bg-indigo-600 text-white',
  tabInactive:  'hover:bg-gray-50',
  subTabActive: 'border-b-2 border-indigo-600 text-indigo-600',
};
