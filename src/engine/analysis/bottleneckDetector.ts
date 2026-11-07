/**
 * Runtime bottleneck detection with hysteresis.
 * Pure function with zero side-effects.
 */

import { SimulationSnapshot } from '../protocol';
import { RuntimeBottleneck } from './types';
import { ComponentType } from '../../types';

export const BOTTLENECK_HYSTERESIS_TICKS = 3;

/**
 * Pure function to detect the active runtime bottleneck node.
 * Uses a 3-tick hysteresis confirmation to eliminate transient flickering.
 * Criteria: queue depth growing, utilization >= 90%, or rejection rate > 0.
 */
export function detectBottleneck(
  snapshot: SimulationSnapshot,
  history: SimulationSnapshot[] = []
): RuntimeBottleneck | null {
  // Combine history with current snapshot
  const windowSnapshots = [...history, snapshot];
  if (windowSnapshots.length === 0) {
    return null;
  }

  // Find candidate nodes across all runtime nodes in current snapshot
  const nodeIds = Object.keys(snapshot.runtimeNodes);
  let bestCandidate: RuntimeBottleneck | null = null;
  let highestScore = -1;

  for (const nodeId of nodeIds) {
    const currentState = snapshot.runtimeNodes[nodeId];
    if (!currentState) continue;

    // Check last N ticks (up to BOTTLENECK_HYSTERESIS_TICKS)
    const checkCount = Math.min(windowSnapshots.length, BOTTLENECK_HYSTERESIS_TICKS);
    const recentWindow = windowSnapshots.slice(-checkCount);

    let consecutiveStressedTicks = 0;
    let queueIsGrowing = false;
    let prevQueue = -1;

    for (const snap of recentWindow) {
      const nodeState = snap.runtimeNodes[nodeId];
      if (!nodeState) continue;

      const isStressed =
        nodeState.utilization >= 0.88 ||
        nodeState.queueDepth > 0 ||
        nodeState.status === 'overloaded' ||
        snap.counters.rejected > 0;

      if (isStressed) {
        consecutiveStressedTicks++;
      }

      if (prevQueue >= 0 && nodeState.queueDepth >= prevQueue) {
        queueIsGrowing = true;
      }
      prevQueue = nodeState.queueDepth;
    }

    // Require 3 consecutive stressed ticks for hysteresis confirmation
    const isConfirmed = consecutiveStressedTicks >= BOTTLENECK_HYSTERESIS_TICKS;

    if (isConfirmed && (currentState.utilization >= 0.88 || currentState.queueDepth > 0)) {
      // Score = utilization weight + queue depth + rejection weight
      const rejectionRatio =
        snapshot.counters.created > 0
          ? snapshot.counters.rejected / snapshot.counters.created
          : 0;
      const score =
        currentState.utilization * 100 +
        currentState.queueDepth * 10 +
        rejectionRatio * 500 +
        (queueIsGrowing ? 20 : 0);

      if (score > highestScore) {
        highestScore = score;

        let reason: string;
        if (rejectionRatio > 0) {
          reason = `Queue overflow causing request rejections (utilization: ${Math.round(currentState.utilization * 100)}%, queue: ${currentState.queueDepth})`;
        } else if (currentState.queueDepth > 0) {
          reason = `Queue depth building up (${currentState.queueDepth} queued requests)`;
        } else {
          reason = `High sustained load at ${Math.round(currentState.utilization * 100)}% utilization`;
        }

        // Infer component type from nodeId prefix (e.g. "db-1" -> "database", "app-1" -> "app-server")
        let type: ComponentType = 'app-server';
        if (nodeId.startsWith('db') || nodeId.startsWith('database')) type = 'database';
        else if (nodeId.startsWith('cache')) type = 'cache';
        else if (nodeId.startsWith('lb') || nodeId.startsWith('load-balancer')) type = 'load-balancer';
        else if (nodeId.startsWith('router')) type = 'router';
        else if (nodeId.startsWith('dns')) type = 'dns';

        bestCandidate = {
          nodeId,
          type,
          utilization: currentState.utilization,
          queueDepth: currentState.queueDepth,
          rejectionRate: Math.round(rejectionRatio * 1000) / 1000,
          reason,
        };
      }
    }
  }

  return bestCandidate;
}
