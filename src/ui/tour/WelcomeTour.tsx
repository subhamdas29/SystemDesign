import React, { useState, useEffect } from 'react';

const TOUR_STORAGE_KEY = 'life_of_a_request_tour_completed_v1';

export interface TourStep {
  title: string;
  description: string;
  targetArea: string; // e.g. 'inventory' | 'canvas' | 'inspector' | 'controls' | 'dashboard'
  icon: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: '1. Architecture Inventory',
    description:
      'Drag and drop cloud primitives—Load Balancers, App Servers, In-Memory Caches, Message Queues, Workers, and Databases—into the canvas to architect your distributed system.',
    targetArea: 'Left Panel',
    icon: '📦',
  },
  {
    title: '2. Interactive Canvas',
    description:
      'Connect components with directional network edges. Packets animate along edges with simulated hop latency, queues visually stack under load, and dropped requests produce ripples.',
    targetArea: 'Center Canvas',
    icon: '⚡',
  },
  {
    title: '3. Live Component Inspector',
    description:
      'Click any component to inspect its capacity, connection pools, cache hit ratios, and retry policies. Live sparklines track utilization and queue depth.',
    targetArea: 'Right Panel',
    icon: '🔍',
  },
  {
    title: '4. Simulation Controls & Time Travel',
    description:
      'Simulate from 10 to 1,000,000 requests per second. Pause, step event-by-event, adjust speed from 1x to 8x, or scrub backward in time with bit-for-bit determinism.',
    targetArea: 'Bottom Bar',
    icon: '⏱️',
  },
  {
    title: '5. Monitoring Dashboard & Attacker Mode',
    description:
      'Expand the telemetry dashboard to inspect latency histograms (P50, P95, P99) and system health. Switch to Attacker Mode to test your defenses against realistic DDoS floods and slowloris attacks.',
    targetArea: 'Bottom Panel',
    icon: '📊',
  },
];

interface WelcomeTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeTour: React.FC<WelcomeTourProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep]!;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      onClose();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  const handleSkip = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
    >
      <div className="w-full max-w-md bg-[#18181b] border border-[#3f3f46] rounded-2xl shadow-2xl p-6 text-white font-sans flex flex-col justify-between">
        {/* Step Indicator & Header */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Welcome Tour · Step {currentStep + 1} of {TOUR_STEPS.length}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] bg-white/10 text-neutral-300 font-mono">
              {step.targetArea}
            </span>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{step.icon}</span>
            <h2 id="tour-step-title" className="text-lg font-bold text-white">
              {step.title}
            </h2>
          </div>

          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-6">
            {step.description}
          </p>
        </div>

        {/* Progress Bar & Buttons */}
        <div>
          <div className="flex gap-1.5 mb-5">
            {TOUR_STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  idx === currentStep ? 'bg-white' : idx < currentStep ? 'bg-neutral-500' : 'bg-neutral-800'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs text-[var(--color-text-muted)] hover:text-white transition-colors"
            >
              Skip Tour
            </button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="px-3 py-1.5 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-xs font-medium text-white transition-colors"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors shadow-sm"
              >
                {isLast ? 'Get Started' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export function shouldShowWelcomeTour(): boolean {
  if (typeof window === 'undefined') return false;
  return !localStorage.getItem(TOUR_STORAGE_KEY);
}
