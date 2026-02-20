"use client";

import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { type DocumentNode, type RetrievalTrace } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type NodeStatus = "unvisited" | "evaluating" | "selected" | "rejected";

function flattenTree(
  tree: DocumentNode[],
  parentId: string | null = null,
  depth = 0,
  accNodes: Node[] = [],
  accEdges: Edge[] = [],
  yOffset = { value: 0 }
) {
  tree.forEach((item, index) => {
    const nodeId = item.id || `${parentId ?? "root"}-${index}`;
    const y = yOffset.value * 90 + 40;
    yOffset.value += 1;

    accNodes.push({
      id: nodeId,
      position: { x: depth * 280 + 30, y },
      data: { label: item.title, status: "unvisited" as NodeStatus },
      style: {
        borderRadius: 10,
        border: "1px solid #334155",
        padding: 8,
        width: 240,
        fontSize: 12,
        background: "#1f2937",
        color: "#e5e7eb",
      },
    });

    if (parentId) {
      accEdges.push({
        id: `edge-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: false,
      });
    }

    if (item.nodes?.length) {
      flattenTree(item.nodes, nodeId, depth + 1, accNodes, accEdges, yOffset);
    }
  });

  return { nodes: accNodes, edges: accEdges };
}

const STATUS_COLORS: Record<NodeStatus, string> = {
  unvisited: "#1e3a8a",
  evaluating: "#f59e0b",
  selected: "#16a34a",
  rejected: "#dc2626",
};

interface TreeVisualizationProps {
  structure: DocumentNode[];
  trace: RetrievalTrace | null;
}

export function TreeVisualization({ structure, trace }: TreeVisualizationProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    setActiveStep(0);
    if (!trace?.steps.length) {
      return;
    }

    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= trace.steps.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [trace]);

  const { nodes, edges } = useMemo(() => {
    const seed = structure.length
      ? flattenTree(structure)
      : flattenTree([
          {
            id: "fallback-root",
            title: "Root",
            nodes: [
              { id: "fallback-1", title: "Chapter 1" },
              { id: "fallback-2", title: "Chapter 2" },
            ],
          },
        ]);

    const steps = trace?.steps ?? [];
    const progressed = steps.slice(0, activeStep);

    const nextNodes = seed.nodes.map((node) => {
      let status: NodeStatus = "unvisited";
      const matched = progressed.find((step) =>
        String(node.data?.label).toLowerCase().includes(step.node.toLowerCase())
      );

      if (matched) {
        status = matched.selected ? "selected" : "rejected";
      }

      if (progressed.length && progressed[progressed.length - 1]?.node) {
        const current = progressed[progressed.length - 1];
        if (
          current &&
          String(node.data?.label).toLowerCase().includes(current.node.toLowerCase()) &&
          current.state === "evaluating"
        ) {
          status = "evaluating";
        }
      }

      return {
        ...node,
        style: {
          ...(node.style ?? {}),
          background: STATUS_COLORS[status],
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff",
        },
      };
    });

    return { nodes: nextNodes, edges: seed.edges };
  }, [structure, trace, activeStep]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>PageIndex Tree Traversal</CardTitle>
        <CardDescription>
          Blue: unvisited, Yellow: evaluating, Green: selected, Red: rejected
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
