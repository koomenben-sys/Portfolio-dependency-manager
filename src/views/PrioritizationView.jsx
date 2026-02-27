import React, { useState } from 'react';

export function PrioritizationView({ initiatives, portfolios, dependencies, reorderInitiatives, role }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [sortMode, setSortMode]         = useState('priority');

  const isAdmin      = role === 'admin';
  const isDragEnabled = isAdmin && sortMode === 'priority';

  const getSortedInitiatives = () => {
    const base = [...initiatives];
    switch (sortMode) {
      case 'name-asc':
        return base.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name-desc':
        return base.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'value-high':
        return base.sort((a, b) => {
          const aVal = a.valueType === 'EUR' ? parseFloat(a.valueAmount) || 0 : -1;
          const bVal = b.valueType === 'EUR' ? parseFloat(b.valueAmount) || 0 : -1;
          return bVal - aVal;
        });
      case 'value-low':
        return base.sort((a, b) => {
          const aVal = a.valueType === 'EUR' ? parseFloat(a.valueAmount) || 0 : Infinity;
          const bVal = b.valueType === 'EUR' ? parseFloat(b.valueAmount) || 0 : Infinity;
          return aVal - bVal;
        });
      case 'committed':
        return base.sort((a, b) => {
          const aC = dependencies.filter(d => d.initiativeId === a.id && d.status === 'Committed').length;
          const bC = dependencies.filter(d => d.initiativeId === b.id && d.status === 'Committed').length;
          return bC - aC;
        });
      case 'not-committed':
        return base.sort((a, b) => {
          const aU = dependencies.filter(d => d.initiativeId === a.id && d.status !== 'Committed').length;
          const bU = dependencies.filter(d => d.initiativeId === b.id && d.status !== 'Committed').length;
          return bU - aU;
        });
      default:
        return base.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    }
  };

  const sortedInitiatives = getSortedInitiatives();

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...sortedInitiatives];
    const draggedItem = newOrder[draggedIndex];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedItem);

    reorderInitiatives(newOrder.map((item, idx) => ({ ...item, priority: idx + 1 })));
    setDraggedIndex(index);
  };

  const handleDragEnd = () => setDraggedIndex(null);

  return (
    <div>
      <div className="flex items-center mb-6">
        <h2 className="text-2xl font-bold">Initiative Prioritization</h2>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600">Sort:</label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="priority">Priority order</option>
            <option value="name-asc">Name A → Z</option>
            <option value="name-desc">Name Z → A</option>
            <option value="value-high">Value high → low</option>
            <option value="value-low">Value low → high</option>
            <option value="committed">Most committed</option>
            <option value="not-committed">Most unresolved</option>
          </select>
        </div>
      </div>

      {isDragEnabled && (
        <p className="text-gray-600 text-sm mb-4">Drag and drop to reorder initiatives by priority</p>
      )}
      {!isAdmin && sortMode === 'priority' && (
        <p className="text-amber-600 text-sm mb-4 bg-amber-50 border border-amber-200 rounded px-3 py-2 inline-block">
          Reordering requires admin access. Showing current priority order.
        </p>
      )}

      <div className="bg-white rounded shadow border">
        <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 border-b font-semibold text-sm">
          <div className="col-span-1">#</div>
          <div className="col-span-2">Initiative</div>
          <div className="col-span-2">Team</div>
          <div className="col-span-2">Portfolio</div>
          <div className="col-span-1">Quarters</div>
          <div className="col-span-2">Value</div>
          <div className="col-span-2">Dependencies</div>
        </div>

        {sortedInitiatives.map((initiative, idx) => {
          const portfolio = portfolios.find(p => p.id == initiative.portfolio);
          const deps       = dependencies.filter(d => d.initiativeId === initiative.id);
          const committed  = deps.filter(d => d.status === 'Committed').length;
          const pending    = deps.filter(d => d.status === 'Pending').length;
          const discussion = deps.filter(d => d.status === 'Under Discussion').length;
          const blocked    = deps.filter(d => d.status === "Can't Commit").length;
          const total      = deps.length;

          return (
            <div
              key={initiative.id}
              draggable={isDragEnabled}
              onDragStart={isDragEnabled ? (e) => handleDragStart(e, idx) : undefined}
              onDragOver={isDragEnabled ? (e) => handleDragOver(e, idx) : undefined}
              onDragEnd={isDragEnabled ? handleDragEnd : undefined}
              className={`grid grid-cols-12 gap-4 p-4 border-b hover:bg-gray-50 ${
                isDragEnabled ? 'cursor-move' : 'cursor-default'
              } ${draggedIndex === idx ? 'opacity-50' : ''}`}
            >
              <div className="col-span-1 flex items-center font-bold text-gray-600">
                {idx + 1}
              </div>
              <div className="col-span-2 flex items-center font-medium">
                {initiative.name || 'Unnamed'}
              </div>
              <div className="col-span-2 flex items-center text-sm">{initiative.team}</div>
              <div className="col-span-2 flex items-center text-sm">
                {portfolio?.name || <span className="text-gray-400">None</span>}
              </div>
              <div className="col-span-1 flex items-center text-sm">
                {initiative.quarters.join(', ') || <span className="text-gray-400">-</span>}
              </div>
              <div className="col-span-2 flex items-center text-sm">
                {initiative.valueType === 'EUR' && initiative.valueAmount
                  ? <span>€{parseFloat(initiative.valueAmount).toLocaleString()}</span>
                  : <span className="text-gray-600">{initiative.valueType || <span className="text-gray-400">-</span>}</span>
                }
              </div>
              <div className="col-span-2 flex items-center">
                {total === 0 ? (
                  <span className="text-xs text-gray-400">No deps</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {committed > 0 && (
                      <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                        {committed} committed
                      </span>
                    )}
                    {pending > 0 && (
                      <span className="px-2 py-1 rounded text-xs bg-gray-200 text-gray-700">
                        {pending} pending
                      </span>
                    )}
                    {discussion > 0 && (
                      <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                        {discussion} discussion
                      </span>
                    )}
                    {blocked > 0 && (
                      <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 font-semibold">
                        {blocked} blocked
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {initiatives.length === 0 && (
          <div className="p-12 text-center text-gray-500">No initiatives yet</div>
        )}
      </div>
    </div>
  );
}
