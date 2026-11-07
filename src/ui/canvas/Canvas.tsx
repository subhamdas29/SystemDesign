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

  const { fitView } = useReactFlow();
  const initialFitDone = useRef(false);

  // Compute deterministic layout positions
  const layout = useMemo(() => computeLayout(graph), [graph]);

  // Convert graph config nodes into React Flow nodes
  const flowNodes: Node[] = useMemo(() => {
    return rawNodes.map((node) => {
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
  }, [rawNodes, layout]);

  // Convert graph config edges into React Flow edges
  const flowEdges: Edge[] = useMemo(() => {
    return rawEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'custom',
      data: {
        isLookup: edge.isLookup,
        latency: edge.latency,
        source: edge.source,
        target: edge.target,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#d4d4d4',
        width: 16,
        height: 16,
      },
    }));
  }, [rawEdges]);

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
        minZoom={0.5}
        maxZoom={1.8}
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
