import {
  type DocumentNode,
  type RagComparison,
  type RetrievalTrace,
  type RetrievalTraceResponse,
} from "@/types";
import { estimateTokens } from "@/lib/utils";

const SAMPLE_STRUCTURE: DocumentNode[] = [
  {
    id: "root-1",
    title: "Chapter 1: Opening Principles",
    summary: "Fundamental concepts and initiative.",
    start_index: 1,
    end_index: 40,
    nodes: [
      {
        id: "root-1-1",
        title: "Section 1.1: Center Control",
        start_index: 2,
        end_index: 15,
      },
      {
        id: "root-1-2",
        title: "Section 1.2: Piece Development",
        start_index: 16,
        end_index: 40,
      },
    ],
  },
  {
    id: "root-2",
    title: "Chapter 2: Ruy Lopez Plans",
    summary: "Strategic plans and tactical motifs.",
    start_index: 41,
    end_index: 140,
    nodes: [
      {
        id: "root-2-1",
        title: "Section 2.1: Anti-Marshall Setup",
        start_index: 42,
        end_index: 92,
      },
      {
        id: "root-2-2",
        title: "Section 2.2: Breyer and Zaitsev Ideas",
        start_index: 93,
        end_index: 140,
      },
    ],
  },
  {
    id: "root-3",
    title: "Chapter 3: Endgame Patterns",
    start_index: 141,
    end_index: 220,
  },
];

export function createMockStructure(): DocumentNode[] {
  return SAMPLE_STRUCTURE;
}

export function createMockTrace(question: string): RetrievalTrace {
  const selectedNode =
    question.toLowerCase().includes("breyer") ||
    question.toLowerCase().includes("zaitsev")
      ? "Section 2.2: Breyer and Zaitsev Ideas"
      : "Section 2.1: Anti-Marshall Setup";

  const steps = [
    {
      id: "step-1",
      title: "Query Received",
      description: "Question parsed and embedded for retrieval",
      node: "Root",
      selected: true,
      state: "evaluating" as const,
      timestampMs: 110,
    },
    {
      id: "step-2",
      title: "Root Evaluation",
      description: "Top-level chapters ranked by relevance",
      node: "Chapter 2: Ruy Lopez Plans",
      selected: true,
      state: "selected" as const,
      timestampMs: 320,
    },
    {
      id: "step-3",
      title: "Section Traversal",
      description: "Child sections evaluated with semantic routing",
      node: selectedNode,
      selected: true,
      state: "selected" as const,
      timestampMs: 660,
    },
    {
      id: "step-4",
      title: "Context Selection",
      description: "Minimal high-signal context extracted",
      node: selectedNode,
      selected: true,
      state: "selected" as const,
      timestampMs: 890,
    },
    {
      id: "step-5",
      title: "Answer Generation",
      description: "Final response generated from selected node content",
      node: selectedNode,
      selected: true,
      state: "selected" as const,
      timestampMs: 1200,
    },
  ];

  const tokens = estimateTokens(question) + 210;

  return {
    steps,
    latency: 1200,
    tokens,
    contextSize: 1400,
    nodesTraversed: 4,
    accuracy: 0.92,
  };
}

export function normalizeTraceFromBackend(
  backendTrace: RetrievalTraceResponse
): RetrievalTrace {
  const steps = backendTrace.steps.map((step, index) => ({
    id: `step-${index + 1}`,
    title:
      index === 0
        ? "Query Received"
        : index === backendTrace.steps.length - 1
        ? "Final Context Selected"
        : "Tree Traversal",
    description: step.selected
      ? "Node selected as relevant"
      : "Node reviewed and rejected",
    node: step.node,
    selected: step.selected,
    state: step.selected ? ("selected" as const) : ("rejected" as const),
    timestampMs: Math.round(
      ((index + 1) / Math.max(backendTrace.steps.length, 1)) *
        backendTrace.latency
    ),
  }));

  return {
    steps,
    latency: backendTrace.latency,
    tokens: backendTrace.tokens,
    contextSize: Math.max(1000, Math.round(backendTrace.tokens * 2.2)),
    nodesTraversed: backendTrace.steps.length,
    accuracy: 0.9,
    nodesLoadedFromCache: backendTrace.nodes_loaded_from_cache ?? 0,
    nodesLoadedFromDisk: backendTrace.nodes_loaded_from_disk ?? 0,
    treeDepth: backendTrace.tree_depth ?? 0,
  };
}

export function createMockComparison(trace: RetrievalTrace): RagComparison {
  return {
    rag: {
      chunks: [
        { id: "rag-1", title: "Chunk A (Relevant)", score: 0.86, tokens: 420, isNoise: false },
        { id: "rag-2", title: "Chunk B (Partially Relevant)", score: 0.78, tokens: 390, isNoise: false },
        { id: "rag-3", title: "Chunk C (Noise)", score: 0.71, tokens: 450, isNoise: true },
        { id: "rag-4", title: "Chunk D (Noise)", score: 0.68, tokens: 380, isNoise: true },
      ],
      tokens: 1640,
      latency: trace.latency + 350,
      accuracy: 0.71,
      contextSize: 4800,
    },
    pageIndex: {
      selectedPath: trace.steps.map((step) => step.node),
      tokens: trace.tokens,
      latency: trace.latency,
      accuracy: trace.accuracy,
      contextSize: trace.contextSize,
    },
  };
}
