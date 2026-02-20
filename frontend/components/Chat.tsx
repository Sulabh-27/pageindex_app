"use client";

import { useMemo, useState } from "react";
import { Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { type ChatMessage } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface ChatProps {
  messages: ChatMessage[];
  loading: boolean;
  onSubmit: (question: string) => Promise<void>;
}

export function Chat({ messages, loading, onSubmit }: ChatProps) {
  const [query, setQuery] = useState("");
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages]
  );

  const handleSend = async () => {
    const value = query.trim();
    if (!value || loading) {
      return;
    }
    setQuery("");
    await onSubmit(value);
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <CardDescription>Ask document-aware questions powered by PageIndex</CardDescription>
      </CardHeader>
      <CardContent className="flex h-[calc(100%-5rem)] flex-col gap-4">
        <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          {sortedMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              Ask your first question to start retrieval visualization.
            </div>
          ) : (
            sortedMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "ml-auto bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                <div className="mb-1 flex items-center gap-1 text-[11px] opacity-80">
                  {msg.role === "assistant" ? (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Assistant
                    </>
                  ) : (
                    "You"
                  )}
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </motion.div>
            ))
          )}
          {loading && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Retrieving answer...
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            placeholder="Ask a question about your indexed documents..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={loading || !query.trim()}>
              <SendHorizontal className="mr-2 h-4 w-4" />
              Ask
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
