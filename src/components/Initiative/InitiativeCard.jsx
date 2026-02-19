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
  onAddDependency
}) {
  const initiativeDeps = dependencies.filter(d => d.initiativeId === initiative.id);

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
            onChange={(e) => onUpdate(initiative.id, 'name', e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm">Effort</label>
          <select
            value={initiative.effort}
            onChange={(e) => onUpdate(initiative.id, 'effort', e.target.value)}
            className="w-full border rounded px-3 py-2"
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
                onClick={() => onToggleQuarter(initiative.id, q)}
                className={`px-3 py-1 rounded border ${
                  initiative.quarters.includes(q)
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-50'
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
            onChange={(e) => onUpdate(initiative.id, 'portfolio', e.target.value)}
            className="w-full border rounded px-3 py-2"
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
            onChange={(e) => onUpdate(initiative.id, 'valueType', e.target.value)}
            className="w-full border rounded px-3 py-2"
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
              onChange={(e) => onUpdate(initiative.id, 'valueAmount', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <div className="flex justify-between mb-3">
          <h4 className="font-semibold">Dependencies ({initiativeDeps.length})</h4>
          <button
            onClick={() => onAddDependency(initiative.id)}
            className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
          >
            Add
          </button>
        </div>
      </div>

      <button
        onClick={() => onDelete(initiative.id)}
        className="mt-4 text-red-600 hover:text-red-800 flex items-center gap-2"
      >
        <Trash size={16} /> Delete
      </button>
    </div>
  );
}
