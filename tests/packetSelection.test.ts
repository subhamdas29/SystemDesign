import { describe, it, expect } from 'vitest';
import { selectPacketsUnderCap, AnimatedPacket } from '../src/ui/animation/packetSelection';

describe('Packet Selection under Cap', () => {
  const createMockPacket = (
    id: string,
    requestId: string,
    state: AnimatedPacket['state'] = 'forward',
    isSampled = false
  ): AnimatedPacket => ({
    id,
    requestId,
    sourceNodeId: 'client-1',
    targetNodeId: 'server-1',
    progress: 0.5,
    state,
    isTracked: false,
    isSampled,
    timestamp: 100,
  });

  it('returns all packets when total <= cap', () => {
    const packets = [
      createMockPacket('p1', 'req-1'),
      createMockPacket('p2', 'req-2'),
      createMockPacket('p3', 'req-3'),
    ];

    const result = selectPacketsUnderCap(packets, 5);
    expect(result.totalInFlight).toBe(3);
    expect(result.isCapped).toBe(false);
    expect(result.visiblePackets.length).toBe(3);
  });

  it('always includes the tracked request even under strict caps', () => {
    const packets: AnimatedPacket[] = [];
    for (let i = 1; i <= 50; i++) {
      packets.push(createMockPacket(`p-${i}`, `req-${i}`));
    }

    const trackedReqId = 'req-42';
    // Strict cap of 5 packets
    const result = selectPacketsUnderCap(packets, 5, trackedReqId);

    expect(result.totalInFlight).toBe(50);
    expect(result.isCapped).toBe(true);
    expect(result.visiblePackets.length).toBe(5);
    expect(result.visiblePackets.some((p) => p.requestId === trackedReqId)).toBe(true);
  });

  it('prioritizes failed, rejected, and sampled packets over normal forward packets', () => {
    const normalPackets: AnimatedPacket[] = [];
    for (let i = 1; i <= 20; i++) {
      normalPackets.push(createMockPacket(`norm-${i}`, `req-norm-${i}`, 'forward'));
    }

    const rejectedPkt = createMockPacket('rej-1', 'req-rej', 'rejected');
    const failedPkt = createMockPacket('fail-1', 'req-fail', 'failed');
    const sampledPkt = createMockPacket('samp-1', 'req-samp', 'forward', true);

    const all = [...normalPackets, rejectedPkt, failedPkt, sampledPkt];

    // Cap of 4 packets
    const result = selectPacketsUnderCap(all, 4);

    expect(result.visiblePackets.length).toBe(4);
    // Priority packets must be present
    expect(result.visiblePackets.some((p) => p.id === 'rej-1')).toBe(true);
    expect(result.visiblePackets.some((p) => p.id === 'fail-1')).toBe(true);
    expect(result.visiblePackets.some((p) => p.id === 'samp-1')).toBe(true);
  });

  it('produces deterministic output given identical inputs', () => {
    const packets: AnimatedPacket[] = [];
    for (let i = 1; i <= 100; i++) {
      packets.push(createMockPacket(`p-${i}`, `req-${i}`));
    }

    const res1 = selectPacketsUnderCap(packets, 10, 'req-50');
    const res2 = selectPacketsUnderCap(packets, 10, 'req-50');

    expect(res1.visiblePackets.map((p) => p.id)).toEqual(res2.visiblePackets.map((p) => p.id));
  });
});
