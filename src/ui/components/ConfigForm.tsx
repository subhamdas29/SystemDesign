/**
 * Interactive configuration form for selected architecture components.
 * Renders preset selector, unit inputs, sliders, tooltips, validation messages,
 * collapsible advanced section, and bulk actions.
 */

import React, { useState } from 'react';
import { GraphNode, AnyComponentConfig, validateNodeConfig } from '../../types';
import { COMPONENT_FIELD_METADATA, FieldMetadata } from '../../engine/components/metadata';
import { detectPreset, PresetTier } from '../../engine/components/presets';
import { useGraphStore } from '../../store';

interface ConfigFormProps {
  node: GraphNode;
}

export const ConfigForm: React.FC<ConfigFormProps> = ({ node }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const updateNodeConfig = useGraphStore((s) => s.updateNodeConfig);
  const applyPreset = useGraphStore((s) => s.applyPreset);
  const resetNodeConfig = useGraphStore((s) => s.resetNodeConfig);
  const applyConfigToAll = useGraphStore((s) => s.applyConfigToAll);

  const fields = COMPONENT_FIELD_METADATA[node.type] ?? [];
  const basicFields = fields.filter((f) => !f.advanced);
  const advancedFields = fields.filter((f) => f.advanced);

  const currentConfig = node.config as unknown as Record<string, unknown>;
  const activePreset = detectPreset(node.type, node.config);

  // Validate node configuration
  const validationResult = validateNodeConfig(node.type, node.config);
  const errorMap = new Map<string, string>();
  for (const err of validationResult.errors) {
    const [fieldKey, msg] = err.split(': ');
    if (fieldKey && msg) {
      errorMap.set(fieldKey.trim(), msg.trim());
    }
  }

  const handleFieldChange = (key: string, value: unknown, isContinuous = false) => {
    updateNodeConfig(node.id, { [key]: value } as Partial<AnyComponentConfig>, isContinuous);
  };

  const handlePresetSelect = (tier: PresetTier) => {
    applyPreset(node.id, tier);
  };

  const renderField = (field: FieldMetadata) => {
    const rawVal = currentConfig[field.key];
    const errorMsg = errorMap.get(field.key);

    return (
      <div key={field.key} className="space-y-1 py-1.5 border-b border-[#222226] last:border-b-0">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor={`${node.id}-${field.key}`}
            className="font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5"
            title={field.helpText}
          >
            <span>{field.label}</span>
            <span
              className="text-[10px] text-[var(--color-text-faint)] cursor-help px-1 rounded hover:bg-white/10"
              title={field.helpText}
            >
              ℹ
            </span>
          </label>

          {field.unit && (
            <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
              {field.unit}
            </span>
          )}
        </div>

        {/* Input Controls */}
        {field.inputType === 'slider' && (
          <div className="flex items-center gap-3">
            <input
              id={`${node.id}-${field.key}`}
              type="range"
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              value={Number(rawVal ?? 0)}
              onChange={(e) => handleFieldChange(field.key, Number(e.target.value), true)}
              className="flex-1 accent-white h-1.5 bg-[#27272a] rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-12 text-right font-mono text-xs text-white">
              {Number(rawVal ?? 0).toLocaleString()}
            </span>
          </div>
        )}

        {field.inputType === 'number' && (
          <div className="relative">
            <input
              id={`${node.id}-${field.key}`}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={Number(rawVal ?? 0)}
              onChange={(e) => handleFieldChange(field.key, Number(e.target.value), true)}
              className="w-full h-8 px-2.5 rounded bg-[#18181b] border border-[#3f3f46] focus:border-white text-white font-mono text-xs outline-none transition-colors"
            />
          </div>
        )}

        {field.inputType === 'select' && (
          <select
            id={`${node.id}-${field.key}`}
            value={String(rawVal ?? '')}
            onChange={(e) => handleFieldChange(field.key, e.target.value, false)}
            className="w-full h-8 px-2 rounded bg-[#18181b] border border-[#3f3f46] focus:border-white text-white font-mono text-xs outline-none transition-colors"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#18181b] text-white">
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {field.inputType === 'boolean' && (
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input
              id={`${node.id}-${field.key}`}
              type="checkbox"
              checked={Boolean(rawVal)}
              onChange={(e) => handleFieldChange(field.key, e.target.checked, false)}
              className="w-4 h-4 rounded bg-[#18181b] border border-[#3f3f46] accent-white cursor-pointer"
            />
            <span className="text-xs text-[var(--color-text-muted)]">Enabled</span>
          </label>
        )}

        {/* Inline Error Message */}
        {errorMsg && (
          <div className="text-[10px] text-amber-300 font-mono flex items-center gap-1 mt-0.5">
            <span>⚠</span>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3.5 rounded-xl border border-[#27272a] bg-[#111113] space-y-4">
      {/* Preset Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            Configuration Preset
          </span>
          <span className="font-mono text-[10px] text-white/70 uppercase">
            {activePreset}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#0b0b0d] border border-[#27272a]">
          {(['small', 'medium', 'large'] as PresetTier[]).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => handlePresetSelect(tier)}
              className={`py-1 rounded text-xs font-mono capitalize transition-all ${
                activePreset === tier
                  ? 'bg-[#222226] text-white font-semibold border border-white/30 shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {/* Basic Settings Fields */}
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
          Core Settings
        </div>
        {basicFields.map(renderField)}
      </div>

      {/* Advanced Settings Collapsible */}
      {advancedFields.length > 0 && (
        <div className="pt-2 border-t border-[#27272a] space-y-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between text-xs font-semibold text-[var(--color-text-muted)] hover:text-white transition-colors"
          >
            <span>Advanced Settings ({advancedFields.length})</span>
            <span className="font-mono text-xs">{showAdvanced ? '▲' : '▼'}</span>
          </button>

          {showAdvanced && (
            <div className="space-y-1 pt-1 animate-in fade-in duration-200">
              {advancedFields.map(renderField)}
            </div>
          )}
        </div>
      )}

      {/* Node-Level Actions */}
      <div className="pt-3 border-t border-[#27272a] flex flex-col gap-2">
        {/* App Server Bulk Action */}
        {node.type === 'app-server' && (
          <button
            type="button"
            onClick={() => applyConfigToAll('app-server', node.config)}
            title="Copies this server's configuration to all App Servers in the architecture"
            className="w-full py-1.5 px-3 rounded text-xs font-mono bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all text-left flex items-center justify-between"
          >
            <span>Apply to all App Servers</span>
            <span>⇄</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => resetNodeConfig(node.id)}
          className="w-full py-1 px-2.5 rounded text-[11px] font-mono text-[var(--color-text-muted)] hover:text-white bg-transparent hover:bg-white/5 border border-transparent hover:border-[#3f3f46] transition-all text-center"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
};
