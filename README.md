# PageIndex Retrieval Studio

Enterprise-grade document Q&A platform built on top of **VectifyAI PageIndex**, with:

- FastAPI backend for indexing, retrieval, observability, and streaming events
- Next.js frontend for chat, retrieval visualization, metrics, and index exploration
- Incremental and hierarchical indexing designed for very large documents

---

## Why PageIndex (and not plain RAG)?

Traditional RAG usually retrieves top-k chunks from a flat vector space.  
PageIndex uses document structure (chapters, sections, hierarchy) to navigate toward the right context first.

### PageIndex vs Traditional RAG

| Area | Traditional RAG | PageIndex-first (this project) |
|---|---|---|
| Retrieval model | Flat chunk similarity | Hierarchical tree traversal |
| Interpretability | Low (chunk list) | High (traceable node path) |
| Context quality | Can include noisy neighbors | Tighter, section-aware context |
| Explainability | Harder to debug | Traversal events + trace + metrics |
| Large docs | Can degrade with scale/noise | Better with structured navigation |

### What this project adds on top of PageIndex

- Async indexing jobs with status tracking
- Incremental indexing via fingerprints
- Balanced hierarchical index and lazy node loading
- Real-time traversal streaming over WebSocket
- Metrics endpoint and frontend observability dashboard
- Retrieval trace + tree animation + cache/disk visibility

---

## Architecture Overview

### Backend (FastAPI)

- `app/api.py` - public API + websocket endpoints
- `app/index_manager.py` - lifecycle manager, incremental rebuild, persistence
- `app/query_engine.py` - query handling, cache, retrieval trace
- `app/indexing/balanced_indexer.py` - balanced hierarchical indexing
- `app/storage/lazy_store.py` - lazy node store + LRU cache
- `app/retrieval/engine.py` - traversal engine + event emission
- `app/websocket/events.py` - in-process traversal event bus
- `app/observability/metrics.py` - telemetry collector

### Frontend (Next.js 14 + TypeScript)

- `frontend/components/PageIndexStudio.tsx` - main enterprise UI shell
- chat panel + document sidebar + right-panel visualizations
- real-time traversal visualizer (WebSocket)
- observability and cache performance dashboards
- lazy index structure explorer

---

## Project Structure

```text
pageindex_app/
|
|- app/
|  |- api.py
|  |- config.py
|  |- index_manager.py
|  |- query_engine.py
|  |- indexing/
|  |- retrieval/
|  |- storage/
|  |- websocket/
|  |- observability/
|
|- docs/                    # source documents (.pdf, .md, .txt)
|- saved_index/             # persisted indexes + hierarchical lazy store
|- logs/                    # runtime logs
|- frontend/                # Next.js app
|- main.py                  # CLI entry
|- requirements.txt
|- .env
|- .gitignore
|- README.md
```

---

## Core Features

- **Incremental indexing**
  - fingerprints detect unchanged files
  - unchanged docs are reused, changed docs rebuilt
- **Balanced hierarchical indexing**
  - chunk size: 500 words
  - max children per node: 10
  - bounded depth for scalable traversal
- **Lazy storage**
  - nodes saved on disk and loaded on demand
  - LRU memory cache for hot nodes
- **Async ingestion pipeline**
  - upload returns immediately with `job_id`
  - background rebuild status via `/jobs/{job_id}`
- **Retrieval traceability**
  - traversal trace endpoint
  - websocket event stream during node evaluation/selection
- **Observability**
  - cache hit rate
  - disk loads
  - nodes evaluated
  - depth and latency telemetry
- **Professional frontend**
  - chat UX
  - retrieval tree animation
  - timeline, comparison, metrics, lazy explorer

---

## Requirements

- Python 3.10+
- Node.js 18+ and npm
- OpenAI API key
- `git` installed (for PageIndex bootstrap if needed)

---

## Setup

### 1) Backend install

```bash
pip install -r requirements.txt
```

### 2) Frontend install

```bash
cd frontend
npm install
```

### 3) Environment

Create/update `.env` at project root:

```env
OPENAI_API_KEY=your_real_openai_key
MODEL_NAME=gpt-4o-mini
```

---

## Running the System

### Option A: via main menu

```bash
python main.py
```

- `1` Start API server
- `2` Start CLI chat
- `3` Rebuild index

### Option B: run backend + frontend directly

Backend:

```bash
python -m uvicorn app.api:app --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

---

## API Reference

### `POST /query`

Request:

```json
{
  "question": "What is positional encoding?"
}
```

Response:

```json
{
  "answer": "...",
  "latency_ms": 1234
}
```

### `POST /upload`

Multipart upload of a document.  
Returns async job info immediately.

Response:

```json
{
  "success": true,
  "filename": "mydoc.pdf",
  "message": "Uploaded mydoc.pdf. Rebuild job started in background.",
  "job_id": "..."
}
```

### `GET /jobs/{job_id}`

Check async rebuild status (`queued`, `running`, `success`, `failed`).

### `GET /index_structure`

Returns saved index payload plus hierarchical root metadata (when available).

### `GET /index/node/{node_id}`

Lazy-fetch a single hierarchical node for explorer UI.

### `GET /retrieval_trace?question=...`

Returns traversal-oriented trace + retrieval metrics fields.

### `GET /metrics`

Observability snapshot:

- cache hits/misses + hit rate
- nodes loaded from disk
- nodes evaluated
- retrieval counts and latency stats

### `WS /ws/traversal`

Streams live traversal events:

```json
{ "event": "node_evaluated", "node_id": "...", "level": 2, "source": "cache" }
```

```json
{ "event": "node_selected", "node_id": "...", "level": 2 }
```

```json
{ "event": "answer_generated" }
```

---

## Frontend Capabilities

- Chat interface with answer rendering
- Real-time traversal visualizer (WebSocket-driven)
- Retrieval timeline and tree tabs
- RAG vs PageIndex comparison panel
- Observability dashboard (metrics polling)
- Cache performance panel
- Lazy index structure explorer
- Async upload job polling in UI

---

## Performance Notes

Designed for very large documents with:

- balanced hierarchical chunking
- lazy node loading from disk
- LRU cache for hot traversal paths
- incremental rebuild to reduce repeat indexing costs

For best results on very large PDFs:

- prefer text-extractable PDFs (OCR quality matters)
- avoid uploading many huge docs simultaneously
- monitor `/metrics` during load tests

---

## Troubleshooting

- **Frontend loads but API fails**
  - ensure backend is running on `:8000`
- **Upload works but no new answers**
  - check `/jobs/{job_id}` for rebuild completion
- **Slow initial query**
  - first hit may include cold loads; later queries should warm cache
- **No websocket events**
  - verify `ws://localhost:8000/ws/traversal` connectivity

---

## Notes on PageIndex Dependency

Upstream `VectifyAI/PageIndex` may not always be available as a normal pip package.  
This project includes runtime bootstrap in `app/index_manager.py`:

1. try `import pageindex`
2. if unavailable, clone into `.vendor/PageIndex`
3. add to Python path and continue

This ensures the system remains operational end-to-end while retaining PageIndex as the indexing core.

