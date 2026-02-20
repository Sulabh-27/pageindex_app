"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Database } from "lucide-react";
import { fetchIndexNode } from "@/lib/api";
import { useAppStore } from "@/store/useStore";
import { type LazyIndexNode } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface IndexStructureExplorerProps {
  rootId?: string;
}

export function IndexStructureExplorer({ rootId }: IndexStructureExplorerProps) {
  const { lazyTreeNodes, upsertLazyNode } = useAppStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!rootId || lazyTreeNodes[rootId]) {
      return;
    }
    void fetchIndexNode(rootId)
      .then((node) => upsertLazyNode(node))
      .catch(() => {});
  }, [rootId, lazyTreeNodes, upsertLazyNode]);

  const loadChildren = async (node: LazyIndexNode) => {
    for (const childId of node.children_ids ?? []) {
      if (!lazyTreeNodes[childId]) {
        try {
          const child = await fetchIndexNode(childId);
          upsertLazyNode(child);
        } catch {
          // keep explorer resilient in partial trees
        }
      }
    }
  };

  const toggleNode = async (node: LazyIndexNode) => {
    const next = !expanded[node.id];
    setExpanded((prev) => ({ ...prev, [node.id]: next }));
    if (next) {
      await loadChildren(node);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Index Structure Explorer</CardTitle>
        <CardDescription>Lazy-loaded hierarchical node explorer</CardDescription>
      </CardHeader>
      <CardContent>
        {!rootId ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">No hierarchical root loaded.</div>
        ) : lazyTreeNodes[rootId] ? (
          <NodeItem
            node={lazyTreeNodes[rootId]}
            depth={0}
            expanded={expanded}
            nodes={lazyTreeNodes}
            onToggle={toggleNode}
          />
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading root node...</div>
        )}
      </CardContent>
    </Card>
  );
}

function NodeItem({
  node,
  depth,
  expanded,
  nodes,
  onToggle,
}: {
  node: LazyIndexNode;
  depth: number;
  expanded: Record<string, boolean>;
  nodes: Record<string, LazyIndexNode>;
  onToggle: (node: LazyIndexNode) => Promise<void>;
}) {
  const hasChildren = (node.children_ids?.length ?? 0) > 0;
  const isOpen = Boolean(expanded[node.id]);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => {
          void onToggle(node);
        }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {hasChildren ? (
          isOpen ? (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          )
        ) : (
          <Database className="h-4 w-4 text-zinc-500" />
        )}
        <span>{node.title}</span>
      </button>
      {isOpen &&
        node.children_ids.map((childId) => {
          const child = nodes[childId];
          if (!child) {
            return (
              <div
                key={childId}
                className="px-2 py-1 text-xs text-zinc-500"
                style={{ paddingLeft: (depth + 1) * 16 + 8 }}
              >
                Loading {childId}...
              </div>
            );
          }
          return (
            <NodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              nodes={nodes}
              onToggle={onToggle}
            />
          );
        })}
    </div>
  );
}
