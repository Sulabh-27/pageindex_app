"use client";

import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, Milestone } from "lucide-react";
import { type RetrievalTrace } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface RetrievalTimelineProps {
  trace: RetrievalTrace | null;
}

export function RetrievalTimeline({ trace }: RetrievalTimelineProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Workflow Timeline</CardTitle>
        <CardDescription>
          Query received → tree navigation → node selection → context extraction → answer
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {(trace?.steps ?? []).map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.04 }}
              className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="mt-0.5">
                {step.selected ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">{step.title}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{step.description}</div>
                <div className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  <Milestone className="h-3 w-3" />
                  {step.node}
                </div>
              </div>
            </motion.div>
          ))}
          {!trace && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Timeline appears after first query.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
