/**
 * Attacker Mode & Attack Campaign Store (Phase 8A).
 * Manages Attacker Mode state, active campaigns, timeline phases, and scenario modals.
 */

import { create } from 'zustand';
import {
  AttackCampaign,
  CampaignPhase,
  AttackScenarioDefinition,
} from '../types/attacks';
import {
  CAMPAIGN_PRESETS,
  createDefaultCampaign,
} from '../scenarios/attacks';

export interface AttackState {
  isAttackerMode: boolean;
  activeCampaign: AttackCampaign;
  activePresetId: string | null;
  selectedScenarioForDetails: AttackScenarioDefinition | null;
  isDetailsModalOpen: boolean;

  setAttackerMode: (enabled: boolean) => void;
  loadPreset: (presetId: string) => void;
  setCampaign: (campaign: AttackCampaign) => void;
  addCampaignPhase: (phase: CampaignPhase) => void;
  updateCampaignPhase: (phaseId: string, updates: Partial<CampaignPhase>) => void;
  removeCampaignPhase: (phaseId: string) => void;
  openScenarioDetails: (scenario: AttackScenarioDefinition) => void;
  closeScenarioDetails: () => void;
  resetToDefaultCampaign: () => void;
}

export const useAttackStore = create<AttackState>((set) => ({
  isAttackerMode: false,
  activeCampaign: createDefaultCampaign(),
  activePresetId: 'recon-then-flood',
  selectedScenarioForDetails: null,
  isDetailsModalOpen: false,

  setAttackerMode: (enabled: boolean) =>
    set({ isAttackerMode: enabled }),

  loadPreset: (presetId: string) => {
    const preset = CAMPAIGN_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      set({
        activeCampaign: {
          id: preset.id,
          name: preset.name,
          description: preset.description,
          phases: preset.phases.map((ph) => ({ ...ph })),
        },
        activePresetId: presetId,
      });
    }
  },

  setCampaign: (campaign: AttackCampaign) =>
    set({ activeCampaign: campaign, activePresetId: null }),

  addCampaignPhase: (phase: CampaignPhase) =>
    set((state) => ({
      activeCampaign: {
        ...state.activeCampaign,
        phases: [...state.activeCampaign.phases, phase].sort(
          (a, b) => a.startMs - b.startMs
        ),
      },
      activePresetId: null,
    })),

  updateCampaignPhase: (phaseId: string, updates: Partial<CampaignPhase>) =>
    set((state) => ({
      activeCampaign: {
        ...state.activeCampaign,
        phases: state.activeCampaign.phases
          .map((ph) => (ph.id === phaseId ? { ...ph, ...updates } : ph))
          .sort((a, b) => a.startMs - b.startMs),
      },
      activePresetId: null,
    })),

  removeCampaignPhase: (phaseId: string) =>
    set((state) => ({
      activeCampaign: {
        ...state.activeCampaign,
        phases: state.activeCampaign.phases.filter((ph) => ph.id !== phaseId),
      },
      activePresetId: null,
    })),

  openScenarioDetails: (scenario: AttackScenarioDefinition) =>
    set({ selectedScenarioForDetails: scenario, isDetailsModalOpen: true }),

  closeScenarioDetails: () =>
    set({ selectedScenarioForDetails: null, isDetailsModalOpen: false }),

  resetToDefaultCampaign: () =>
    set({
      activeCampaign: createDefaultCampaign(),
      activePresetId: 'recon-then-flood',
    }),
}));
