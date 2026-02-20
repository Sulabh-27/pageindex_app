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
import { type MetricPoint, type ObservabilityMetrics } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ObservabilityDashboardProps {
  metrics: ObservabilityMetrics | null;
  history: MetricPoint[];
}

export function ObservabilityDashboard({ metrics, history }: ObservabilityDashboardProps) {
  const metricCards = [
    { label: "Cache Hit Rate", value: `${((metrics?.cache_hit_rate ?? 0) * 100).toFixed(1)}%` },
    { label: "Nodes Evaluated", value: String(metrics?.nodes_evaluated ?? 0) },
    { label: "Disk Loads", value: String(metrics?.nodes_loaded_from_disk ?? 0) },
    { label: "Max Tree Depth", value: String(metrics?.max_tree_depth_seen ?? 0) },
    { label: "Avg Latency", value: `${Math.round(metrics?.avg_retrieval_latency_ms ?? 0)} ms` },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Observability Dashboard</CardTitle>
        <CardDescription>Live retrieval and cache telemetry</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-5">
          {metricCards.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{item.label}</div>
              <div className="text-sm font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="h-52 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="query" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="latencyMs" stroke="#2563eb" fill="#93c5fd" />
              <Area type="monotone" dataKey="tokens" stroke="#7c3aed" fill="#c4b5fd" />
              <Area type="monotone" dataKey="contextSize" stroke="#16a34a" fill="#86efac" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
