/**
 * Pure Request Trace Builder.
 * Converts chronological simulation events into structured waterfall spans,
 * plain-language routing decisions, and outcome diagnostics.
 * Zero React/DOM imports; strictly serializable.
 */

import { SimulationEvent } from '../../types/runtime';
import { GraphConfig, ComponentType } from '../../types';
import { RequestTrace, TraceSpan, TraceDecision } from './types';
import { COMPONENT_RULES } from '../../builder/rules/slotRules';

export function buildRequestTrace(
  requestId: string,
  allEvents: SimulationEvent[],
  graph: GraphConfig
): RequestTrace | null {
  const reqEvents = allEvents.filter((e) => e.requestId === requestId);
  if (reqEvents.length === 0) {
    return null;
  }

  // Node lookup helpers
  const nodeMap = new Map<string, { label: string; type: ComponentType }>();
  for (const n of graph.nodes) {
    const label = n.label || COMPONENT_RULES[n.type]?.label || n.type;
    nodeMap.set(n.id, { label, type: n.type });
  }

  const getNodeInfo = (nodeId: string) => {
    return nodeMap.get(nodeId) ?? {
      label: nodeId,
      type: (nodeId.split('-')[0] ?? 'app-server') as ComponentType,
    };
  };

  const firstEvent = reqEvents[0]!;
  const lastEvent = reqEvents[reqEvents.length - 1]!;
  const startTimeMs = firstEvent.timestamp;
  let endTimeMs = lastEvent.timestamp;
  let statusCode = 200;
  let outcome: RequestTrace['outcome'] = 'in-flight';
  let failureReason: string | undefined;
  let kind: 'read' | 'write' = 'read';
  let isSampled = false;

  const path: string[] = [];
  const spans: TraceSpan[] = [];
  const decisions: TraceDecision[] = [];

  let spanCounter = 1;
  let activeProcessingStart: { nodeId: string; timeMs: number } | null = null;
  let activeQueueStart: { nodeId: string; timeMs: number } | null = null;
  let activeDbQueryStart: { nodeId: string; timeMs: number } | null = null;
  let lastNodeDepartureTime = startTimeMs;
  let lastDepartureNodeId = firstEvent.nodeId;

  for (let i = 0; i < reqEvents.length; i++) {
    const ev = reqEvents[i]!;
    if (ev.details?.sampled === true) {
      isSampled = true;
    }

    if (!path.includes(ev.nodeId)) {
      path.push(ev.nodeId);
    }
    if (ev.targetNodeId && !path.includes(ev.targetNodeId)) {
      path.push(ev.targetNodeId);
    }

    switch (ev.type) {
      case 'REQUEST_CREATED': {
        if (ev.details?.kind === 'write') {
          kind = 'write';
        }
        lastNodeDepartureTime = ev.timestamp;
        lastDepartureNodeId = ev.nodeId;
        break;
      }

      case 'DNS_LOOKUP': {
        const isHit = Boolean(ev.details?.isHit);
        const latency = Number(ev.details?.lookupLatencyMs ?? 15);
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: 'dns',
          type: 'cache',
          summary: isHit
            ? 'DNS cache hit: resolved domain in 1 ms'
            : `DNS cache miss: resolved domain via external query in ${latency} ms`,
        });

        spans.push({
          id: `span-${spanCounter++}`,
          nodeId: ev.nodeId,
          nodeLabel: getNodeInfo(ev.nodeId).label,
          componentType: 'dns',
          kind: 'processing',
          startTimeMs: ev.timestamp,
          endTimeMs: ev.timestamp + latency,
          durationMs: latency,
          status: 'succeeded',
          details: isHit ? 'Cache hit' : 'Recursive lookup',
        });
        lastNodeDepartureTime = ev.timestamp + latency;
        lastDepartureNodeId = ev.nodeId;
        break;
      }

      case 'REQUEST_RECEIVED': {
        // Network transit span from previous hop
        const hopDuration = Math.max(0.5, ev.timestamp - lastNodeDepartureTime);
        spans.push({
          id: `span-${spanCounter++}`,
          nodeId: lastDepartureNodeId,
          nodeLabel: `${getNodeInfo(lastDepartureNodeId).label} → ${getNodeInfo(ev.nodeId).label}`,
          componentType: getNodeInfo(lastDepartureNodeId).type,
          kind: 'network',
          startTimeMs: lastNodeDepartureTime,
          endTimeMs: ev.timestamp,
          durationMs: Math.round(hopDuration * 10) / 10,
          status: 'succeeded',
          details: 'Network hop',
        });
        break;
      }

      case 'REQUEST_QUEUED': {
        activeQueueStart = { nodeId: ev.nodeId, timeMs: ev.timestamp };
        const qDepth = ev.details?.queueDepth ?? 'full';
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: getNodeInfo(ev.nodeId).type,
          type: 'overflow',
          summary: `Concurrency saturated: request queued at ${getNodeInfo(ev.nodeId).label} (queue depth: ${qDepth})`,
        });
        break;
      }

      case 'REQUEST_PROCESSING_STARTED': {
        if (activeQueueStart && activeQueueStart.nodeId === ev.nodeId) {
          const queueWaitMs = Math.max(0.1, ev.timestamp - activeQueueStart.timeMs);
          spans.push({
            id: `span-${spanCounter++}`,
            nodeId: ev.nodeId,
            nodeLabel: getNodeInfo(ev.nodeId).label,
            componentType: getNodeInfo(ev.nodeId).type,
            kind: 'queue',
            startTimeMs: activeQueueStart.timeMs,
            endTimeMs: ev.timestamp,
            durationMs: Math.round(queueWaitMs * 10) / 10,
            status: 'succeeded',
            details: `Waited in queue (${Math.round(queueWaitMs)} ms)`,
          });
          activeQueueStart = null;
        }
        activeProcessingStart = { nodeId: ev.nodeId, timeMs: ev.timestamp };
        break;
      }

      case 'LOAD_BALANCED': {
        const targetNodeId = ev.targetNodeId ?? 'app-server';
        const targetLabel = getNodeInfo(targetNodeId).label;
        const algo = String(ev.details?.algorithm ?? 'round-robin');
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: 'load-balancer',
          type: 'routing',
          summary: `Load Balancer selected ${targetLabel} using ${algo} algorithm`,
        });
        lastNodeDepartureTime = ev.timestamp;
        lastDepartureNodeId = ev.nodeId;
        break;
      }

      case 'CACHE_HIT': {
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: 'cache',
          type: 'cache',
          summary: 'In-Memory Cache HIT: returned cached data without querying the Database',
        });
        spans.push({
          id: `span-${spanCounter++}`,
          nodeId: ev.nodeId,
          nodeLabel: getNodeInfo(ev.nodeId).label,
          componentType: 'cache',
          kind: 'processing',
          startTimeMs: ev.timestamp,
          endTimeMs: ev.timestamp + 1,
          durationMs: 1,
          status: 'succeeded',
          details: 'Cache hit lookup',
        });
        lastNodeDepartureTime = ev.timestamp + 1;
        lastDepartureNodeId = ev.nodeId;
        break;
      }

      case 'CACHE_MISS': {
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: 'cache',
          type: 'cache',
          summary: 'In-Memory Cache MISS: key not found, querying Primary Database',
        });
        break;
      }

      case 'DATABASE_QUERY': {
        activeDbQueryStart = { nodeId: ev.nodeId, timeMs: ev.timestamp };
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: 'database',
          type: 'pool',
          summary: `Acquired connection from Database pool for ${kind.toUpperCase()} transaction`,
        });
        break;
      }

      case 'RESPONSE_FORWARDED': {
        if (activeDbQueryStart) {
          const dbDuration = Math.max(1, ev.timestamp - activeDbQueryStart.timeMs);
          spans.push({
            id: `span-${spanCounter++}`,
            nodeId: activeDbQueryStart.nodeId,
            nodeLabel: getNodeInfo(activeDbQueryStart.nodeId).label,
            componentType: 'database',
            kind: 'database',
            startTimeMs: activeDbQueryStart.timeMs,
            endTimeMs: ev.timestamp,
            durationMs: Math.round(dbDuration * 10) / 10,
            status: 'succeeded',
            details: `${kind.toUpperCase()} query execution`,
          });
          activeDbQueryStart = null;
        } else if (activeProcessingStart) {
          const procDuration = Math.max(1, ev.timestamp - activeProcessingStart.timeMs);
          spans.push({
            id: `span-${spanCounter++}`,
            nodeId: activeProcessingStart.nodeId,
            nodeLabel: getNodeInfo(activeProcessingStart.nodeId).label,
            componentType: getNodeInfo(activeProcessingStart.nodeId).type,
            kind: 'processing',
            startTimeMs: activeProcessingStart.timeMs,
            endTimeMs: ev.timestamp,
            durationMs: Math.round(procDuration * 10) / 10,
            status: 'succeeded',
            details: 'Request execution',
          });
          activeProcessingStart = null;
        }

        const hopDuration = Math.max(0.5, ev.timestamp - lastNodeDepartureTime);
        const targetNodeId = ev.targetNodeId ?? 'client-1';
        spans.push({
          id: `span-${spanCounter++}`,
          nodeId: ev.nodeId,
          nodeLabel: `${getNodeInfo(ev.nodeId).label} → ${getNodeInfo(targetNodeId).label}`,
          componentType: getNodeInfo(ev.nodeId).type,
          kind: 'network',
          startTimeMs: lastNodeDepartureTime,
          endTimeMs: ev.timestamp,
          durationMs: Math.round(hopDuration * 10) / 10,
          status: 'succeeded',
          details: 'Return response hop',
        });
        lastNodeDepartureTime = ev.timestamp;
        lastDepartureNodeId = ev.nodeId;
        break;
      }

      case 'RESPONSE_RECEIVED': {
        statusCode = Number(ev.details?.statusCode ?? 200);
        outcome = 'succeeded';
        endTimeMs = ev.timestamp;
        break;
      }

      case 'REQUEST_REJECTED': {
        statusCode = 503;
        outcome = 'rejected';
        endTimeMs = ev.timestamp;
        const reason = String(ev.details?.reason ?? 'QUEUE_OVERFLOW');
        failureReason =
          reason === 'DATABASE_POOL_EXHAUSTED'
            ? `Rejected by ${getNodeInfo(ev.nodeId).label}: connection pool exhausted`
            : `Rejected by ${getNodeInfo(ev.nodeId).label}: queue buffer full`;
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: getNodeInfo(ev.nodeId).type,
          type: 'overflow',
          summary: failureReason,
        });
        break;
      }

      case 'REQUEST_TIMED_OUT': {
        statusCode = 504;
        outcome = 'timed-out';
        endTimeMs = ev.timestamp;
        const timeoutLimit = ev.details?.timeoutLimitMs ?? 5000;
        failureReason = `Timed out after ${Math.round(ev.timestamp - startTimeMs)} ms (client timeout limit: ${timeoutLimit} ms)`;
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: getNodeInfo(ev.nodeId).type,
          type: 'timeout',
          summary: failureReason,
        });
        break;
      }

      case 'REQUEST_FAILED': {
        statusCode = 502;
        outcome = 'failed';
        endTimeMs = ev.timestamp;
        const reason = String(ev.details?.reason ?? 'DOWNSTREAM_ERROR');
        failureReason =
          reason === 'NO_HEALTHY_BACKEND'
            ? `Failed at ${getNodeInfo(ev.nodeId).label}: no healthy backend servers available`
            : `Failed at ${getNodeInfo(ev.nodeId).label}: connection dropped`;
        decisions.push({
          id: `dec-${decisions.length + 1}`,
          timestampMs: ev.timestamp,
          nodeId: ev.nodeId,
          componentType: getNodeInfo(ev.nodeId).type,
          type: 'overflow',
          summary: failureReason,
        });
        break;
      }
    }
  }

  const totalDurationMs = Math.max(1, Math.round((endTimeMs - startTimeMs) * 10) / 10);

  // Compute summary line
  const totalQueueWaitMs = spans
    .filter((s) => s.kind === 'queue')
    .reduce((sum, s) => sum + s.durationMs, 0);

  let summaryLine: string;
  if (outcome === 'succeeded') {
    if (totalQueueWaitMs > 0) {
      summaryLine = `Succeeded in ${totalDurationMs} ms; ${Math.round(totalQueueWaitMs)} ms spent waiting in queue`;
    } else {
      summaryLine = `Succeeded in ${totalDurationMs} ms with zero queue delay`;
    }
  } else if (outcome === 'rejected') {
    summaryLine = `Rejected after ${totalDurationMs} ms (${failureReason ?? 'queue overflow'})`;
  } else if (outcome === 'timed-out') {
    summaryLine = `Timed out after ${totalDurationMs} ms (${failureReason ?? 'timeout'})`;
  } else if (outcome === 'failed') {
    summaryLine = `Failed after ${totalDurationMs} ms (${failureReason ?? 'error'})`;
  } else {
    summaryLine = `In-flight for ${totalDurationMs} ms...`;
  }

  return {
    requestId,
    kind,
    startTimeMs,
    endTimeMs,
    totalDurationMs,
    statusCode,
    outcome,
    summaryLine,
    failureReason,
    spans,
    decisions,
    path,
    isSampled,
  };
}
