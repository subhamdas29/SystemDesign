/**
 * Pure packet selection under hard visual concurrency caps.
 * Deterministic sampling ensuring tracked and priority requests are never dropped.
 */

export type PacketVisualState =
  | 'forward'
  | 'response'
  | 'queued'
  | 'success'
  | 'rejected'
  | 'failed'
  | 'timed-out'
  | 'malicious'; // Reserved for Phase 7/Attacker scenarios

export interface AnimatedPacket {
  id: string;
  requestId: string;
  sourceNodeId: string;
  targetNodeId: string;
  progress: number; // 0.0 to 1.0
  state: PacketVisualState;
  isTracked: boolean;
  isSampled?: boolean;
  queueIndex?: number;
  timestamp: number;
}

export interface PacketSelectionResult {
  visiblePackets: AnimatedPacket[];
  totalInFlight: number;
  isCapped: boolean;
}

/**
 * Selects up to `cap` packets from all in-flight candidates.
 * Guarantee: Tracked request is ALWAYS included if present.
 * Priority order:
 * 1. Tracked request
 * 2. Failed, rejected, timed-out, or sampled packets
 * 3. Uniformly sampled remainder up to cap
 */
export function selectPacketsUnderCap(
  allEligiblePackets: AnimatedPacket[],
  cap: number = 200,
  trackedRequestId: string | null = null
): PacketSelectionResult {
  const totalInFlight = allEligiblePackets.length;

  if (totalInFlight <= cap) {
    return {
      visiblePackets: allEligiblePackets,
      totalInFlight,
      isCapped: false,
    };
  }

  const selected: AnimatedPacket[] = [];
  const selectedIds = new Set<string>();

  // 1. Highest Priority: Tracked Request
  if (trackedRequestId) {
    const trackedPacket = allEligiblePackets.find((p) => p.requestId === trackedRequestId);
    if (trackedPacket) {
      selected.push(trackedPacket);
      selectedIds.add(trackedPacket.id);
    }
  }

  // 2. High Priority: Failed, Rejected, Timed-out, or Sampled Packets
  const priorityCandidates = allEligiblePackets.filter(
    (p) =>
      !selectedIds.has(p.id) &&
      (p.state === 'rejected' ||
        p.state === 'failed' ||
        p.state === 'timed-out' ||
        p.isSampled === true)
  );

  for (const p of priorityCandidates) {
    if (selected.length >= cap) break;
    selected.push(p);
    selectedIds.add(p.id);
  }

  // 3. Remainder: Uniform sampling to preserve spatial distribution
  const remainingCandidates = allEligiblePackets.filter((p) => !selectedIds.has(p.id));
  const slotsLeft = cap - selected.length;

  if (slotsLeft > 0 && remainingCandidates.length > 0) {
    if (remainingCandidates.length <= slotsLeft) {
      selected.push(...remainingCandidates);
    } else {
      const step = remainingCandidates.length / slotsLeft;
      for (let i = 0; i < slotsLeft; i++) {
        const index = Math.min(
          remainingCandidates.length - 1,
          Math.floor(i * step)
        );
        selected.push(remainingCandidates[index]!);
      }
    }
  }

  return {
    visiblePackets: selected,
    totalInFlight,
    isCapped: true,
  };
}
