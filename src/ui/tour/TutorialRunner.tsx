import React, { useState, useEffect } from 'react';
import { Tutorial } from '../../scenarios/tutorials/types';
import { useGraphStore, useSimulationStore } from '@store';

interface TutorialRunnerProps {
  tutorial: Tutorial | null;
  onExit: () => void;
}

export const TutorialRunner: React.FC<TutorialRunnerProps> = ({ tutorial, onExit }) => {
  const [stepIndex, setStepIndex] = useState(0);

  const graph = useGraphStore((s) => s.graph);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const simStatus = useSimulationStore((s) => s.status);
  const counters = useSimulationStore((s) => s.counters);
  const activeFailures = useSimulationStore((s) => s.activeFailures);
  const setTrafficConfig = useSimulationStore((s) => s.setTrafficConfig);
  const resetSim = useSimulationStore((s) => s.reset);

  useEffect(() => {
    if (tutorial) {
      setStepIndex(0);
      const initial = tutorial.initialGraph(graph);
      loadGraph(initial);
      setTrafficConfig(tutorial.initialTraffic, initial);
      resetSim(initial);
    }
  }, [tutorial]);

  if (!tutorial) return null;

  const currentStep = tutorial.steps[stepIndex];
  if (!currentStep) return null;

  const isCompleted = currentStep.checkCompletion({
    graph,
    simStatus,
    counters,
    activeFailures,
  });

  const isLast = stepIndex === tutorial.steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      onExit();
    } else {
      setStepIndex((s) => s + 1);
    }
  };

  return (
    <div
      role="region"
      aria-label="Interactive Tutorial"
      className="absolute top-4 left-1/2 -translate-x-1/2 z-40 max-w-lg w-[90%] bg-[#18181b]/95 backdrop-blur-md border border-[#3f3f46] rounded-2xl shadow-2xl p-4 text-white font-sans animate-in fade-in slide-in-from-top-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-300">🎓 {tutorial.title}</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-400">
            Step {stepIndex + 1} of {tutorial.steps.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="text-xs text-[var(--color-text-muted)] hover:text-white px-2 py-0.5 rounded hover:bg-white/10"
        >
          Exit Tutorial
        </button>
      </div>

      <p className="text-xs font-semibold text-white mb-1.5">{currentStep.instruction}</p>
      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mb-3">
        {currentStep.explanation}
      </p>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          {isCompleted ? (
            <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
              ✓ Step Goal Achieved
            </span>
          ) : (
            <span className="text-amber-400/90 text-[11px] font-medium flex items-center gap-1">
              ⏳ In Progress...
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleNext}
          disabled={!isCompleted && !isLast}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            isCompleted || isLast
              ? 'bg-white text-black hover:bg-neutral-200 shadow-sm cursor-pointer'
              : 'bg-white/20 text-neutral-400 cursor-not-allowed'
          }`}
        >
          {isLast ? 'Complete Tutorial ✓' : 'Next Step →'}
        </button>
      </div>
    </div>
  );
};
