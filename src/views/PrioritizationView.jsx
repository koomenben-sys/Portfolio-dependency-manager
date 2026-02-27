import React, { useState } from 'react';
import { SortUnsorted, SortAsc, SortDesc } from '../components/common/Icons';

const ASC  = 'asc';
const DESC = 'desc';

function SortIcon({ column, sortCol, sortDir }) {
  if (sortCol !== column) return <span className="ml-1 text-gray-400"><SortUnsorted size={14} /></span>;
  if (sortDir === ASC)    return <span className="ml-1 text-blue-600"><SortAsc size={14} /></span>;
  return                         <span className="ml-1 text-blue-600"><SortDesc size={14} /></span>;
}

export function PrioritizationView({ initiatives, portfolios, dependencies, reorderInitiatives, role }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [sortCol, setSortCol] = useState('priority');
  const [sortDir, setSortDir] = useState(ASC);

  const isAdmin       = role === 'admin';
  const isDragEnabled = isAdmin && sortCol === 'priority' && sortDir === ASC;

  const handleHeaderClick = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === ASC ? DESC : ASC);
    } else {
      setSortCol(col);
      setSortDir(ASC);
    }
  };

  const getSortedInitiatives = () => {
    const base = [...initiatives];
    const dir  = sortDir === ASC ? 1 : -1;

    switch (sortCol) {
      case 'name':
        return base.sort((a, b) => dir * (a.name || '').localeCompare(b.name || ''));
      case 'team':
        return base.sort((a, b) => dir * (a.team || '').localeCompare(b.team || ''));
      case 'portfolio': {
        const name = id => portfolios.find(p => p.id == id)?.name || '';
        return base.sort((a, b) => dir * name(a.portfolio).localeCompare(name(b.portfolio)));
      }
      case 'value':
        return base.sort((a, b) => {
          const aVal = a.valueType === 'EUR' ? parseFloat(a.valueAmount) || 0 : (sortDir === ASC ? Infinity : -Infinity);
          const bVal = b.valueType === 'EUR' ? parseFloat(b.valueAmount) || 0 : (sortDir === ASC ? Infinity : -Infinity);
          return dir * (aVal - bVal);
        });
      case 'dependencies':
        return base.sort((a, b) => {
          const aC = dependencies.filter(d => d.initiativeId === a.id && d.status === 'Committed').length;
          const bC = dependencies.filter(d => d.initiativeId === b.id && d.status === 'Committed').length;
          return dir * (aC - bC);
        });
      default:
        return base.sort((a, b) => dir * ((a.priority || 999) - (b.priority || 999)));
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

  const th = (col, label, colSpan = 'col-span-2') => (
    <div
      className={`${colSpan} flex items-center cursor-pointer select-none hover:text-blue-600 ${
        sortCol === col ? 'text-blue-600' : ''
      }`}
      onClick={() => handleHeaderClick(col)}
    >
      {label}
      <SortIcon column={col} sortCol={sortCol} sortDir={sortDir} />
    </div>
  );

  return (
    <div>
      <div className="flex items-center mb-4">
        <h2 className="text-2xl font-bold">Initiative Prioritization</h2>
      </div>

      {isDragEnabled && (
        <p className="text-gray-600 text-sm mb-4">Drag and drop to reorder by priority. Click any column header to sort.</p>
      )}
      {!isAdmin && sortCol === 'priority' && sortDir === ASC && (
        <p className="text-amber-600 text-sm mb-4 bg-amber-50 border border-amber-200 rounded px-3 py-2 inline-block">
          Reordering requires admin access. Showing current priority order.
        </p>
      )}

      <div className="bg-white rounded shadow border">
        <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 border-b font-semibold text-sm">
          {th('priority', '#', 'col-span-1')}
          {th('name', 'Initiative')}
          {th('team', 'Team')}
          {th('portfolio', 'Portfolio')}
          <div className="col-span-1 text-gray-500 select-none">Quarters</div>
          {th('value', 'Value')}
          {th('dependencies', 'Dependencies')}
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
                {initiative.priority || idx + 1}
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
