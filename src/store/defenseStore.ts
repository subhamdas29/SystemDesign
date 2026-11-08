/**
 * Defense Store (Phase 8B).
 * Coordinates defense presets, perimeter components, node-level hardening policies,
 * recommended defenses per attack scenario, and delta comparison between runs.
 */

import { create } from 'zustand';
import {
  DefensePresetId,
  DEFENSE_PRESETS,
  HardeningOptions,
  CdnConfig,
  FirewallConfig,
  WafConfig,
  RateLimiterConfig,
  AutoscalingPolicy,
  CircuitBreakerPolicy,
  ConnectionLimitsConfig,
} from '../types/defenses';
import { RunSummaryData } from '../types/metrics';
import { AttackScenarioId } from '../types/attacks';
import { useGraphStore } from './graphStore';
import { addComponent, removeComponent, canAdd, canRemove, validateGraph } from '../builder';
import { ComponentType, GraphConfig, AppServerConfig, LoadBalancerConfig, DatabaseConfig } from '../types';

export interface DefenseState {
  activePresetId: DefensePresetId;
  activeTab: 'campaign' | 'defenses';
  previousRunSummary: RunSummaryData | null;

  setActiveTab: (tab: 'campaign' | 'defenses') => void;
  setPreviousRunSummary: (summary: RunSummaryData | null) => void;
  applyPreset: (presetId: DefensePresetId) => void;
  applyRecommendedDefense: (scenarioId: AttackScenarioId) => void;

  // Granular configuration helpers
  updateFirewallConfig: (updates: Partial<FirewallConfig>) => void;
  updateWafConfig: (updates: Partial<WafConfig>) => void;
  updateRateLimiterConfig: (updates: Partial<RateLimiterConfig>) => void;
  updateCdnConfig: (updates: Partial<CdnConfig>) => void;
  updateAutoscalingPolicy: (updates: Partial<AutoscalingPolicy>) => void;
  updateCircuitBreakerPolicy: (updates: Partial<CircuitBreakerPolicy>) => void;
  updateConnectionLimitsConfig: (updates: Partial<ConnectionLimitsConfig>) => void;
  updateHardeningOptions: (updates: Partial<HardeningOptions>) => void;
}

export const useDefenseStore = create<DefenseState>((set) => ({
  activePresetId: 'none',
  activeTab: 'campaign',
  previousRunSummary: null,

  setActiveTab: (tab: 'campaign' | 'defenses') => set({ activeTab: tab }),

  setPreviousRunSummary: (summary: RunSummaryData | null) => set({ previousRunSummary: summary }),

  applyPreset: (presetId: DefensePresetId) => {
    useGraphStore.getState().flushPendingHistory();
    const { graph, history } = useGraphStore.getState();

    let nextGraph: GraphConfig = {
      version: graph.version + 1,
      nodes: graph.nodes.map((n) => ({
        ...n,
        config: JSON.parse(JSON.stringify(n.config)),
      })),
      edges: [...graph.edges],
    };

    if (presetId === 'none') {
      // Remove defense perimeter nodes if removable
      const defenseTypes: ComponentType[] = ['cdn', 'firewall', 'waf', 'rate-limiter'];
      for (const dType of defenseTypes) {
        const found = nextGraph.nodes.find((n) => n.type === dType);
        if (found && canRemove(nextGraph, found.id).allowed) {
          nextGraph = removeComponent(nextGraph, found.id);
        }
      }

      // Turn off node-level defense policies
      for (const node of nextGraph.nodes) {
        if (node.type === 'app-server') {
          const cfg = node.config as AppServerConfig;
          if (cfg.autoscaling) cfg.autoscaling.enabled = false;
          if (cfg.circuitBreaker) cfg.circuitBreaker.enabled = false;
          if (cfg.connectionLimits) cfg.connectionLimits.enabled = false;
          if (cfg.hardening) {
            cfg.hardening.parameterizedQueries = false;
            cfg.hardening.patchedSystem = false;
            cfg.hardening.leastPrivilegeDb = false;
            cfg.hardening.networkSegmentation = false;
            cfg.hardening.autoQuarantine = false;
            cfg.hardening.egressFiltering = false;
          }
        } else if (node.type === 'load-balancer') {
          const cfg = node.config as LoadBalancerConfig;
          if (cfg.circuitBreaker) cfg.circuitBreaker.enabled = false;
          if (cfg.connectionLimits) cfg.connectionLimits.enabled = false;
        } else if (node.type === 'database') {
          const cfg = node.config as DatabaseConfig;
          if (cfg.hardening) {
            cfg.hardening.parameterizedQueries = false;
            cfg.hardening.patchedSystem = false;
            cfg.hardening.leastPrivilegeDb = false;
            cfg.hardening.networkSegmentation = false;
            cfg.hardening.autoQuarantine = false;
            cfg.hardening.egressFiltering = false;
          }
        }
      }
    } else {
      const presetDef = DEFENSE_PRESETS.find((p) => p.id === presetId);
      if (!presetDef) return;

      // 1. Ensure required components are present
      for (const compType of presetDef.componentsToEnsure) {
        if (!nextGraph.nodes.some((n) => n.type === compType)) {
          if (canAdd(nextGraph, compType).allowed) {
            nextGraph = addComponent(nextGraph, compType);
          }
        }
        // Enable component
        const compNode = nextGraph.nodes.find((n) => n.type === compType);
        if (compNode && 'enabled' in compNode.config) {
          (compNode.config as { enabled: boolean }).enabled = true;
        }
      }

      // 2. Apply node-level defense policies
      for (const node of nextGraph.nodes) {
        if (node.type === 'app-server') {
          const cfg = node.config as AppServerConfig;
          if (presetDef.nodeDefenses.autoscaling !== undefined) {
            cfg.autoscaling = { ...(cfg.autoscaling ?? {}), enabled: presetDef.nodeDefenses.autoscaling } as AutoscalingPolicy;
          }
          if (presetDef.nodeDefenses.circuitBreaker !== undefined) {
            cfg.circuitBreaker = { ...(cfg.circuitBreaker ?? {}), enabled: presetDef.nodeDefenses.circuitBreaker } as CircuitBreakerPolicy;
          }
          if (presetDef.nodeDefenses.connectionLimits !== undefined) {
            cfg.connectionLimits = { ...(cfg.connectionLimits ?? {}), enabled: presetDef.nodeDefenses.connectionLimits } as ConnectionLimitsConfig;
          }
          if (presetDef.nodeDefenses.hardening) {
            cfg.hardening = { ...(cfg.hardening ?? {}), ...presetDef.nodeDefenses.hardening } as HardeningOptions;
          }
        } else if (node.type === 'load-balancer') {
          const cfg = node.config as LoadBalancerConfig;
          if (presetDef.nodeDefenses.circuitBreaker !== undefined) {
            cfg.circuitBreaker = { ...(cfg.circuitBreaker ?? {}), enabled: presetDef.nodeDefenses.circuitBreaker } as CircuitBreakerPolicy;
          }
          if (presetDef.nodeDefenses.connectionLimits !== undefined) {
            cfg.connectionLimits = { ...(cfg.connectionLimits ?? {}), enabled: presetDef.nodeDefenses.connectionLimits } as ConnectionLimitsConfig;
          }
        } else if (node.type === 'database') {
          const cfg = node.config as DatabaseConfig;
          if (presetDef.nodeDefenses.hardening) {
            cfg.hardening = { ...(cfg.hardening ?? {}), ...presetDef.nodeDefenses.hardening } as HardeningOptions;
          }
        }
      }
    }

    useGraphStore.setState({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });

    set({ activePresetId: presetId });
  },

  applyRecommendedDefense: (scenarioId: AttackScenarioId) => {
    useGraphStore.getState().flushPendingHistory();
    const { graph, history } = useGraphStore.getState();

    let nextGraph: GraphConfig = {
      version: graph.version + 1,
      nodes: graph.nodes.map((n) => ({
        ...n,
        config: JSON.parse(JSON.stringify(n.config)),
      })),
      edges: [...graph.edges],
    };

    const ensureComp = (type: ComponentType) => {
      if (!nextGraph.nodes.some((n) => n.type === type) && canAdd(nextGraph, type).allowed) {
        nextGraph = addComponent(nextGraph, type);
      }
      const node = nextGraph.nodes.find((n) => n.type === type);
      if (node && 'enabled' in node.config) {
        (node.config as { enabled: boolean }).enabled = true;
      }
      return node;
    };

    switch (scenarioId) {
      case 'volumetric-flood': {
        const cdn = ensureComp('cdn');
        if (cdn) {
          (cdn.config as CdnConfig).ddosProtection = 'advanced';
        }
        ensureComp('firewall');
        break;
      }
      case 'http-flood': {
        const waf = ensureComp('waf');
        if (waf) {
          const cfg = waf.config as WafConfig;
          cfg.rulesets = { genericWebAttacks: true, botProtection: true, rateBasedRules: true };
          cfg.sensitivity = 65;
        }
        const rl = ensureComp('rate-limiter');
        if (rl) {
          (rl.config as RateLimiterConfig).scope = 'per-source';
          (rl.config as RateLimiterConfig).limitRps = 100;
        }
        break;
      }
      case 'slow-connection': {
        for (const n of nextGraph.nodes) {
          if (n.type === 'load-balancer' || n.type === 'app-server') {
            const cfg = n.config as LoadBalancerConfig | AppServerConfig;
            cfg.connectionLimits = {
              enabled: true,
              maxConnections: 300,
              perSourceMaxConnections: 10,
              headerTimeoutMs: 1500,
              idleTimeoutMs: 5000,
            };
          }
        }
        break;
      }
      case 'cache-busting-scraper': {
        const waf = ensureComp('waf');
        if (waf) {
          (waf.config as WafConfig).rulesets.botProtection = true;
        }
        const rl = ensureComp('rate-limiter');
        if (rl) {
          (rl.config as RateLimiterConfig).limitRps = 50;
        }
        break;
      }
      case 'credential-brute-force': {
        const rl = ensureComp('rate-limiter');
        if (rl) {
          const cfg = rl.config as RateLimiterConfig;
          cfg.scope = 'per-source';
          cfg.limitRps = 20;
        }
        ensureComp('firewall');
        break;
      }
      case 'credential-stuffing-distributed': {
        const waf = ensureComp('waf');
        if (waf) {
          const cfg = waf.config as WafConfig;
          cfg.rulesets.botProtection = true;
          cfg.sensitivity = 80;
        }
        break;
      }
      case 'injection-attempts': {
        const waf = ensureComp('waf');
        if (waf) {
          (waf.config as WafConfig).rulesets.genericWebAttacks = true;
        }
        for (const n of nextGraph.nodes) {
          if (n.type === 'database' || n.type === 'app-server') {
            const cfg = n.config as DatabaseConfig | AppServerConfig;
            cfg.hardening = {
              ...(cfg.hardening ?? {}),
              parameterizedQueries: true,
              leastPrivilegeDb: true,
              patchedSystem: true,
              networkSegmentation: false,
              autoQuarantine: false,
              quarantineDetectionLagMs: 3000,
              reimageDurationMs: 5000,
              egressFiltering: false,
            };
          }
        }
        break;
      }
      case 'compromised-server': {
        for (const n of nextGraph.nodes) {
          if (n.type === 'app-server') {
            const cfg = n.config as AppServerConfig;
            cfg.hardening = {
              ...(cfg.hardening ?? {}),
              autoQuarantine: true,
              networkSegmentation: true,
              egressFiltering: true,
              patchedSystem: true,
              parameterizedQueries: false,
              leastPrivilegeDb: false,
              quarantineDetectionLagMs: 3000,
              reimageDurationMs: 5000,
            };
          }
        }
        break;
      }
    }

    useGraphStore.setState({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });
  },

  updateFirewallConfig: (updates: Partial<FirewallConfig>) => {
    const { graph, updateNodeConfig } = useGraphStore.getState();
    const fwNode = graph.nodes.find((n) => n.type === 'firewall');
    if (fwNode) {
      updateNodeConfig(fwNode.id, updates, true);
    }
  },

  updateWafConfig: (updates: Partial<WafConfig>) => {
    const { graph, updateNodeConfig } = useGraphStore.getState();
    const wafNode = graph.nodes.find((n) => n.type === 'waf');
    if (wafNode) {
      updateNodeConfig(wafNode.id, updates, true);
    }
  },

  updateRateLimiterConfig: (updates: Partial<RateLimiterConfig>) => {
    const { graph, updateNodeConfig } = useGraphStore.getState();
    const rlNode = graph.nodes.find((n) => n.type === 'rate-limiter');
    if (rlNode) {
      updateNodeConfig(rlNode.id, updates, true);
    }
  },

  updateCdnConfig: (updates: Partial<CdnConfig>) => {
    const { graph, updateNodeConfig } = useGraphStore.getState();
    const cdnNode = graph.nodes.find((n) => n.type === 'cdn');
    if (cdnNode) {
      updateNodeConfig(cdnNode.id, updates, true);
    }
  },

  updateAutoscalingPolicy: (updates: Partial<AutoscalingPolicy>) => {
    const { graph, updateNodeConfig } = useGraphStore.getState();
    for (const node of graph.nodes) {
      if (node.type === 'app-server') {
        const cur = (node.config as AppServerConfig).autoscaling ?? {};
        updateNodeConfig(node.id, { autoscaling: { ...cur, ...updates } as AutoscalingPolicy }, true);
      }
    }
  },

  updateCircuitBreakerPolicy: (updates: Partial<CircuitBreakerPolicy>) => {
    const { graph, updateNodeConfig } = useGraphStore.getState();
    for (const node of graph.nodes) {
      if (node.type === 'app-server' || node.type === 'load-balancer') {
        const cur = (node.config as AppServerConfig | LoadBalancerConfig).circuitBreaker ?? {};
        updateNodeConfig(node.id, { circuitBreaker: { ...cur, ...updates } as CircuitBreakerPolicy }, true);
      }
    }
  },

  updateConnectionLimitsConfig: (updates: Partial<ConnectionLimitsConfig>) => {
    const { graph, updateNodeConfig } = useGraphStore.getState();
    for (const node of graph.nodes) {
      if (node.type === 'app-server' || node.type === 'load-balancer') {
        const cur = (node.config as AppServerConfig | LoadBalancerConfig).connectionLimits ?? {};
        updateNodeConfig(node.id, { connectionLimits: { ...cur, ...updates } as ConnectionLimitsConfig }, true);
      }
    }
  },

  updateHardeningOptions: (updates: Partial<HardeningOptions>) => {
    const { graph, updateNodeConfig } = useGraphStore.getState();
    for (const node of graph.nodes) {
      if (node.type === 'app-server' || node.type === 'database') {
        const cur = (node.config as AppServerConfig | DatabaseConfig).hardening ?? {};
        updateNodeConfig(node.id, { hardening: { ...cur, ...updates } as HardeningOptions }, true);
      }
    }
  },
}));
