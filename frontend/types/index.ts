export type TraceNodeState = "unvisited" | "evaluating" | "selected" | "rejected";
export type TraversalEventType = "node_evaluated" | "node_selected" | "answer_generated";
export type TraversalNodeSource = "cache" | "disk" | "miss";

export interface RetrievalStep {
  id: string;
  title: string;
  description: string;
  node: string;
  selected: boolean;
  state: TraceNodeState;
  timestampMs?: number;
}

export interface RetrievalTrace {
  steps: RetrievalStep[];
  latency: number;
  tokens: number;
  contextSize: number;
  nodesTraversed: number;
  accuracy: number;
  nodesLoadedFromCache?: number;
  nodesLoadedFromDisk?: number;
  treeDepth?: number;
}

export interface RagChunk {
  id: string;
  title: string;
  score: number;
  tokens: number;
  isNoise: boolean;
}

export interface RagComparison {
  rag: {
    chunks: RagChunk[];
    tokens: number;
    latency: number;
    accuracy: number;
    contextSize: number;
  };
  pageIndex: {
    selectedPath: string[];
    tokens: number;
    latency: number;
    accuracy: number;
    contextSize: number;
  };
}

export interface QueryMetrics {
  latencyMs: number;
  tokensUsed: number;
  nodesTraversed: number;
  contextSize: number;
  stepsCount: number;
}

export interface QueryResponse {
  answer: string;
  latency_ms: number;
}

export interface RetrievalTraceResponse {
  steps: Array<{
    node: string;
    selected: boolean;
    level?: number;
    node_id?: string;
    depth?: number;
    score?: number;
  }>;
  latency: number;
  tokens: number;
  traversal?: Array<{
    depth: number;
    node_id: string;
    title: string;
    level: number;
    score: number;
  }>;
  nodes_loaded_from_cache?: number;
  nodes_loaded_from_disk?: number;
  nodes_evaluated?: number;
  tree_depth?: number;
}

export interface DocumentNode {
  id: string;
  title: string;
  summary?: string;
  start_index?: number;
  end_index?: number;
  nodes?: DocumentNode[];
}

export interface IndexedDocument {
  doc_name: string;
  doc_description?: string;
  structure: DocumentNode[];
}

export interface IndexStructureResponse {
  model_name?: string;
  built_at_epoch?: number;
  document_count?: number;
  documents?: IndexedDocument[];
  hierarchical_root?: IndexRootPointer;
}

export interface UploadResponse {
  success: boolean;
  filename: string;
  message?: string;
  job_id?: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: "queued" | "running" | "success" | "failed";
  filename: string;
  error?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface MetricPoint {
  query: number;
  latencyMs: number;
  tokens: number;
  contextSize: number;
}

export interface TraversalEvent {
  event: TraversalEventType;
  node_id?: string;
  level?: number;
  source?: TraversalNodeSource;
  title?: string;
}

export interface ObservabilityMetrics {
  cache_hits: number;
  cache_misses: number;
  cache_hit_rate: number;
  nodes_loaded_from_disk: number;
  nodes_evaluated: number;
  max_tree_depth_seen: number;
  retrieval_count: number;
  last_retrieval_latency_ms: number;
  avg_retrieval_latency_ms: number;
  last_updated_epoch_ms: number;
}

export interface IndexRootPointer {
  root_id: string;
  metadata?: Record<string, unknown>;
}

export interface LazyIndexNode {
  id: string;
  parent_id?: string | null;
  children_ids: string[];
  level: number;
  title: string;
  summary: string;
  fingerprint: string;
  file_path: string;
  metadata: Record<string, unknown>;
}
