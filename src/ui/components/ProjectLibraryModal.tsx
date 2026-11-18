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

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

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
      className="fixed inset-0 z-50 flex justify-end bg-black/60 animate-in fade-in select-none font-mono"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[90vw] h-full bg-[#15181E] border-l border-[#2A2E39] shadow-2xl flex flex-col overflow-hidden text-[#F3EEE3] animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-[#2A2E39] flex items-center justify-between shrink-0 bg-[#1B1E24]">
          <div>
            <h2 id="library-modal-title" className="text-sm font-bold text-[#F3EEE3] tracking-wide uppercase">
              Saved Designs
            </h2>
            <p className="text-[11px] text-[#8F96A3]">
              Browse and manage architecture workspaces
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded text-[#8F96A3] hover:text-[#F3EEE3] hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Shorter Segment Controls that NEVER wrap */}
        <div className="px-5 py-2.5 border-b border-[#2A2E39] flex items-center justify-start gap-2 bg-[#1B1E24] shrink-0">
          <button
            type="button"
            onClick={() => setTab('my-projects')}
            className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-all ${
              tab === 'my-projects'
                ? 'bg-[#F3EEE3] text-[#15181E]'
                : 'text-[#8F96A3] hover:text-[#F3EEE3] hover:bg-white/5'
            }`}
          >
            Mine ({projects.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('starter-templates')}
            className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-all ${
              tab === 'starter-templates'
                ? 'bg-[#F3EEE3] text-[#15181E]'
                : 'text-[#8F96A3] hover:text-[#F3EEE3] hover:bg-white/5'
            }`}
          >
            Templates ({templates.length})
          </button>
        </div>

        {errorMsg && (
          <div className="px-5 py-2 bg-red-950/60 border-b border-red-800 text-red-200 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Drawer Body / Project List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tab === 'my-projects' && (
            <>
              {projects.length === 0 ? (
                <div className="py-12 text-center text-[#8F96A3] text-sm">
                  <p>No saved projects yet.</p>
                  <p className="text-xs text-[#6B7280] mt-1">
                    Save your architecture below or load a starter template.
                  </p>
                </div>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded bg-[#1B1E24] border border-[#2A2E39] hover:border-[#8F96A3] transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex-1 min-w-0">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="bg-[#15181E] border border-[#2A2E39] px-2 py-1 text-xs rounded text-white flex-1 focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(p);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(p)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 rounded"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenProject(p)}
                          className="text-left w-full group/btn cursor-pointer"
                        >
                          <div className="text-xs font-semibold text-[#F3EEE3] group-hover/btn:text-[#D9541E] truncate transition-colors">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-[#8F96A3] mt-0.5">
                            {p.graph?.nodes?.length || 0} nodes · Updated{' '}
                            {new Date(p.updatedAt).toLocaleDateString()}
                          </div>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleOpenProject(p)}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-[#2A2E39] hover:bg-[#343A46] text-[#F3EEE3] rounded transition-colors cursor-pointer"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartRename(p)}
                        className="p-1 text-[11px] text-[#8F96A3] hover:text-white rounded hover:bg-white/5"
                        title="Rename"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(p)}
                        className="p-1 text-[11px] text-[#8F96A3] hover:text-white rounded hover:bg-white/5"
                        title="Duplicate"
                      >
                        📄
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportJson(p)}
                        className="p-1 text-[11px] text-[#8F96A3] hover:text-white rounded hover:bg-white/5"
                        title="Export JSON"
                      >
                        📥
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="p-1 text-[11px] text-red-400 hover:text-red-300 rounded hover:bg-white/5"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {tab === 'starter-templates' && (
            <div className="space-y-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="p-3.5 rounded bg-[#1B1E24] border border-[#2A2E39] flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-[#F3EEE3]">{t.name}</h3>
                      <p className="text-[10px] text-[#8F96A3] mt-0.5 font-mono">
                        {t.graph.nodes.length} nodes · {(t.traffic?.peakRps ?? 0).toLocaleString()} RPS · {t.traffic.pattern}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenProject(t)}
                      className="px-3 py-1 rounded bg-[#F3EEE3] text-[#15181E] text-[11px] font-semibold hover:bg-white transition-colors cursor-pointer"
                    >
                      Load
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Row: Import and Save in a clean bottom row per A4 */}
        <div className="p-4 border-t border-[#2A2E39] bg-[#1B1E24] flex items-center justify-between shrink-0">
          <label className="cursor-pointer px-3 py-1.5 rounded bg-[#2A2E39] hover:bg-[#343A46] border border-[#3A404E] text-xs font-medium text-[#F3EEE3] transition-all flex items-center gap-1.5">
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
            className="px-3.5 py-1.5 rounded bg-[#F3EEE3] text-[#15181E] text-xs font-semibold hover:bg-white transition-colors cursor-pointer"
          >
            + Save Current
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectLibraryModal;
