import React, { useState } from 'react';

export function PrioritizationView({ initiatives, portfolios, dependencies, reorderInitiatives }) {
  const [draggedIndex, setDraggedIndex] = useState(null);

  const sortedInitiatives = [...initiatives].sort((a, b) => 
    (a.priority || 999) - (b.priority || 999)
  );

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

    const reordered = newOrder.map((item, idx) => ({
      ...item,
      priority: idx + 1
    }));

    reorderInitiatives(reordered);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Initiative Prioritization</h2>
      <p className="text-gray-600 mb-4">Drag and drop to reorder initiatives by priority</p>

      <div className="bg-white rounded shadow border">
        <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 border-b font-semibold text-sm">
          <div className="col-span-1">#</div>
          <div className="col-span-1">Ref</div>
          <div className="col-span-2">Initiative</div>
          <div className="col-span-2">Team</div>
          <div className="col-span-2">Portfolio</div>
          <div className="col-span-1">Quarters</div>
          <div className="col-span-3">Dependency status</div>
        </div>

        {sortedInitiatives.map((initiative, idx) => {
          const portfolio = portfolios.find(p => p.id == initiative.portfolio);
          const deps = dependencies.filter(d => d.initiativeId === initiative.id);
          const committed = deps.filter(d => d.status === 'Committed').length;
          const pending = deps.filter(d => d.status === 'Pending').length;
          const discussion = deps.filter(d => d.status === 'Under Discussion').length;
          const blocked = deps.filter(d => d.status === "Can't Commit").length;
          const total = deps.length;

          return (
            <div
              key={initiative.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`grid grid-cols-12 gap-4 p-4 border-b hover:bg-gray-50 cursor-move ${
                draggedIndex === idx ? 'opacity-50' : ''
              }`}
            >
              <div className="col-span-1 flex items-center font-bold text-gray-600">
                {idx + 1}
              </div>
              <div className="col-span-1 flex items-center text-xs font-mono text-gray-500">
                {initiative.refCode || 'N/A'}
              </div>
              <div className="col-span-2 flex items-center">
                <div>
                  <div className="font-medium">{initiative.name || 'Unnamed'}</div>
                  {initiative.valueType === 'EUR' && initiative.valueAmount && (
                    <div className="text-xs text-gray-500">
                      €{parseFloat(initiative.valueAmount).toLocaleString()}
                    </div>
                  )}
                  {initiative.valueType !== 'EUR' && (
                    <div className="text-xs text-gray-500">{initiative.valueType}</div>
                  )}
                </div>
              </div>
              <div className="col-span-2 flex items-center text-sm">{initiative.team}</div>
              <div className="col-span-2 flex items-center text-sm">
                {portfolio?.name || <span className="text-gray-400">None</span>}
              </div>
              <div className="col-span-1 flex items-center text-sm">
                {initiative.quarters.join(', ') || <span className="text-gray-400">-</span>}
              </div>
              <div className="col-span-3 flex items-center">
                {total === 0 ? (
                  <span className="text-xs text-gray-400">No dependencies</span>
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
