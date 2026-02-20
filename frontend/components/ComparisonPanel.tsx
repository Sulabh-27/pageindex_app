"use client";

import { type RagComparison } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/utils";

interface ComparisonPanelProps {
  comparison: RagComparison | null;
}

export function ComparisonPanel({ comparison }: ComparisonPanelProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>RAG vs PageIndex</CardTitle>
        <CardDescription>Visual comparison of retrieval quality and context efficiency</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="text-sm font-semibold">Traditional RAG</div>
          <div className="space-y-2">
            {comparison?.rag.chunks.map((chunk) => (
              <div
                key={chunk.id}
                className={`rounded-md border p-2 text-xs ${
                  chunk.isNoise
                    ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"
                    : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/30"
                }`}
              >
                <div className="font-medium">{chunk.title}</div>
                <div className="text-zinc-600 dark:text-zinc-300">
                  score: {chunk.score.toFixed(2)} • {chunk.tokens} tokens
                </div>
              </div>
            ))}
            {!comparison && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Run a query to compare retrieval behavior.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="text-sm font-semibold">PageIndex</div>
          <div className="space-y-2">
            {(comparison?.pageIndex.selectedPath ?? []).map((node, index) => (
              <div
                key={`${node}-${index}`}
                className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/30"
              >
                {node}
              </div>
            ))}
            {!comparison && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Selected traversal path will appear here.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 grid gap-3 sm:grid-cols-4">
          <Metric
            title="Tokens"
            left={comparison?.rag.tokens ?? 0}
            right={comparison?.pageIndex.tokens ?? 0}
          />
          <Metric
            title="Latency"
            left={comparison?.rag.latency ?? 0}
            right={comparison?.pageIndex.latency ?? 0}
            suffix="ms"
          />
          <Metric
            title="Accuracy"
            left={comparison ? Number(formatPercent(comparison.rag.accuracy).replace("%", "")) : 0}
            right={
              comparison ? Number(formatPercent(comparison.pageIndex.accuracy).replace("%", "")) : 0
            }
            suffix="%"
          />
          <Metric
            title="Context Size"
            left={comparison?.rag.contextSize ?? 0}
            right={comparison?.pageIndex.contextSize ?? 0}
            suffix=" chars"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  title,
  left,
  right,
  suffix = "",
}: {
  title: string;
  left: number;
  right: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className="flex items-center justify-between text-xs">
        <Badge variant="danger">RAG: {Math.round(left)}{suffix}</Badge>
        <Badge variant="success">PageIndex: {Math.round(right)}{suffix}</Badge>
      </div>
    </div>
  );
}
