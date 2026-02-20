"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { type TraversalEvent } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_COLORS = {
  idle: "#2563eb",
  evaluating: "#f59e0b",
  selected: "#16a34a",
  cache: "#7c3aed",
  disk: "#ea580c",
};

interface TreeTraversalVisualizerProps {
  events: TraversalEvent[];
}

export function TreeTraversalVisualizer({ events }: TreeTraversalVisualizerProps) {
  const { nodes, edges } = useMemo(() => {
    const latestByNode = new Map<string, TraversalEvent>();
    for (const event of events) {
      if (event.node_id) {
        latestByNode.set(event.node_id, event);
      }
    }

    const items = Array.from(latestByNode.entries());
    const builtNodes: Node[] = [];
    const builtEdges: Edge[] = [];

    items.forEach(([nodeId, event], index) => {
      let bg = STATUS_COLORS.idle;
      if (event.event === "node_selected") {
        bg = STATUS_COLORS.selected;
      } else if (event.event === "node_evaluated") {
        if (event.source === "cache") bg = STATUS_COLORS.cache;
        else if (event.source === "disk") bg = STATUS_COLORS.disk;
        else bg = STATUS_COLORS.evaluating;
      }

      builtNodes.push({
        id: nodeId,
        position: { x: (event.level ?? 0) * 260 + 20, y: index * 85 + 20 },
        data: { label: event.title || nodeId },
        style: {
          background: bg,
          color: "#fff",
          borderRadius: 10,
          padding: 8,
          width: 230,
          border: "1px solid rgba(255,255,255,0.2)",
          fontSize: 12,
        },
      });
    });

    for (let i = 0; i < builtNodes.length - 1; i += 1) {
      builtEdges.push({
        id: `edge-${builtNodes[i].id}-${builtNodes[i + 1].id}`,
        source: builtNodes[i].id,
        target: builtNodes[i + 1].id,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }

    return { nodes: builtNodes, edges: builtEdges };
  }, [events]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Real-time Traversal Visualizer</CardTitle>
        <CardDescription>
          Blue=idle Yellow=evaluating Green=selected Purple=cache Orange=disk
        </CardDescription>
      </CardHeader>
      <CardContent className="h-[430px]">
        <ReactFlow fitView nodes={nodes} edges={edges} proOptions={{ hideAttribution: true }}>
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </CardContent>
    </Card>
  );
}
