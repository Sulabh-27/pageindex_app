"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react";
import { type DocumentNode } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DocumentStructureViewerProps {
  structure: DocumentNode[];
}

export function DocumentStructureViewer({ structure }: DocumentStructureViewerProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Document Structure Viewer</CardTitle>
        <CardDescription>Expandable hierarchy view of indexed sections and subsections</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          {structure.length ? (
            structure.map((node) => <TreeItem key={node.id} node={node} depth={0} />)
          ) : (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">No structure available yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TreeItem({ node, depth }: { node: DocumentNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = Boolean(node.nodes?.length);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          )
        ) : (
          <FileCode2 className="h-4 w-4 text-zinc-500" />
        )}
        <span>{node.title}</span>
      </button>
      {open &&
        node.nodes?.map((child) => <TreeItem key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}
