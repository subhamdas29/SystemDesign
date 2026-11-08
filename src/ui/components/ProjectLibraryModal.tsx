import React, { useState, useEffect } from 'react';
import { ProjectData } from '../../storage/schema';
import { storage } from '../../storage/db';
import {
  getStarterTemplates,
  exportProjectAsJson,
  importProjectFromJson,
  duplicateProject,
} from '../../storage/library';
import { useGraphStore, useSimulationStore } from '@store';

interface ProjectLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectLibraryModal: React.FC<ProjectLibraryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [tab, setTab] = useState<'my-projects' | 'starter-templates'>('my-projects');
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const graph = useGraphStore((s) => s.graph);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const trafficConfig = useSimulationStore((s) => s.trafficConfig);
  const setTrafficConfig = useSimulationStore((s) => s.setTrafficConfig);
  const setSeed = useSimulationStore((s) => s.setSeed);
  const resetSim = useSimulationStore((s) => s.reset);

  const loadProjectList = async () => {
    const list = await storage.listProjects();
    setProjects(list.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  useEffect(() => {
    if (isOpen) {
      loadProjectList();
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenProject = (project: ProjectData) => {
    loadGraph(project.graph);
    setTrafficConfig(project.traffic, project.graph);
    setSeed(project.seed);
    useSimulationStore.setState({
      scenarioScript: project.scenarioScript || [],
    });
    resetSim(project.graph);
    onClose();
  };

  const handleSaveCurrent = async () => {
    const name = window.prompt('Enter project name:', 'My Architecture') || 'Untitled Project';
    const now = Date.now();
    const newProj: ProjectData = {
      id: `proj-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      version: 2,
      graph,
      traffic: trafficConfig,
      scenarioScript: useSimulationStore.getState().scenarioScript,
      seed: useSimulationStore.getState().seed,
      createdAt: now,
      updatedAt: now,
    };
    await storage.saveProject(newProj);
    await loadProjectList();
  };

  const handleDuplicate = async (project: ProjectData) => {
    await duplicateProject(project);
    await loadProjectList();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this project?')) {
      await storage.deleteProject(id);
      await loadProjectList();
    }
  };

  const handleStartRename = (project: ProjectData) => {
    setEditingId(project.id);
    setEditingName(project.name);
  };

  const handleSaveRename = async (project: ProjectData) => {
    if (editingName.trim()) {
      const updated = { ...project, name: editingName.trim(), updatedAt: Date.now() };
      await storage.saveProject(updated);
      setEditingId(null);
      await loadProjectList();
    }
  };

  const handleExportJson = (project: ProjectData) => {
    const jsonStr = exportProjectAsJson(project);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const imported = importProjectFromJson(text);
        imported.id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        imported.updatedAt = Date.now();
        await storage.saveProject(imported);
        await loadProjectList();
        setErrorMsg(null);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to import JSON project.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const templates = getStarterTemplates();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4"
    >
      <div className="w-full max-w-2xl max-h-[85vh] bg-[#141416] border border-[#27272a] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white font-sans">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📁</span>
            <div>
              <h2 id="library-modal-title" className="text-base font-semibold">
                Project Library
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Save, load, and manage local architecture workspaces
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Bar & Action Controls */}
        <div className="px-6 py-3 border-b border-[#222226] flex items-center justify-between bg-[#101012]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('my-projects')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === 'my-projects'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              My Projects ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('starter-templates')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === 'starter-templates'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              Starter Templates ({templates.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="cursor-pointer px-2.5 py-1.5 rounded-lg bg-[#222226] hover:bg-[#2b2b30] border border-[#3f3f46] text-xs font-medium text-white transition-all">
              <span>Import JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={handleSaveCurrent}
              className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors shadow-sm"
            >
              + Save Current
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="px-6 py-2 bg-red-950/60 border-b border-red-800 text-red-200 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Modal Body / Project List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {tab === 'my-projects' && (
            <>
              {projects.length === 0 ? (
                <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">
                  <p>No saved projects yet.</p>
                  <p className="text-xs text-[var(--color-text-faint)] mt-1">
                    Click &ldquo;+ Save Current&rdquo; above to save your architecture to local browser storage.
                  </p>
                </div>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-between gap-4 transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(p)}
                            className="px-2 py-1 bg-black border border-white/40 rounded text-xs text-white"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(p)}
                            className="px-2 py-1 bg-white text-black text-xs rounded font-semibold"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white truncate">{p.name}</h3>
                          <button
                            type="button"
                            onClick={() => handleStartRename(p)}
                            className="text-[11px] text-[var(--color-text-faint)] hover:text-white"
                            title="Rename"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
                        {p.graph.nodes.length} nodes · {(p.traffic?.peakRps ?? 0).toLocaleString()} RPS · Updated{' '}
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenProject(p)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white text-white hover:text-black text-xs font-semibold transition-all"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(p)}
                        className="p-1.5 text-xs text-[var(--color-text-muted)] hover:text-white rounded hover:bg-white/5"
                        title="Duplicate"
                      >
                        📄
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportJson(p)}
                        className="p-1.5 text-xs text-[var(--color-text-muted)] hover:text-white rounded hover:bg-white/5"
                        title="Export JSON"
                      >
                        📥
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-xs text-red-400 hover:text-red-300 rounded hover:bg-white/5"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {tab === 'starter-templates' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-xl bg-[#18181b] border border-[#27272a] flex flex-col justify-between gap-3"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
                      {t.graph.nodes.length} nodes · {(t.traffic?.peakRps ?? 0).toLocaleString()} RPS · Pattern:{' '}
                      {t.traffic.pattern}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenProject(t)}
                    className="w-full py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors"
                  >
                    Load Template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
