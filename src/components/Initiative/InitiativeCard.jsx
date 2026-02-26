import React from 'react';
import { Trash } from '../common/Icons';
import { QUARTERS, EFFORT_SIZES, VALUE_TYPES } from '../../constants';

export function InitiativeCard({
  initiative,
  portfolios,
  dependencies,
  onUpdate,
  onDelete,
  onToggleQuarter,
  onAddDependency,
  role,
}) {
  const initiativeDeps = dependencies.filter(d => d.initiativeId === initiative.id);
  const canEdit = role === 'admin' || role === 'editor';
  const roClass = !canEdit ? 'bg-gray-50 cursor-default' : '';

  return (
    <div className="bg-white p-6 rounded mb-4 shadow">
      <div className="flex justify-between mb-2">
        <span className="text-xs text-gray-500 font-mono">
          {initiative.refCode || 'N/A'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="col-span-2">
          <label className="text-sm">Name</label>
          <input
            value={initiative.name}
            onChange={(e) => canEdit && onUpdate(initiative.id, 'name', e.target.value)}
            readOnly={!canEdit}
            className={`w-full border rounded px-3 py-2 ${roClass}`}
          />
        </div>

        <div>
          <label className="text-sm">Effort</label>
          <select
            value={initiative.effort}
            onChange={(e) => canEdit && onUpdate(initiative.id, 'effort', e.target.value)}
            disabled={!canEdit}
            className={`w-full border rounded px-3 py-2 ${roClass}`}
          >
            {EFFORT_SIZES.map(size => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm">Quarters</label>
          <div className="flex gap-2">
            {QUARTERS.map(q => (
              <button
                key={q}
                onClick={() => canEdit && onToggleQuarter(initiative.id, q)}
                disabled={!canEdit}
                className={`px-3 py-1 rounded border ${
                  initiative.quarters.includes(q)
                    ? 'bg-blue-600 text-white'
                    : canEdit
                      ? 'hover:bg-gray-50'
                      : 'opacity-60 cursor-default'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm">Portfolio</label>
          <select
            value={initiative.portfolio}
            onChange={(e) => canEdit && onUpdate(initiative.id, 'portfolio', e.target.value)}
            disabled={!canEdit}
            className={`w-full border rounded px-3 py-2 ${roClass}`}
          >
            <option value="">Select...</option>
            {portfolios.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm">Value</label>
          <select
            value={initiative.valueType}
            onChange={(e) => canEdit && onUpdate(initiative.id, 'valueType', e.target.value)}
            disabled={!canEdit}
            className={`w-full border rounded px-3 py-2 ${roClass}`}
          >
            {VALUE_TYPES.map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>

        {initiative.valueType === 'EUR' && (
          <div>
            <label className="text-sm">Amount</label>
            <input
              value={initiative.valueAmount}
              onChange={(e) => canEdit && onUpdate(initiative.id, 'valueAmount', e.target.value)}
              readOnly={!canEdit}
              className={`w-full border rounded px-3 py-2 ${roClass}`}
            />
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <div className="flex justify-between mb-3">
          <h4 className="font-semibold">Dependencies ({initiativeDeps.length})</h4>
          {canEdit && (
            <button
              onClick={() => onAddDependency(initiative.id)}
              className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
            >
              Add
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <button
          onClick={() => onDelete(initiative.id)}
          className="mt-4 text-red-600 hover:text-red-800 flex items-center gap-2"
        >
          <Trash size={16} /> Delete
        </button>
      )}
    </div>
  );
}
