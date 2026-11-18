/**
 * Interactive configuration form for selected architecture components.
 * Renders plain sections with dividers (ZERO card containers), bordered inputs,
 * preset selector, sliders, and collapsible advanced settings.
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
      <div key={field.key} className="space-y-1 py-2 border-b border-[#2A2E39] last:border-b-0">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor={`${node.id}-${field.key}`}
            className="font-medium text-[#8E8E8E] flex items-center gap-1.5"
            title={field.helpText}
          >
            <span>{field.label}</span>
            <span
              className="text-[10px] text-[#6B7280] cursor-help px-1 rounded hover:bg-white/10"
              title={field.helpText}
            >
              ℹ
            </span>
          </label>

          {field.unit && (
            <span className="text-[10px] font-mono text-[#8E8E8E]">
              {field.unit}
            </span>
          )}
        </div>

        {/* Input Controls */}
        {field.inputType === 'slider' && (
          <div className="flex items-center gap-3 pt-1">
            <input
              id={`${node.id}-${field.key}`}
              type="range"
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              value={Number(rawVal ?? 0)}
              onChange={(e) => handleFieldChange(field.key, Number(e.target.value), true)}
              className="flex-1 accent-[#F3EEE3] h-1.5 bg-[#2A2E39] rounded appearance-none cursor-pointer"
            />
            <span className="w-14 text-right font-mono text-xs text-[#F3EEE3]">
              {Number(rawVal ?? 0).toLocaleString()}
            </span>
          </div>
        )}

        {field.inputType === 'number' && (
          <div className="relative pt-1">
            <input
              id={`${node.id}-${field.key}`}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={Number(rawVal ?? 0)}
              onChange={(e) => handleFieldChange(field.key, Number(e.target.value), true)}
              className="w-full h-8 px-2.5 rounded bg-[#1B1E24] border border-[#2A2E39] focus:border-[#F3EEE3] text-[#F3EEE3] font-mono text-xs outline-none transition-colors"
            />
          </div>
        )}

        {field.inputType === 'select' && (
          <div className="pt-1">
            <select
              id={`${node.id}-${field.key}`}
              value={String(rawVal ?? '')}
              onChange={(e) => handleFieldChange(field.key, e.target.value, false)}
              className="w-full h-8 px-2 rounded bg-[#1B1E24] border border-[#2A2E39] focus:border-[#F3EEE3] text-[#F3EEE3] font-mono text-xs outline-none transition-colors cursor-pointer"
            >
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#1B1E24] text-[#F3EEE3]">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {field.inputType === 'boolean' && (
          <label className="flex items-center gap-2 cursor-pointer mt-1 pt-1">
            <input
              id={`${node.id}-${field.key}`}
              type="checkbox"
              checked={Boolean(rawVal)}
              onChange={(e) => handleFieldChange(field.key, e.target.checked, false)}
              className="w-4 h-4 rounded bg-[#1B1E24] border border-[#2A2E39] accent-[#F3EEE3] cursor-pointer"
            />
            <span className="text-xs text-[#8E8E8E]">Enabled</span>
          </label>
        )}

        {/* Inline Error Message */}
        {errorMsg && (
          <div className="text-[10px] text-[#D9541E] font-mono flex items-center gap-1 mt-0.5">
            <span>⚠</span>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 font-mono text-[#F3EEE3]">
      {/* Preset Selector */}
      <div className="space-y-1.5 pb-3 border-b border-[#2A2E39]">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
            Configuration Preset
          </span>
          <span className="text-[10px] text-[#8E8E8E] uppercase">
            {activePreset}
          </span>
        </div>

        <div className="flex gap-4 pt-1">
          {(['small', 'medium', 'large'] as PresetTier[]).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => handlePresetSelect(tier)}
              className={`text-xs capitalize transition-colors cursor-pointer py-0.5 ${
                activePreset === tier
                  ? 'text-[#F3EEE3] font-bold border-b-2 border-[#D9541E]'
                  : 'text-[#8E8E8E] hover:text-[#F3EEE3]'
              }`}
            >
              {tier}
            </button>
          ))}
          {activePreset === 'custom' && (
            <span className="text-xs capitalize py-0.5 text-[#F3EEE3] font-bold border-b-2 border-[#D9541E] select-none">
              Custom
            </span>
          )}
        </div>
      </div>

      {/* Basic Settings Fields */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest mb-1">
          Core Settings
        </div>
        {basicFields.map(renderField)}
      </div>

      {/* Advanced Settings Collapsible */}
      {advancedFields.length > 0 && (
        <div className="pt-2 border-t border-[#2A2E39] space-y-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between text-xs font-semibold text-[#8E8E8E] hover:text-[#F3EEE3] transition-colors cursor-pointer py-1"
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
      <div className="pt-3 border-t border-[#2A2E39] flex flex-col gap-2">
        {/* App Server Bulk Action */}
        {node.type === 'app-server' && (
          <button
            type="button"
            onClick={() => applyConfigToAll('app-server', node.config)}
            title="Copies this server's configuration to all App Servers in the architecture"
            className="w-full py-1.5 px-3 rounded text-xs font-mono bg-[#1B1E24] hover:bg-[#252932] text-[#F3EEE3] border border-[#2A2E39] hover:border-white transition-all text-left flex items-center justify-between cursor-pointer"
          >
            <span>Apply to all App Servers</span>
            <span>⇄</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => resetNodeConfig(node.id)}
          className="w-full py-1 text-[11px] font-mono text-[#8E8E8E] hover:text-[#F3EEE3] hover:underline bg-transparent border-0 transition-all text-center cursor-pointer"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
};

export default ConfigForm;
