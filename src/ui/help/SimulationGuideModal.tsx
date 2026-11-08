import React from 'react';

interface SimulationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SimulationGuideModal: React.FC<SimulationGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4"
    >
      <div className="w-full max-w-2xl max-h-[85vh] bg-[#141416] border border-[#27272a] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white font-sans">
        <div className="px-6 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📖</span>
            <div>
              <h2 id="guide-modal-title" className="text-base font-semibold">
                Simulation Engine Guide
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Understanding simulation modes, packet visuals, and mathematical behavior
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

        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-neutral-300 leading-relaxed">
          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">Dual Simulation Modes</h3>
            <p className="mb-2">
              <strong className="text-white">Discrete-Event Mode (&le; 1,000 RPS):</strong> Simulates every individual request as an explicit timestamped event in a priority queue. Includes lognormal service times, retry budgets, health-check probes, and packet animation.
            </p>
            <p>
              <strong className="text-white">Aggregate Fluid ODE Mode (&gt; 1,000 RPS):</strong> Uses differential conservation equations to simulate massive volumetric workloads up to 1,000,000 RPS in sub-second wall-clock time without dropping a single frame.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">Packet Visual States</h3>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="p-2 rounded bg-[#18181b] border border-[#27272a] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_6px_#fff]" />
                <span>Legitimate Forward Request</span>
              </div>
              <div className="p-2 rounded bg-[#18181b] border border-[#27272a] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>Successful Response (HTTP 200)</span>
              </div>
              <div className="p-2 rounded bg-[#18181b] border border-[#27272a] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span>Malicious Flood / Attack Packet</span>
              </div>
              <div className="p-2 rounded bg-[#18181b] border border-[#27272a] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>Queued / Backlog Waiting</span>
              </div>
              <div className="p-2 rounded bg-[#18181b] border border-[#27272a] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
                <span>Rejected / Saturated (HTTP 503)</span>
              </div>
              <div className="p-2 rounded bg-[#18181b] border border-[#27272a] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                <span>Timed Out (HTTP 504)</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">Deterministic Reproducibility</h3>
            <p>
              Every simulation run is 100% deterministic. Initializing with the same random seed guarantees bit-for-bit identical latency distributions, queue states, and event hashes regardless of host hardware speed or execution mode.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
