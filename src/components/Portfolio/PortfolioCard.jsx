import React from 'react';
import { Trash } from '../common/Icons';

export function PortfolioCard({ portfolio, onUpdate, onDelete, role }) {
  const isAdmin   = role === 'admin';
  const readOnly  = !isAdmin;
  const roClass   = readOnly ? 'bg-gray-50 cursor-default' : '';

  return (
    <div className="bg-white p-6 rounded mb-4 shadow">
      <div className="flex justify-between mb-2">
        <span className="text-xs text-gray-500 font-mono">
          {portfolio.refCode || 'N/A'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Portfolio name</label>
          <input
            value={portfolio.name}
            onChange={(e) => !readOnly && onUpdate(portfolio.id, 'name', e.target.value)}
            readOnly={readOnly}
            className={`w-full border rounded px-3 py-2 ${roClass}`}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Owner</label>
          <input
            value={portfolio.owner}
            onChange={(e) => !readOnly && onUpdate(portfolio.id, 'owner', e.target.value)}
            readOnly={readOnly}
            className={`w-full border rounded px-3 py-2 ${roClass}`}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Year</label>
          <input
            type="number"
            value={portfolio.year}
            onChange={(e) => !readOnly && onUpdate(portfolio.id, 'year', e.target.value)}
            readOnly={readOnly}
            className={`w-full border rounded px-3 py-2 ${roClass}`}
          />
        </div>

        <div className="flex items-end">
          {isAdmin && (
            <button
              onClick={() => onDelete(portfolio.id)}
              className="text-red-600 hover:text-red-800"
            >
              <Trash size={18} />
            </button>
          )}
        </div>

        <div className="col-span-2">
          <label className="block text-sm mb-1">Description</label>
          <textarea
            value={portfolio.description}
            onChange={(e) => !readOnly && onUpdate(portfolio.id, 'description', e.target.value)}
            readOnly={readOnly}
            className={`w-full border rounded px-3 py-2 ${roClass}`}
            rows="3"
          />
        </div>
      </div>
    </div>
  );
}
