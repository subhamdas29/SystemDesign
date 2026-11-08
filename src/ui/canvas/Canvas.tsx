import React, { useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
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
import { AnimationCanvas } from '../animation/AnimationCanvas';
import { useGraphStore, selectGraph, selectNodes, selectEdges } from '@store';
import { useUiStore, selectDraggingSwapNodeId } from '@store';
import { useSimulationStore, selectHighlightedPath } from '@store';
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
  const swapNode = useGraphStore((s) => s.swapNode);

  const selectNode = useUiStore((s) => s.selectNode);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const setDraggingSwapNodeId = useUiStore((s) => s.setDraggingSwapNodeId);
  const draggingSwapNodeId = useUiStore(selectDraggingSwapNodeId);
  const highlightedPath = useSimulationStore(selectHighlightedPath);
  const isAttackerMode = useAttackStore((s) => s.isAttackerMode);

  const { fitView, getViewport } = useReactFlow();
  const initialFitDone = useRef(false);

  // Compute deterministic layout positions
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
      // Find client node position to position Threat Sources node in parallel tier
      const clientNode = rawNodes.find((n) => n.type === 'client');
      const clientPos = clientNode ? layout[clientNode.id] ?? { x: 0, y: 0 } : { x: 0, y: 0 };
      regularNodes.push({
        id: 'threat-source',
        type: 'custom',
        position: { x: clientPos.x, y: clientPos.y + 160 },
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

  // Convert graph config edges into React Flow edges
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
        type: MarkerType.ArrowClosed,
        color: edge.kind === 'async' ? '#e4e4e7' : '#d4d4d4',
        width: edge.kind === 'async' ? 18 : 16,
        height: edge.kind === 'async' ? 18 : 16,
      },
    }));

    if (isAttackerMode) {
      // Direct edge from Threat Sources to the entry point
      const clientEdge = rawEdges.find((e) => e.source === 'client' && !e.isLookup);
      const targetId =
        clientEdge?.target ||
        rawNodes.find(
          (n) =>
            n.type === 'router' ||
            n.type === 'load-balancer' ||
            n.type === 'api-gateway' ||
            n.type === 'app-server'
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
          style: { stroke: '#f59e0b', strokeDasharray: '5,5' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#f59e0b',
            width: 16,
            height: 16,
          },
        });
      }
    }

    return regularEdges;
  }, [rawEdges, isAttackerMode, rawNodes]);

  // Fit view on load, whenever graph structure changes, and on window resize
  useEffect(() => {
    const handleFit = () => {
      fitView({ padding: 0.22, minZoom: 0.7, maxZoom: 1.2, duration: initialFitDone.current ? 300 : 0 });
      initialFitDone.current = true;
    };

    window.addEventListener('resize', handleFit);
    const timer = setTimeout(handleFit, 60);

    return () => {
      window.removeEventListener('resize', handleFit);
      clearTimeout(timer);
    };
  }, [graph.version, fitView]);

  const handleFitAll = () => {
    fitView({ padding: 0.22, minZoom: 0.7, maxZoom: 1.2, duration: 300 });
  };

  const handleFocusPath = () => {
    if (highlightedPath.length > 0) {
      const pathNodes = flowNodes.filter((n) => highlightedPath.includes(n.id));
      if (pathNodes.length > 0) {
        fitView({ nodes: pathNodes, padding: 0.3, duration: 300 });
        return;
      }
    }
    // Default path from client to database if no specific request tracked
    const mainPathNodes = flowNodes.filter((n) => {
      const type = (n.data as { type?: string })?.type;
      return type === 'client' || type === 'load-balancer' || type === 'app-server' || type === 'database';
    });
    fitView({ nodes: mainPathNodes.length > 0 ? mainPathNodes : flowNodes, padding: 0.25, duration: 300 });
  };

  // Handle Drag Swap
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

    // Check if dropped near any valid swap target
    const draggedPos = node.position;
    let swapped = false;

    for (const otherNode of rawNodes) {
      if (otherNode.id === node.id) continue;
      const targetPos = layout[otherNode.id];
      if (!targetPos) continue;

      // Distance check
      const dist = Math.hypot(draggedPos.x - targetPos.x, draggedPos.y - targetPos.y);
      if (dist < 120) {
        const check = canSwap(graph, node.id, otherNode.type);
        if (check.allowed) {
          swapNode(node.id, otherNode.type);
          swapped = true;
          break;
        }
      }
    }

    setDraggingSwapNodeId(null);

    // If not swapped, layout will smoothly snap it back on next render
    if (!swapped) {
      fitView({ duration: 300 });
    }
  };

  return (
    <div className="w-full h-full relative bg-[#0b0b0d]">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={true} // restricted per-node via node.draggable
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        panOnScroll={false}
        preventScrolling={true}
        minZoom={0.2}
        maxZoom={2.5}
        onPaneClick={(event) => {
          selectNode(null);
          selectEdge(null);

          // Check if user clicked an in-flight packet
          const target = event.currentTarget as HTMLElement | null;
          if (target) {
            const rect = target.getBoundingClientRect();
            const { x: vpX, y: vpY, zoom } = getViewport();
            const clickX = (event.clientX - rect.left - vpX) / zoom;
            const clickY = (event.clientY - rect.top - vpY) / zoom;

            const recentEvents = useSimulationStore.getState().recentEvents;
            const simTimeMs = useSimulationStore.getState().simTimeMs;

            for (const ev of recentEvents.slice(-100)) {
              if (!ev.targetNodeId) continue;
              const srcPos = layout[ev.nodeId];
              const tgtPos = layout[ev.targetNodeId];
              if (!srcPos || !tgtPos) continue;

              const progress = Math.min(1.0, Math.max(0.0, (simTimeMs - ev.timestamp) / 25));
              const isReturn = ev.type === 'RESPONSE_FORWARDED';
              const startPt = isReturn ? { x: srcPos.x + 100, y: srcPos.y + 40 } : { x: srcPos.x + 200, y: srcPos.y + 40 };
              const endPt = isReturn ? { x: tgtPos.x + 200, y: tgtPos.y + 40 } : { x: tgtPos.x, y: tgtPos.y + 40 };
              const pt = {
                x: startPt.x + (endPt.x - startPt.x) * progress,
                y: startPt.y + (endPt.y - startPt.y) * progress,
              };

              const dist = Math.hypot(clickX - pt.x, clickY - pt.y);
              if (dist < 18) {
                useSimulationStore.getState().trackRequest(ev.requestId, graph);
                break;
              }
            }
          }
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
        <Background color="#26262b" gap={24} size={1.5} />
        <AnimationCanvas />
        <Controls
          showInteractive={false}
          className="!bg-[#111113] !border !border-[#3f3f46] !rounded-lg overflow-hidden !shadow-lg [&>button]:!bg-[#111113] [&>button]:!border-b [&>button]:!border-[#27272a] [&>button]:!fill-[#d4d4d4] hover:[&>button]:!bg-[#18181b]"
        />
        <MiniMap
          nodeColor="#52525b"
          maskColor="rgba(0, 0, 0, 0.75)"
          className="!bg-[#111113] !border !border-[#3f3f46] !rounded-lg overflow-hidden !shadow-xl !m-3"
          style={{ width: 150, height: 95 }}
        />
      </ReactFlow>

      {/* Focus Path & Fit All Zoom Controls */}
      <div className="absolute bottom-20 left-3 z-10 flex flex-col gap-1.5 font-mono">
        <button
          type="button"
          onClick={handleFocusPath}
          title="Zoom to active request path or core pipeline"
          className="px-2.5 py-1.5 bg-[#111113]/90 hover:bg-[#18181b] text-white hover:text-white border border-[#3f3f46] hover:border-white rounded-md text-[11px] shadow-md flex items-center gap-1.5 transition-all backdrop-blur-sm"
        >
          <span>🎯</span>
          <span>Focus Path</span>
        </button>
        <button
          type="button"
          onClick={handleFitAll}
          title="Fit all architecture components on screen"
          className="px-2.5 py-1.5 bg-[#111113]/90 hover:bg-[#18181b] text-[var(--color-text-secondary)] hover:text-white border border-[#3f3f46] hover:border-white rounded-md text-[11px] shadow-md flex items-center gap-1.5 transition-all backdrop-blur-sm"
        >
          <span>⤢</span>
          <span>Fit All</span>
        </button>
      </div>
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
