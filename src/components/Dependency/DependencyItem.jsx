import React from 'react';
import { Trash } from '../common/Icons';
import { QUARTERS, EFFORT_SIZES } from '../../constants';

export function DependencyItem({
  dependency,
  currentTeam,
  teams,
  onUpdate,
  onDelete,
  onToggleQuarter,
  role,
}) {
  const availableTeams = (teams || []).filter(t => t !== currentTeam);
  const canEdit = role === 'admin' || role === 'editor';
  const roClass = !canEdit ? 'bg-gray-50 cursor-default' : '';

  return (
    <div className="bg-gray-50 p-3 rounded-md mb-2 border border-gray-200">
      <div className="flex justify-between mb-1">
        <span className="text-xs text-gray-400 font-mono">
          {dependency.refCode || 'N/A'}
        </span>
      </div>

      <div className="flex gap-2 mb-2">
        <select
          value={dependency.dependsOnTeam}
          onChange={(e) => canEdit && onUpdate(dependency.id, 'dependsOnTeam', e.target.value)}
          disabled={!canEdit}
          className={`border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${roClass}`}
        >
          <option value="">Team...</option>
          {availableTeams.map(team => (
            <option key={team}>{team}</option>
          ))}
        </select>

        <input
          value={dependency.description}
          onChange={(e) => canEdit && onUpdate(dependency.id, 'description', e.target.value)}
          readOnly={!canEdit}
          className={`flex-1 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${roClass}`}
          placeholder="What?"
        />

        {canEdit && (
          <button
            onClick={() => onDelete(dependency.id)}
            className="text-red-600 hover:text-red-800"
          >
            <Trash size={16} />
          </button>
        )}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm">Needed:</span>
        {QUARTERS.map(q => (
          <button
            key={q}
            onClick={() => canEdit && onToggleQuarter(dependency.id, q)}
            disabled={!canEdit}
            className={`px-2 py-1 text-sm rounded ${
              (dependency.quarters || []).includes(q)
                ? 'bg-indigo-600 text-white'
                : canEdit
                  ? 'border hover:bg-gray-100'
                  : 'border opacity-60 cursor-default'
            }`}
          >
            {q}
          </button>
        ))}

        {dependency.effort && (
          <span className="text-sm ml-2">Effort: {dependency.effort}</span>
        )}

        <span
          className={`px-3 py-1 rounded text-sm ml-auto ${
            dependency.status === 'Committed'
              ? 'bg-green-100 text-green-800'
              : dependency.status === "Can't Commit"
              ? 'bg-red-100 text-red-800'
              : dependency.status === 'Under Discussion'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          {dependency.status}
        </span>
      </div>
    </div>
  );
}
