"use client";

import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { type ObservabilityMetrics } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CachePerformancePanelProps {
  metrics: ObservabilityMetrics | null;
}

export function CachePerformancePanel({ metrics }: CachePerformancePanelProps) {
  const hits = metrics?.cache_hits ?? 0;
  const misses = metrics?.cache_misses ?? 0;
  const data = [
    { name: "Cache Hits", value: hits, color: "#7c3aed" },
    { name: "Cache Misses", value: misses, color: "#ea580c" },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Cache Performance</CardTitle>
        <CardDescription>Hit ratio and disk load pressure</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Hit rate: {((metrics?.cache_hit_rate ?? 0) * 100).toFixed(1)}% • Disk loads:{" "}
          {metrics?.nodes_loaded_from_disk ?? 0}
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" outerRadius={80}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
