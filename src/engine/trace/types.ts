/**
 * Type definitions for Request Tracing and Waterfall Spans.
 * Pure serializable structures ready for worker boundaries.
 */

import { ComponentType } from '../../types';

export type SpanKind = 'network' | 'queue' | 'processing' | 'database';
export type SpanStatus = 'succeeded' | 'failed' | 'rejected' | 'timed-out' | 'active';

export interface TraceSpan {
  id: string;
  nodeId: string;
  nodeLabel: string;
  componentType: ComponentType;
  kind: SpanKind;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  status: SpanStatus;
  details?: string;
}

export interface TraceDecision {
  id: string;
  timestampMs: number;
  nodeId: string;
  componentType: ComponentType;
  summary: string;
  type: 'routing' | 'cache' | 'pool' | 'overflow' | 'timeout';
}

export interface RequestTrace {
  requestId: string;
  kind: 'read' | 'write';
  startTimeMs: number;
  endTimeMs: number;
  totalDurationMs: number;
  statusCode: number;
  outcome: 'succeeded' | 'failed' | 'rejected' | 'timed-out' | 'in-flight';
  summaryLine: string;
  failureReason?: string;
  spans: TraceSpan[];
  decisions: TraceDecision[];
  path: string[];
  isSampled?: boolean;
}
