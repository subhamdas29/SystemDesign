import React, { useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';
import { HealthIndicator } from './HealthIndicator';
import { AnimationCanvas } from '../animation/AnimationCanvas';
import { useGraphStore, selectGraph, selectNodes, selectEdges } from '@store';
import { useUiStore, selectDraggingSwapNodeId, selectIsFocusMode } from '@store';
import {
  useSimulationStore,
  selectHighlightedPath,
  selectVisualizationDisplayMode,
  selectSimPlayStatus,
  selectSimRps,
} from '@store';
import { useAttackStore } from '@store';
import { computeLayout, COMPONENT_RULES, canSwap } from '@builder';
import { ComponentType } from '@types';

const nodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const CanvasInner: React.FC = () => {
  const graph = useGraphStore(selectGraph);
  const rawNodes = useGraphStore(selectNodes);
  const rawEdges = useGraphStore(selectEdges);

  const selectNode = useUiStore((s) => s.selectNode);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const setDraggingSwapNodeId = useUiStore((s) => s.setDraggingSwapNodeId);
  const draggingSwapNodeId = useUiStore(selectDraggingSwapNodeId);
  const isFocusMode = useUiStore(selectIsFocusMode);
  const isInventoryOpen = useUiStore((s) => s.isInventoryOpen);
  const isInspectorOpen = useUiStore((s) => s.isInspectorOpen);
  const highlightedPath = useSimulationStore(selectHighlightedPath);
  const displayMode = useSimulationStore(selectVisualizationDisplayMode);
  const status = useSimulationStore(selectSimPlayStatus);
  const simRps = useSimulationStore(selectSimRps);
  const isAttackerMode = useAttackStore((s) => s.isAttackerMode);

  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const initialFitDone = useRef(false);

  // Compute deterministic layout positions (spread in 2D)
  const layout = useMemo(() => computeLayout(graph), [graph]);

  // Convert graph config nodes into React Flow nodes
  const flowNodes: Node[] = useMemo(() => {
    const regularNodes: Node[] = rawNodes.map((node) => {
      const pos = layout[node.id] ?? { x: 0, y: 0 };
      const rule = COMPONENT_RULES[node.type];
      const isSwappable = Boolean(rule?.swapGroup);

      return {
        id: node.id,
        type: 'custom',
        position: pos,
        data: { ...node } as unknown as Record<string, unknown>,
        draggable: isSwappable,
        selectable: true,
      };
    });

    if (isAttackerMode) {
      // Find client node position to position Threat Sources node to the left / tier
      const clientNode = rawNodes.find((n) => n.type === 'client');
      const clientPos = clientNode ? layout[clientNode.id] ?? { x: 0, y: 0 } : { x: 0, y: 0 };
      regularNodes.push({
        id: 'threat-source',
        type: 'custom',
        position: { x: clientPos.x - 220, y: clientPos.y },
        data: {
          id: 'threat-source',
          type: 'threat-source',
          label: 'Threat Sources',
          config: {},
          isVirtual: true,
        } as unknown as Record<string, unknown>,
        draggable: false,
        selectable: true,
      });
    }

    return regularNodes;
  }, [rawNodes, layout, isAttackerMode]);

  // Convert graph config edges into React Flow edges (dotted line + open arrowhead)
  const flowEdges: Edge[] = useMemo(() => {
    const regularEdges: Edge[] = rawEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'custom',
      data: {
        isLookup: edge.isLookup,
        latency: edge.latency,
        kind: edge.kind,
        source: edge.source,
        target: edge.target,
      },
      markerEnd: {
        type: MarkerType.Arrow,
        color: '#FFFFFF',
        width: 12,
        height: 12,
      },
    }));

    if (isAttackerMode) {
      // Direct edge from Threat Sources to the client or entry point
      const clientEdge = rawEdges.find((e) => e.source === 'client' && !e.isLookup);
      const targetId =
        clientEdge?.target ||
        rawNodes.find(
          (n) =>
            n.type === 'router' ||
            n.type === 'load-balancer' ||
            n.type === 'api-gateway' ||
            n.type === 'cdn'
        )?.id;
      if (targetId) {
        regularEdges.push({
          id: 'edge-threat-source-entry',
          source: 'threat-source',
          target: targetId,
          type: 'custom',
          data: {
            source: 'threat-source',
            target: targetId,
            isThreatEdge: true,
          },
          markerEnd: {
            type: MarkerType.Arrow,
            color: '#D9541E',
            width: 12,
            height: 12,
          },
        });
      }
    }

    return regularEdges;
  }, [rawEdges, isAttackerMode, rawNodes]);

  // Fit view on load, graph changes, and resize
  useEffect(() => {
    const handleFit = () => {
      fitView({ padding: 0.2, minZoom: 0.7, maxZoom: 1.2, duration: initialFitDone.current ? 300 : 0 });
      initialFitDone.current = true;
    };

    window.addEventListener('resize', handleFit);
    const timer = setTimeout(handleFit, 60);

    return () => {
      window.removeEventListener('resize', handleFit);
      clearTimeout(timer);
    };
  }, [graph.version, fitView]);

  // Re-fit graph (animated, 200 ms ease-out) when Inventory, Inspector, or Attacker mode changes (Item 9b, 17)
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, minZoom: 0.6, maxZoom: 1.2, duration: 200 });
    }, 60);
    return () => clearTimeout(timer);
  }, [isInventoryOpen, isInspectorOpen, isAttackerMode, fitView]);

  const handleFitAll = () => {
    fitView({ padding: 0.2, minZoom: 0.7, maxZoom: 1.2, duration: 300 });
  };

  const handleFocusPath = () => {
    if (highlightedPath.length > 0) {
      const pathNodes = flowNodes.filter((n) => highlightedPath.includes(n.id));
      if (pathNodes.length > 0) {
        fitView({ nodes: pathNodes, padding: 0.25, duration: 300 });
        return;
      }
    }
    const mainPathNodes = flowNodes.filter((n) => {
      const type = (n.data as { type?: string })?.type;
      return type === 'client' || type === 'load-balancer' || type === 'app-server' || type === 'database';
    });
    fitView({ nodes: mainPathNodes.length > 0 ? mainPathNodes : flowNodes, padding: 0.25, duration: 300 });
  };

  // Drag Swap Handlers
  const handleNodeDragStart = (_event: MouseEvent | TouchEvent, node: Node) => {
    const nodeType = (node.data as { type?: ComponentType })?.type;
    if (nodeType) {
      const rule = COMPONENT_RULES[nodeType];
      if (rule?.swapGroup) {
        setDraggingSwapNodeId(node.id);
      }
    }
  };

  const handleNodeDragStop = (_event: MouseEvent | TouchEvent, node: Node) => {
    if (!draggingSwapNodeId) return;

    const sourceNode = rawNodes.find((n) => n.id === draggingSwapNodeId);
    if (!sourceNode) {
      setDraggingSwapNodeId(null);
      return;
    }

    const targetPos = node.position;
    for (const otherNode of rawNodes) {
      if (otherNode.id === sourceNode.id) continue;
      const otherPos = layout[otherNode.id];
      if (!otherPos) continue;

      const dist = Math.hypot(targetPos.x - otherPos.x, targetPos.y - otherPos.y);
      if (dist < 100) {
        const swapResult = canSwap(graph, sourceNode.id, otherNode.type);
        if (swapResult.allowed) {
          useGraphStore.getState().swapNode(sourceNode.id, otherNode.type);
          break;
        }
      }
    }
    setDraggingSwapNodeId(null);
  };

  // Check if graph exceeds viewport to decide whether minimap should show (A6)
  const shouldShowMiniMap = useMemo(() => {
    if (isFocusMode) return false;
    // Hide unless architecture has expanded beyond standard single-screen density
    return rawNodes.length >= 8;
  }, [isFocusMode, rawNodes.length]);

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: '#0B0B0D' }}>
      {/* Free-floating Health Indicator (Section 5 / A5) - Hidden in Eye mode */}
      {!isFocusMode && <HealthIndicator />}

      {/* Aggregate Flow readout (Item 20: unboxed typography, no border, no background, orange dot only) */}
      {!isFocusMode && displayMode === 'aggregate' && (status === 'running' || status === 'paused') && (
        <div className="absolute top-4 left-6 z-10 font-mono text-xs text-[#F3EEE3] flex items-center gap-2 select-none">
          <span className="w-2 h-2 rounded-full bg-[#D9541E] inline-block shrink-0" />
          <span>Simulating {simRps.toLocaleString()} req/s | showing 20 sampled</span>
        </div>
      )}

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        panOnScroll={false}
        preventScrolling={true}
        minZoom={0.2}
        maxZoom={2.5}
        onPaneClick={() => {
          selectNode(null);
          selectEdge(null);
        }}
        onNodeClick={(_, node) => {
          selectNode(node.id);
          selectEdge(null);
        }}
        onEdgeClick={(_, edge) => {
          selectEdge(edge.id);
          selectNode(null);
        }}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        proOptions={{ hideAttribution: true }}
      >
        <AnimationCanvas />

        {/* MiniMap: Only rendered if graph exceeds viewport (A6) */}
        {shouldShowMiniMap && (
          <MiniMap
            nodeColor="#3F3F46"
            maskColor="rgba(11, 11, 13, 0.85)"
            className="!bg-[#15181E] !border !border-[#2A2E39] !rounded !overflow-hidden !m-3"
            style={{ width: 140, height: 85 }}
          />
        )}
      </ReactFlow>

      {/* Unified Canvas Controls Cluster: Focus Path, Fit All, Zoom +, Zoom - (A6) */}
      {!isFocusMode && (
        <div className="absolute bottom-6 left-6 z-10 flex items-center bg-[#15181E] border border-[#2A2E39] rounded shadow-md overflow-hidden font-mono text-[11px]">
          <button
            type="button"
            onClick={handleFocusPath}
            title="Focus active request path or core pipeline"
            className="px-2.5 py-1.5 text-[#F3EEE3] hover:bg-[#252932] border-r border-[#2A2E39] transition-colors cursor-pointer"
          >
            Focus Path
          </button>
          <button
            type="button"
            onClick={handleFitAll}
            title="Fit all architecture components on screen"
            className="px-2.5 py-1.5 text-[#F3EEE3] hover:bg-[#252932] border-r border-[#2A2E39] transition-colors cursor-pointer"
          >
            Fit All
          </button>
          <button
            type="button"
            onClick={() => zoomIn({ duration: 200 })}
            title="Zoom In"
            aria-label="Zoom In"
            className="w-7 h-7 flex items-center justify-center text-[#F3EEE3] hover:bg-[#252932] border-r border-[#2A2E39] transition-colors cursor-pointer text-sm"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomOut({ duration: 200 })}
            title="Zoom Out"
            aria-label="Zoom Out"
            className="w-7 h-7 flex items-center justify-center text-[#F3EEE3] hover:bg-[#252932] transition-colors cursor-pointer text-sm"
          >
            −
          </button>
        </div>
      )}
    </div>
  );
};

export const Canvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
};

export default Canvas;
