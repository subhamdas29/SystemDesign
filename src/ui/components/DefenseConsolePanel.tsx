import React from 'react';
import { useDefenseStore } from '../../store/defenseStore';
import { useGraphStore } from '../../store/graphStore';
import { useAttackStore } from '../../store/attackStore';
import { DEFENSE_PRESETS, DefensePresetId, WafRulesets, CircuitBreakerPolicy } from '../../types/defenses';
import { ATTACK_SCENARIOS } from '../../scenarios/attacks';
import { CdnConfig, FirewallConfig, WafConfig, RateLimiterConfig, AppServerConfig, LoadBalancerConfig, DatabaseConfig } from '../../types';

export const DefenseConsolePanel: React.FC = () => {
  const activePresetId = useDefenseStore((s) => s.activePresetId);
  const applyPreset = useDefenseStore((s) => s.applyPreset);
  const applyRecommendedDefense = useDefenseStore((s) => s.applyRecommendedDefense);

  const updateFirewall = useDefenseStore((s) => s.updateFirewallConfig);
  const updateWaf = useDefenseStore((s) => s.updateWafConfig);
  const updateRateLimiter = useDefenseStore((s) => s.updateRateLimiterConfig);
  const updateCdn = useDefenseStore((s) => s.updateCdnConfig);
  const updateAutoscaling = useDefenseStore((s) => s.updateAutoscalingPolicy);
  const updateCircuitBreaker = useDefenseStore((s) => s.updateCircuitBreakerPolicy);
  const updateConnectionLimits = useDefenseStore((s) => s.updateConnectionLimitsConfig);
  const updateHardening = useDefenseStore((s) => s.updateHardeningOptions);

  const graph = useGraphStore((s) => s.graph);
  const addNode = useGraphStore((s) => s.addNode);

  const activeCampaign = useAttackStore((s) => s.activeCampaign);
  const activeScenarioId = activeCampaign.phases[0]?.scenarioId ?? 'volumetric-flood';
  const activeScenario = ATTACK_SCENARIOS[activeScenarioId];

  // Component instances in graph
  const cdnNode = graph.nodes.find((n) => n.type === 'cdn');
  const fwNode = graph.nodes.find((n) => n.type === 'firewall');
  const wafNode = graph.nodes.find((n) => n.type === 'waf');
  const rlNode = graph.nodes.find((n) => n.type === 'rate-limiter');
  const appServerNode = graph.nodes.find((n) => n.type === 'app-server');
  const lbNode = graph.nodes.find((n) => n.type === 'load-balancer');
  const dbNode = graph.nodes.find((n) => n.type === 'database');

  const cdnCfg = cdnNode?.config as CdnConfig | undefined;
  const fwCfg = fwNode?.config as FirewallConfig | undefined;
  const wafCfg = wafNode?.config as WafConfig | undefined;
  const rlCfg = rlNode?.config as RateLimiterConfig | undefined;
  const appCfg = appServerNode?.config as AppServerConfig | undefined;
  const lbCfg = lbNode?.config as LoadBalancerConfig | undefined;
  const dbCfg = dbNode?.config as DatabaseConfig | undefined;

  const asPolicy = appCfg?.autoscaling;
  const cbPolicy = appCfg?.circuitBreaker || lbCfg?.circuitBreaker;
  const connLimits = lbCfg?.connectionLimits || appCfg?.connectionLimits;
  const hardening = appCfg?.hardening || dbCfg?.hardening;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs select-none">
      {/* 1. Defense Presets Bar */}
      <div>
        <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-2">
          Defense Architecture Presets
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {DEFENSE_PRESETS.map((p) => {
            const isSelected = activePresetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id as DefensePresetId)}
                title={p.description}
                className={`p-2 rounded-lg text-left transition-all border ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    : 'bg-[#18181c] border-[#27272a] hover:border-[#3f3f46] text-zinc-300'
                }`}
              >
                <div className="font-bold text-[11px] truncate flex items-center justify-between">
                  <span>{p.name.split(' (')[0]}</span>
                  {isSelected && <span className="text-cyan-400 text-[10px]">●</span>}
                </div>
                <div className="text-[9px] text-[var(--color-text-muted)] truncate mt-0.5">
                  {p.id === 'none' ? 'Zero perimeter' : p.id === 'basic' ? 'FW + Rate Limiter' : p.id === 'standard' ? 'Adds WAF + CDN' : 'Zero-Trust Hardened'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Recommended Defense Banner */}
      {activeScenario && (
        <div className="p-3 rounded-xl bg-gradient-to-r from-cyan-950/30 to-[#141417] border border-cyan-500/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
              <span>🛡️</span> Recommended Defense
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
              For {activeScenario.name.slice(0, 16)}
            </span>
          </div>
          <p className="text-[11px] text-zinc-200 leading-relaxed">
            {activeScenario.recommendedDefense}
          </p>
          <button
            type="button"
            onClick={() => applyRecommendedDefense(activeScenarioId)}
            className="w-full py-1.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-colors shadow-sm"
          >
            Apply Recommended Defense
          </button>
        </div>
      )}

      {/* 3. Perimeter Defense Components */}
      <div className="space-y-3">
        <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block">
          Perimeter Components
        </span>

        {/* CDN Card */}
        <div className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🌐</span>
              <span className="font-bold text-white text-xs">Edge CDN & DDoS Scrubbing</span>
            </div>
            {cdnNode ? (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {cdnCfg?.enabled !== false ? 'ACTIVE' : 'OFF'}
                </span>
                <input
                  type="checkbox"
                  checked={cdnCfg?.enabled !== false}
                  onChange={(e) => updateCdn({ enabled: e.target.checked })}
                  className="accent-cyan-400"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => addNode('cdn')}
                className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40"
              >
                + Add CDN
              </button>
            )}
          </div>
          {cdnCfg && cdnCfg.enabled !== false && (
            <div className="pt-2 border-t border-[#27272a] space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-text-muted)]">DDoS Anycast Mode</span>
                <select
                  value={cdnCfg.ddosProtection ?? 'standard'}
                  onChange={(e) => updateCdn({ ddosProtection: e.target.value as CdnConfig['ddosProtection'] })}
                  className="bg-[#111113] border border-[#3f3f46] rounded px-2 py-0.5 text-white"
                >
                  <option value="none">None (0 RPS)</option>
                  <option value="standard">Standard (20k RPS)</option>
                  <option value="advanced">Advanced (200k RPS)</option>
                </select>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-text-muted)]">Edge Cache Hit Ratio</span>
                <span className="text-white font-bold">{cdnCfg.edgeHitRatio ?? 85}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Firewall Card */}
        <div className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🧱</span>
              <span className="font-bold text-white text-xs">Network Firewall</span>
            </div>
            {fwNode ? (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {fwCfg?.enabled !== false ? 'ACTIVE' : 'OFF'}
                </span>
                <input
                  type="checkbox"
                  checked={fwCfg?.enabled !== false}
                  onChange={(e) => updateFirewall({ enabled: e.target.checked })}
                  className="accent-cyan-400"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => addNode('firewall')}
                className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40"
              >
                + Add Firewall
              </button>
            )}
          </div>
          {fwCfg && fwCfg.enabled !== false && (
            <div className="pt-2 border-t border-[#27272a] space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-text-muted)]">Detection Lag</span>
                <span className="text-white font-bold">{fwCfg.detectionLagMs ?? 1500}ms</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-text-muted)]">Learning Rate</span>
                <span className="text-white font-bold">{fwCfg.learnRatePerSec ?? 200} IPs/s</span>
              </div>
            </div>
          )}
        </div>

        {/* WAF Card */}
        <div className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🛡️</span>
              <span className="font-bold text-white text-xs">Web App Firewall (WAF)</span>
            </div>
            {wafNode ? (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {wafCfg?.enabled !== false ? 'ACTIVE' : 'OFF'}
                </span>
                <input
                  type="checkbox"
                  checked={wafCfg?.enabled !== false}
                  onChange={(e) => updateWaf({ enabled: e.target.checked })}
                  className="accent-cyan-400"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => addNode('waf')}
                className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40"
              >
                + Add WAF
              </button>
            )}
          </div>
          {wafCfg && wafCfg.enabled !== false && (
            <div className="pt-2 border-t border-[#27272a] space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-text-muted)]">Sensitivity ({wafCfg.sensitivity ?? 50})</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={wafCfg.sensitivity ?? 50}
                  onChange={(e) => updateWaf({ sensitivity: Number(e.target.value) })}
                  className="w-24 accent-cyan-400"
                />
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1 text-[9px]">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wafCfg.rulesets?.genericWebAttacks ?? true}
                    onChange={(e) => {
                      const cur = wafCfg.rulesets ?? { genericWebAttacks: true, botProtection: true, rateBasedRules: true };
                      updateWaf({ rulesets: { ...cur, genericWebAttacks: e.target.checked } satisfies WafRulesets });
                    }}
                    className="accent-cyan-400"
                  />
                  <span>Web</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wafCfg.rulesets?.botProtection ?? true}
                    onChange={(e) => {
                      const cur = wafCfg.rulesets ?? { genericWebAttacks: true, botProtection: true, rateBasedRules: true };
                      updateWaf({ rulesets: { ...cur, botProtection: e.target.checked } satisfies WafRulesets });
                    }}
                    className="accent-cyan-400"
                  />
                  <span>Bots</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wafCfg.rulesets?.rateBasedRules ?? true}
                    onChange={(e) => {
                      const cur = wafCfg.rulesets ?? { genericWebAttacks: true, botProtection: true, rateBasedRules: true };
                      updateWaf({ rulesets: { ...cur, rateBasedRules: e.target.checked } satisfies WafRulesets });
                    }}
                    className="accent-cyan-400"
                  />
                  <span>Rate</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Rate Limiter Card */}
        <div className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">⏱️</span>
              <span className="font-bold text-white text-xs">Edge Rate Limiter</span>
            </div>
            {rlNode ? (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {rlCfg?.enabled !== false ? 'ACTIVE' : 'OFF'}
                </span>
                <input
                  type="checkbox"
                  checked={rlCfg?.enabled !== false}
                  onChange={(e) => updateRateLimiter({ enabled: e.target.checked })}
                  className="accent-cyan-400"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => addNode('rate-limiter')}
                className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40"
              >
                + Add Rate Limiter
              </button>
            )}
          </div>
          {rlCfg && rlCfg.enabled !== false && (
            <div className="pt-2 border-t border-[#27272a] space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-text-muted)]">Limit RPS</span>
                <span className="text-white font-bold">{rlCfg.limitRps ?? 100}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-text-muted)]">Scope</span>
                <select
                  value={rlCfg.scope ?? 'per-source'}
                  onChange={(e) => updateRateLimiter({ scope: e.target.value as RateLimiterConfig['scope'] })}
                  className="bg-[#111113] border border-[#3f3f46] rounded px-2 py-0.5 text-white"
                >
                  <option value="per-source">Per-Source IP</option>
                  <option value="global">Global Cap</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Host & Node Defense Policies */}
      <div className="space-y-3">
        <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block">
          Host & Policy Hardening
        </span>

        {/* Autoscaling Policy */}
        <div className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-xs">App Server Autoscaling</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-[9px] text-[var(--color-text-muted)]">
                {asPolicy?.enabled ? 'ON' : 'OFF'}
              </span>
              <input
                type="checkbox"
                checked={asPolicy?.enabled ?? false}
                onChange={(e) => updateAutoscaling({ enabled: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
          </div>
          {asPolicy?.enabled && (
            <div className="pt-2 border-t border-[#27272a] grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-[var(--color-text-muted)] block">Max Instances</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={asPolicy.maxInstances ?? 5}
                  onChange={(e) => updateAutoscaling({ maxInstances: Number(e.target.value) })}
                  className="w-full bg-[#111113] border border-[#3f3f46] rounded px-1.5 py-0.5 text-white"
                />
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block">Scale-Out CPU %</span>
                <input
                  type="number"
                  min={40}
                  max={95}
                  value={asPolicy.scaleOutUtilizationPct ?? 75}
                  onChange={(e) => updateAutoscaling({ scaleOutUtilizationPct: Number(e.target.value) })}
                  className="w-full bg-[#111113] border border-[#3f3f46] rounded px-1.5 py-0.5 text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Circuit Breakers */}
        <div className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-xs">Circuit Breakers</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-[9px] text-[var(--color-text-muted)]">
                {cbPolicy?.enabled ? 'ON' : 'OFF'}
              </span>
              <input
                type="checkbox"
                checked={cbPolicy?.enabled ?? false}
                onChange={(e) => updateCircuitBreaker({ enabled: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
          </div>
          {cbPolicy?.enabled && (
            <div className="pt-2 border-t border-[#27272a] flex items-center justify-between text-[10px]">
              <span className="text-[var(--color-text-muted)]">Fallback Mode</span>
              <select
                value={cbPolicy.fallback ?? 'none'}
                onChange={(e) => updateCircuitBreaker({ fallback: e.target.value as CircuitBreakerPolicy['fallback'] })}
                className="bg-[#111113] border border-[#3f3f46] rounded px-2 py-0.5 text-white"
              >
                <option value="none">Fast-Fail (503)</option>
                <option value="serve-stale-from-cache">Serve Stale from Cache</option>
              </select>
            </div>
          )}
        </div>

        {/* Connection Limits */}
        <div className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-xs">Connection Limits & Caps</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-[9px] text-[var(--color-text-muted)]">
                {connLimits?.enabled ? 'ON' : 'OFF'}
              </span>
              <input
                type="checkbox"
                checked={connLimits?.enabled ?? false}
                onChange={(e) => updateConnectionLimits({ enabled: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
          </div>
          {connLimits?.enabled && (
            <div className="pt-2 border-t border-[#27272a] flex items-center justify-between text-[10px]">
              <span className="text-[var(--color-text-muted)]">Header Timeout (Slowloris)</span>
              <span className="text-white font-bold">{connLimits.headerTimeoutMs ?? 3000}ms</span>
            </div>
          )}
        </div>

        {/* Zero-Trust Hardening */}
        <div className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] space-y-2">
          <span className="font-bold text-white text-xs block">Zero-Trust Hardening</span>
          <div className="space-y-1.5 pt-1 text-[10px]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening?.parameterizedQueries ?? false}
                onChange={(e) => updateHardening({ parameterizedQueries: e.target.checked })}
                className="accent-cyan-400"
              />
              <span>Parameterized Queries (SQLi Shield)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening?.autoQuarantine ?? false}
                onChange={(e) => updateHardening({ autoQuarantine: e.target.checked })}
                className="accent-cyan-400"
              />
              <span>Auto-Quarantine Compromised Hosts</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening?.networkSegmentation ?? false}
                onChange={(e) => updateHardening({ networkSegmentation: e.target.checked })}
                className="accent-cyan-400"
              />
              <span>Microsegmentation (Anti-Lateral)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening?.egressFiltering ?? false}
                onChange={(e) => updateHardening({ egressFiltering: e.target.checked })}
                className="accent-cyan-400"
              />
              <span>Egress Filtering (Anti-Exfiltration)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
