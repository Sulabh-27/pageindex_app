"use client";

import { create } from "zustand";
import {
  type ChatMessage,
  type DocumentNode,
  type LazyIndexNode,
  type MetricPoint,
  type ObservabilityMetrics,
  type QueryMetrics,
  type RagComparison,
  type RetrievalTrace,
  type TraversalEvent,
} from "@/types";

interface AppState {
  isIndexLoading: boolean;
  isQueryLoading: boolean;
  indexReady: boolean;
  documents: string[];
  selectedDocument?: string;
  structure: DocumentNode[];
  messages: ChatMessage[];
  retrievalTrace: RetrievalTrace | null;
  comparison: RagComparison | null;
  metrics: QueryMetrics | null;
  metricHistory: MetricPoint[];
  websocketEvents: TraversalEvent[];
  observabilityMetrics: ObservabilityMetrics | null;
  lazyTreeNodes: Record<string, LazyIndexNode>;
  setIndexLoading: (value: boolean) => void;
  setIndexReady: (value: boolean) => void;
  setDocuments: (docs: string[]) => void;
  selectDocument: (doc?: string) => void;
  setStructure: (nodes: DocumentNode[]) => void;
  addMessage: (message: ChatMessage) => void;
  setQueryLoading: (value: boolean) => void;
  setRetrievalData: (
    trace: RetrievalTrace,
    comparison: RagComparison,
    metrics: QueryMetrics
  ) => void;
  clearChat: () => void;
  setObservabilityMetrics: (metrics: ObservabilityMetrics | null) => void;
  pushWebsocketEvent: (event: TraversalEvent) => void;
  clearWebsocketEvents: () => void;
  upsertLazyNode: (node: LazyIndexNode) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isIndexLoading: false,
  isQueryLoading: false,
  indexReady: false,
  documents: [],
  selectedDocument: undefined,
  structure: [],
  messages: [],
  retrievalTrace: null,
  comparison: null,
  metrics: null,
  metricHistory: [],
  websocketEvents: [],
  observabilityMetrics: null,
  lazyTreeNodes: {},
  setIndexLoading: (value) => set({ isIndexLoading: value }),
  setIndexReady: (value) => set({ indexReady: value }),
  setDocuments: (docs) => set({ documents: docs }),
  selectDocument: (doc) => set({ selectedDocument: doc }),
  setStructure: (nodes) => set({ structure: nodes }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setQueryLoading: (value) => set({ isQueryLoading: value }),
  setRetrievalData: (trace, comparison, metrics) =>
    set((state) => ({
      retrievalTrace: trace,
      comparison,
      metrics,
      metricHistory: [
        ...state.metricHistory,
        {
          query: state.metricHistory.length + 1,
          latencyMs: metrics.latencyMs,
          tokens: metrics.tokensUsed,
          contextSize: metrics.contextSize,
        },
      ],
    })),
  clearChat: () => {
    const { metricHistory } = get();
    set({
      messages: [],
      retrievalTrace: null,
      comparison: null,
      metrics: null,
      metricHistory,
    });
  },
  setObservabilityMetrics: (metrics) => set({ observabilityMetrics: metrics }),
  pushWebsocketEvent: (event) =>
    set((state) => ({
      websocketEvents:
        state.websocketEvents.length >= 500
          ? [...state.websocketEvents.slice(-499), event]
          : [...state.websocketEvents, event],
    })),
  clearWebsocketEvents: () => set({ websocketEvents: [] }),
  upsertLazyNode: (node) =>
    set((state) => ({
      lazyTreeNodes: {
        ...state.lazyTreeNodes,
        [node.id]: node,
      },
    })),
}));
