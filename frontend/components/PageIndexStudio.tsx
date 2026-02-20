"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { CachePerformancePanel } from "@/components/CachePerformancePanel";
import { Chat } from "@/components/Chat";
import { ComparisonPanel } from "@/components/ComparisonPanel";
import { DocumentStructureViewer } from "@/components/DocumentStructureViewer";
import { IndexStructureExplorer } from "@/components/IndexStructureExplorer";
import { MetricsPanel } from "@/components/MetricsPanel";
import { ObservabilityDashboard } from "@/components/ObservabilityDashboard";
import { RetrievalTimeline } from "@/components/RetrievalTimeline";
import { SidebarDocuments } from "@/components/SidebarDocuments";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TreeTraversalVisualizer } from "@/components/TreeTraversalVisualizer";
import { TreeVisualization } from "@/components/TreeVisualization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import {
  fetchComparison,
  fetchHierarchicalRoot,
  fetchIndexNode,
  fetchIndexStructure,
  fetchJobStatus,
  fetchMetrics,
  getTraversalWebSocketUrl,
  fetchRetrievalTrace,
  queryQuestion,
  uploadDocument,
} from "@/lib/api";
import { useAppStore } from "@/store/useStore";
import { type QueryMetrics } from "@/types";

type RightPanelTab =
  | "tree"
  | "timeline"
  | "metrics"
  | "comparison"
  | "structure"
  | "realtime"
  | "lazy";

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function PageIndexStudio() {
  const {
    documents,
    selectedDocument,
    indexReady,
    isIndexLoading,
    isQueryLoading,
    structure,
    messages,
    retrievalTrace,
    comparison,
    metrics,
    metricHistory,
    websocketEvents,
    observabilityMetrics,
    setDocuments,
    setIndexLoading,
    setIndexReady,
    setStructure,
    addMessage,
    setQueryLoading,
    setRetrievalData,
    setObservabilityMetrics,
    pushWebsocketEvent,
    clearWebsocketEvents,
    clearChat,
    upsertLazyNode,
    selectDocument,
  } = useAppStore();

  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RightPanelTab>("tree");
  const [rootId, setRootId] = useState<string | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIndexLoading(true);
      try {
        const [loadedStructure, hierarchicalRoot] = await Promise.all([
          fetchIndexStructure(),
          fetchHierarchicalRoot(),
        ]);
        if (!mounted) return;
        setStructure(loadedStructure);
        setRootId(hierarchicalRoot?.root_id);
        const docName = "Active Document";
        setDocuments([docName]);
        selectDocument(docName);
        setIndexReady(true);
        if (hierarchicalRoot?.root_id) {
          try {
            const rootNode = await fetchIndexNode(hierarchicalRoot.root_id);
            upsertLazyNode(rootNode);
          } catch {
            // optional lazy explorer preload
          }
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load index structure");
      } finally {
        if (mounted) setIndexLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [
    selectDocument,
    setDocuments,
    setIndexLoading,
    setIndexReady,
    setStructure,
    upsertLazyNode,
  ]);

  useEffect(() => {
    const ws = new WebSocket(getTraversalWebSocketUrl());
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        pushWebsocketEvent(payload);
      } catch {
        // ignore malformed events
      }
    };
    ws.onerror = () => {
      // keep UI resilient if WS is unavailable
    };
    return () => {
      ws.close();
    };
  }, [pushWebsocketEvent]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const snapshot = await fetchMetrics();
        if (active) setObservabilityMetrics(snapshot);
      } catch {
        if (active) setObservabilityMetrics(null);
      }
    };
    void run();
    const timer = setInterval(() => {
      void run();
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [setObservabilityMetrics]);

  const onUploadClick = () => fileRef.current?.click();

  const onUploadFile: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    clearWebsocketEvents();
    setIndexLoading(true);
    try {
      const result = await uploadDocument(file);
      if (!result.success) {
        throw new Error(result.message || "Upload failed");
      }
      const [loadedStructure, hierarchicalRoot] = await Promise.all([
        fetchIndexStructure(),
        fetchHierarchicalRoot(),
      ]);
      setStructure(loadedStructure);
      setRootId(hierarchicalRoot?.root_id);
      selectDocument(result.filename);
      setIndexReady(true);
      addMessage({
        id: createId(),
        role: "assistant",
        content: result.message || `Document "${result.filename}" uploaded successfully.`,
        createdAt: Date.now(),
      });
      const deduped = [result.filename, ...documents.filter((doc) => doc !== result.filename)];
      setDocuments(deduped);

      if (result.job_id) {
        const maxPoll = 60;
        for (let i = 0; i < maxPoll; i += 1) {
          const status = await fetchJobStatus(result.job_id);
          if (status.status === "success") {
            const [refreshed, refreshedRoot] = await Promise.all([
              fetchIndexStructure(),
              fetchHierarchicalRoot(),
            ]);
            setStructure(refreshed);
            setRootId(refreshedRoot?.root_id);
            addMessage({
              id: createId(),
              role: "assistant",
              content: `Index rebuild completed for ${status.filename}.`,
              createdAt: Date.now(),
            });
            break;
          }
          if (status.status === "failed") {
            setError(status.error || "Background rebuild failed");
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIndexLoading(false);
      event.target.value = "";
    }
  };

  const onSubmitQuestion = async (question: string) => {
    setError(null);
    clearWebsocketEvents();
    setQueryLoading(true);
    addMessage({
      id: createId(),
      role: "user",
      content: question,
      createdAt: Date.now(),
    });

    try {
      const [queryResult, trace, comparisonResult] = await Promise.all([
        queryQuestion(question),
        fetchRetrievalTrace(question),
        fetchComparison(question),
      ]);

      const nextMetrics: QueryMetrics = {
        latencyMs: trace.latency || queryResult.latency_ms,
        tokensUsed: trace.tokens,
        nodesTraversed: trace.nodesTraversed,
        contextSize: trace.contextSize,
        stepsCount: trace.steps.length,
      };

      setRetrievalData(trace, comparisonResult, nextMetrics);
      addMessage({
        id: createId(),
        role: "assistant",
        content: queryResult.answer,
        createdAt: Date.now(),
      });
      setTab("tree");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
      addMessage({
        id: createId(),
        role: "assistant",
        content:
          "I could not complete that query. Ensure your backend API server is running at http://localhost:8000.",
        createdAt: Date.now(),
      });
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">PageIndex Retrieval Studio</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Production-grade frontend for retrieval workflow visualization
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={indexReady ? "success" : "warning"}>
              {indexReady ? "Backend Connected" : "Backend Sync Pending"}
            </Badge>
            <Button variant="outline" onClick={clearChat}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Clear Chat
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[320px_minmax(520px,1fr)_minmax(520px,1fr)]">
        <aside className="h-[calc(100vh-6.5rem)]">
          <SidebarDocuments
            documents={documents}
            selectedDocument={selectedDocument}
            indexReady={indexReady}
            isIndexLoading={isIndexLoading}
            onSelect={selectDocument}
            onUpload={onUploadClick}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={onUploadFile}
            accept=".pdf,.txt,.md,.markdown"
          />
        </aside>

        <section className="h-[calc(100vh-6.5rem)]">
          {isIndexLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : (
            <Chat messages={messages} loading={isQueryLoading} onSubmit={onSubmitQuestion} />
          )}
        </section>

        <section className="h-[calc(100vh-6.5rem)] space-y-3 overflow-hidden">
          <Tabs
            tabs={[
              { id: "tree", label: "Tree" },
              { id: "timeline", label: "Timeline" },
              { id: "metrics", label: "Metrics" },
              { id: "comparison", label: "Comparison" },
              { id: "structure", label: "Structure" },
              { id: "realtime", label: "Realtime" },
              { id: "lazy", label: "Lazy Tree" },
            ]}
            value={tab}
            onChange={(value) => setTab(value as RightPanelTab)}
          />
          <Separator />
          {tab === "tree" && <TreeVisualization structure={structure} trace={retrievalTrace} />}
          {tab === "timeline" && <RetrievalTimeline trace={retrievalTrace} />}
          {tab === "metrics" && <MetricsPanel metrics={metrics} history={metricHistory} />}
          {tab === "comparison" && <ComparisonPanel comparison={comparison} />}
          {tab === "structure" && <DocumentStructureViewer structure={structure} />}
          {tab === "realtime" && <TreeTraversalVisualizer events={websocketEvents} />}
          {tab === "lazy" && <IndexStructureExplorer rootId={rootId} />}
        </section>
      </main>

      <div className="mx-auto mb-4 grid max-w-[1800px] grid-cols-1 gap-4 px-4 xl:grid-cols-[2fr_1fr]">
        <ObservabilityDashboard metrics={observabilityMetrics} history={metricHistory} />
        <CachePerformancePanel metrics={observabilityMetrics} />
      </div>

      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950/80 dark:text-red-200">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
