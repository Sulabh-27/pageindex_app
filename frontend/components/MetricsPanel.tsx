"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type MetricPoint, type QueryMetrics } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMs } from "@/lib/utils";

interface MetricsPanelProps {
  metrics: QueryMetrics | null;
  history: MetricPoint[];
}

export function MetricsPanel({ metrics, history }: MetricsPanelProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Retrieval Metrics Dashboard</CardTitle>
        <CardDescription>Real-time latency, token, traversal, and context metrics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <MetricBadge label="Latency" value={metrics ? formatMs(metrics.latencyMs) : "-"} />
          <MetricBadge label="Tokens" value={metrics ? String(metrics.tokensUsed) : "-"} />
          <MetricBadge label="Nodes Traversed" value={metrics ? String(metrics.nodesTraversed) : "-"} />
          <MetricBadge label="Context Size" value={metrics ? String(metrics.contextSize) : "-"} />
          <MetricBadge label="Steps" value={metrics ? String(metrics.stepsCount) : "-"} />
        </div>

        <div className="h-52 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="query" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="latencyMs" stroke="#2563eb" fill="#93c5fd" />
              <Area type="monotone" dataKey="tokens" stroke="#16a34a" fill="#86efac" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <Badge variant="neutral">{value}</Badge>
    </div>
  );
}
