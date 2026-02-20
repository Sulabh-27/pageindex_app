from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .index_manager import PageIndexManager
from .observability import metrics_collector
from .query_engine import QueryEngine
from .websocket import traversal_events

logger = logging.getLogger(__name__)
_jobs_lock = Lock()
_rebuild_lock = Lock()
_upload_jobs: dict[str, dict] = {}


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, description="User question")


class QueryResponse(BaseModel):
    answer: str
    latency_ms: int


class UploadResponse(BaseModel):
    success: bool
    filename: str
    message: str
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    filename: str
    error: str | None = None


class RetrievalTraceResponse(BaseModel):
    steps: list[dict]
    latency: int
    tokens: int
    traversal: list[dict] | None = None
    nodes_loaded_from_cache: int | None = None
    nodes_loaded_from_disk: int | None = None
    nodes_evaluated: int | None = None
    tree_depth: int | None = None


class IndexNodeResponse(BaseModel):
    id: str
    parent_id: str | None = None
    children_ids: list[str] = []
    level: int
    title: str
    summary: str
    fingerprint: str
    file_path: str
    metadata: dict


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Starting API and loading index into memory")
    try:
        traversal_events.attach_loop(asyncio.get_running_loop())
        QueryEngine()
    except Exception:
        logger.exception("Startup failed while loading QueryEngine/index")
        raise
    yield
    logger.info("Shutting down API")


app = FastAPI(
    title="PageIndex Document QA API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/query", response_model=QueryResponse)
async def query_endpoint(request: QueryRequest) -> QueryResponse:
    try:
        engine = QueryEngine()
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, engine.query, request.question)
        return QueryResponse(answer=result.answer, latency_ms=result.latency_ms)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Query endpoint failed")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}") from exc


@app.get("/index_structure")
async def index_structure_endpoint() -> dict:
    try:
        engine = QueryEngine()
        loop = asyncio.get_running_loop()
        payload = await loop.run_in_executor(None, engine.get_index_structure)
        root_pointer = engine.traversal_engine.store.load_root_pointer()
        if root_pointer:
            payload["hierarchical_root"] = root_pointer
        return payload
    except Exception as exc:
        logger.exception("Index structure endpoint failed")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}") from exc


@app.get("/retrieval_trace", response_model=RetrievalTraceResponse)
async def retrieval_trace_endpoint(question: str = Query(..., min_length=1)) -> RetrievalTraceResponse:
    try:
        cleaned = question.strip()
        if not cleaned:
            raise ValueError("Question cannot be empty")

        engine = QueryEngine()
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, engine.get_retrieval_trace, cleaned)
        traversal = list(result.steps)
        return RetrievalTraceResponse(
            steps=result.steps,
            latency=result.latency,
            tokens=result.tokens,
            traversal=traversal,
            nodes_loaded_from_cache=result.nodes_loaded_from_cache,
            nodes_loaded_from_disk=result.nodes_loaded_from_disk,
            nodes_evaluated=result.nodes_evaluated,
            tree_depth=result.tree_depth,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Retrieval trace endpoint failed")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}") from exc


@app.post("/upload", response_model=UploadResponse)
async def upload_endpoint(
    background_tasks: BackgroundTasks, file: UploadFile = File(...)
) -> UploadResponse:
    try:
        manager = PageIndexManager.get_instance()
        docs_dir = manager.docs_dir
        docs_dir.mkdir(parents=True, exist_ok=True)

        safe_name = Path(file.filename or "uploaded_document").name
        if not safe_name:
            raise ValueError("Invalid filename")

        target = docs_dir / safe_name
        content = await file.read()
        target.write_bytes(content)
        await file.close()

        job_id = uuid4().hex
        with _jobs_lock:
            _upload_jobs[job_id] = {
                "job_id": job_id,
                "status": "queued",
                "filename": safe_name,
                "error": None,
            }

        background_tasks.add_task(_rebuild_index_job, job_id)

        return UploadResponse(
            success=True,
            filename=safe_name,
            message=f"Uploaded {safe_name}. Rebuild job started in background.",
            job_id=job_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Upload endpoint failed")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}") from exc


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def job_status_endpoint(job_id: str) -> JobStatusResponse:
    with _jobs_lock:
        job = _upload_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(**job)


@app.get("/metrics")
async def metrics_endpoint() -> dict:
    return metrics_collector.snapshot()


@app.get("/index/node/{node_id}", response_model=IndexNodeResponse)
async def index_node_endpoint(node_id: str, level_hint: int | None = None) -> IndexNodeResponse:
    engine = QueryEngine()
    node, _source = engine.traversal_engine.store.load_node(node_id, level_hint=level_hint)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return IndexNodeResponse(**node)


@app.websocket("/ws/traversal")
async def traversal_websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = traversal_events.subscribe()
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        traversal_events.unsubscribe(queue)
    except Exception:
        traversal_events.unsubscribe(queue)
        raise


def _rebuild_index_job(job_id: str) -> None:
    with _jobs_lock:
        if job_id not in _upload_jobs:
            return
        _upload_jobs[job_id]["status"] = "running"

    manager = PageIndexManager.get_instance()
    try:
        with _rebuild_lock:
            manager.rebuild_index()
        with _jobs_lock:
            if job_id in _upload_jobs:
                _upload_jobs[job_id]["status"] = "success"
    except Exception as exc:
        logger.exception("Background rebuild job failed")
        with _jobs_lock:
            if job_id in _upload_jobs:
                _upload_jobs[job_id]["status"] = "failed"
                _upload_jobs[job_id]["error"] = str(exc)

