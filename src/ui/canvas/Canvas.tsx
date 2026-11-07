import React, { useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
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
  const setDraggingSwapNodeId = useUiStore((s) => s.setDraggingSwapNodeId);
  const draggingSwapNodeId = useUiStore(selectDraggingSwapNodeId);

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
      data: { isLookup: edge.isLookup },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#d4d4d4',
        width: 16,
        height: 16,
      },
    }));
  }, [rawEdges]);

  // Fit view on load and whenever graph structure changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.25, duration: initialFitDone.current ? 400 : 0 });
      initialFitDone.current = true;
    }, 50);
    return () => clearTimeout(timer);
  }, [graph.version, fitView]);

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
        onPaneClick={() => selectNode(null)}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        minZoom={0.4}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#26262b" gap={24} size={1.5} />
        <AnimationCanvas />
        <Controls
          showInteractive={false}
          className="!bg-[#111113] !border !border-[#3f3f46] !rounded-lg overflow-hidden !shadow-lg [&>button]:!bg-[#111113] [&>button]:!border-b [&>button]:!border-[#27272a] [&>button]:!fill-[#d4d4d4] hover:[&>button]:!bg-[#18181b]"
        />
      </ReactFlow>
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
