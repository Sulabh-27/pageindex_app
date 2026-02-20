import {
  type DocumentNode,
  type IndexStructureResponse,
  type IndexRootPointer,
  type JobStatusResponse,
  type LazyIndexNode,
  type ObservabilityMetrics,
  type QueryResponse,
  type RetrievalTrace,
  type RetrievalTraceResponse,
  type UploadResponse,
} from "@/types";
import {
  createMockComparison,
  createMockStructure,
  createMockTrace,
  normalizeTraceFromBackend,
} from "@/lib/mock";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

async function safeJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function queryQuestion(question: string): Promise<QueryResponse> {
  const response = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  return safeJson<QueryResponse>(response);
}

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    return await safeJson<UploadResponse>(response);
  } catch {
    return {
      success: true,
      filename: file.name,
      message:
        "Upload endpoint not available on backend. UI is using local simulated state for testing.",
    };
  }
}

export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
  return safeJson<JobStatusResponse>(response);
}

export async function fetchIndexStructure(): Promise<DocumentNode[]> {
  try {
    const response = await fetch(`${API_BASE}/index_structure`, {
      method: "GET",
    });
    const payload = await safeJson<IndexStructureResponse>(response);
    const document = payload.documents?.[0];
    if (!document?.structure?.length) {
      return createMockStructure();
    }
    return document.structure;
  } catch {
    return createMockStructure();
  }
}

export async function fetchHierarchicalRoot(): Promise<IndexRootPointer | null> {
  try {
    const response = await fetch(`${API_BASE}/index_structure`, {
      method: "GET",
    });
    const payload = await safeJson<IndexStructureResponse & { hierarchical_root?: IndexRootPointer }>(
      response
    );
    return payload.hierarchical_root ?? null;
  } catch {
    return null;
  }
}

export async function fetchRetrievalTrace(
  question: string
): Promise<RetrievalTrace> {
  try {
    const response = await fetch(
      `${API_BASE}/retrieval_trace?question=${encodeURIComponent(question)}`
    );
    const payload = await safeJson<RetrievalTraceResponse>(response);
    return normalizeTraceFromBackend(payload);
  } catch {
    return createMockTrace(question);
  }
}

export async function fetchComparison(question: string) {
  const trace = await fetchRetrievalTrace(question);
  return createMockComparison(trace);
}

export async function fetchMetrics(): Promise<ObservabilityMetrics> {
  const response = await fetch(`${API_BASE}/metrics`, { method: "GET" });
  return safeJson<ObservabilityMetrics>(response);
}

export async function fetchIndexNode(
  nodeId: string,
  levelHint?: number
): Promise<LazyIndexNode> {
  const query = typeof levelHint === "number" ? `?level_hint=${levelHint}` : "";
  const response = await fetch(`${API_BASE}/index/node/${encodeURIComponent(nodeId)}${query}`, {
    method: "GET",
  });
  return safeJson<LazyIndexNode>(response);
}

export function getTraversalWebSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_BASE_URL?.replace(/\/$/, "");
  if (configured) {
    return `${configured}/ws/traversal`;
  }
  return "ws://localhost:8000/ws/traversal";
}
