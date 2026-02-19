import React from 'react';
import { Trash } from '../common/Icons';
import { TEAMS, QUARTERS, EFFORT_SIZES } from '../../constants';

export function DependencyItem({ 
  dependency, 
  currentTeam,
  onUpdate, 
  onDelete,
  onToggleQuarter 
}) {
  const availableTeams = TEAMS.filter(t => t !== currentTeam);

  return (
    <div className="bg-gray-50 p-3 rounded mb-2">
      <div className="flex justify-between mb-1">
        <span className="text-xs text-gray-400 font-mono">
          {dependency.refCode || 'N/A'}
        </span>
      </div>

      <div className="flex gap-2 mb-2">
        <select
          value={dependency.dependsOnTeam}
          onChange={(e) => onUpdate(dependency.id, 'dependsOnTeam', e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="">Team...</option>
          {availableTeams.map(team => (
            <option key={team}>{team}</option>
          ))}
        </select>

        <input
          value={dependency.description}
          onChange={(e) => onUpdate(dependency.id, 'description', e.target.value)}
          className="flex-1 border rounded px-2 py-1"
          placeholder="What?"
        />

        <button
          onClick={() => onDelete(dependency.id)}
          className="text-red-600 hover:text-red-800"
        >
          <Trash size={16} />
        </button>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm">Needed:</span>
        {QUARTERS.map(q => (
          <button
            key={q}
            onClick={() => onToggleQuarter(dependency.id, q)}
            className={`px-2 py-1 text-sm rounded ${
              (dependency.quarters || []).includes(q)
                ? 'bg-blue-600 text-white'
                : 'border hover:bg-gray-100'
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
              ? 'bg-green-100'
              : dependency.status === "Can't Commit"
              ? 'bg-red-100'
              : dependency.status === 'Under Discussion'
              ? 'bg-yellow-100'
              : 'bg-gray-100'
          }`}
        >
          {dependency.status}
        </span>
      </div>
    </div>
  );
}
