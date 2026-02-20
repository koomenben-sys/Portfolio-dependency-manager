import React, { useState } from 'react';
import { exportData, importData } from '../../utils/dataExport';

export function SettingsModal({
  isOpen,
  onClose,
  portfolios,
  initiatives,
  dependencies,
  setPortfolios,
  setInitiatives,
  setDependencies,
  teams,
  addTeam,
  updateTeam,
  deleteTeam
}) {
  const [showExport, setShowExport] = useState(false);
  const [exportText, setExportText] = useState('');

  if (!isOpen) return null;

  const handleExport = () => {
    const data = exportData(portfolios, initiatives, dependencies);
    setExportText(data);
    setShowExport(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(exportText);
    alert('Copied to clipboard!');
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = importData(event.target.result);
      if (result.success) {
        setPortfolios(result.data.portfolios);
        setInitiatives(result.data.initiatives);
        setDependencies(result.data.dependencies);
        alert('Import successful!');
        onClose();
      } else {
        alert('Import failed: ' + result.error);
      }
    };
    reader.readAsText(file);
  };

  if (showExport) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
          <h3 className="text-lg font-bold mb-4">Export Data</h3>
          <p className="text-sm mb-2">Copy and save as .json file:</p>
          <textarea
            value={exportText}
            readOnly
            className="w-full h-64 border rounded p-2 font-mono text-xs mb-4"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Copy
            </button>
            <button
              onClick={() => {
                setShowExport(false);
                onClose();
              }}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-96">
        <div className="p-4 border-b">
          <h3 className="text-lg font-bold">Settings</h3>
        </div>

        {/* Teams */}
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-sm">Teams</h4>
            <button
              onClick={addTeam}
              className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {teams.map((team, index) => (
              <div key={index} className="flex gap-2 items-center">
                <input
                  value={team}
                  onChange={(e) => updateTeam(index, e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm"
                  placeholder="Team name"
                />
                <button
                  onClick={() => deleteTeam(index)}
                  className="text-red-500 hover:text-red-700 text-sm px-1"
                >
                  ✕
                </button>
              </div>
            ))}
            {teams.length === 0 && (
              <p className="text-gray-400 text-sm">No teams yet.</p>
            )}
          </div>
        </div>

        {/* Data */}
        <div className="p-2">
          <button
            onClick={handleExport}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
          >
            Export Data
          </button>
          <label className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer block">
            Import Data
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
