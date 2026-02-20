from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import subprocess
import sys
import time
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List

from .config import (
    PAGEINDEX_REPO_URL,
    PAGEINDEX_VENDOR_DIR,
    apply_pageindex_env,
    get_settings,
)
from .indexing import BalancedHierarchicalIndexer
from .storage import LazyNodeStore

logger = logging.getLogger(__name__)


class PageIndexManager:
    """
    Singleton manager for PageIndex build/load lifecycle.
    """

    _instance: "PageIndexManager | None" = None
    _instance_lock = Lock()

    def __new__(cls, model_name: str | None = None) -> "PageIndexManager":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self, model_name: str | None = None) -> None:
        if self._initialized:
            return

        self.settings = get_settings(model_override=model_name)
        self.docs_dir = self.settings.docs_dir
        self.index_dir = self.settings.index_dir
        self.index_file = self.settings.index_file
        self.model_name = self.settings.model_name
        self._index_data: Dict[str, Any] | None = None
        self._index_file_mtime: float | None = None
        self._data_lock = Lock()
        self._lazy_store = LazyNodeStore(self.index_dir / "hierarchical")
        self._balanced_indexer = BalancedHierarchicalIndexer(self._lazy_store)

        self.index_dir.mkdir(parents=True, exist_ok=True)
        self._initialized = True
        logger.info("PageIndexManager initialized with model=%s", self.model_name)

    @classmethod
    def get_instance(cls, model_name: str | None = None) -> "PageIndexManager":
        return cls(model_name=model_name)

    def _ensure_pageindex_available(self) -> None:
        try:
            import pageindex  # noqa: F401
            return
        except ImportError:
            logger.warning("PageIndex import failed. Attempting local bootstrap clone.")

        vendor_dir = PAGEINDEX_VENDOR_DIR
        vendor_dir.parent.mkdir(parents=True, exist_ok=True)

        if not vendor_dir.exists():
            clone_start = time.perf_counter()
            cmd = ["git", "clone", "--depth", "1", PAGEINDEX_REPO_URL, str(vendor_dir)]
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True)
                logger.info(
                    "Cloned PageIndex repository in %.2fs",
                    time.perf_counter() - clone_start,
                )
            except subprocess.CalledProcessError as exc:
                raise RuntimeError(
                    f"Failed to clone PageIndex from {PAGEINDEX_REPO_URL}: {exc.stderr}"
                ) from exc

        vendor_path_str = str(vendor_dir)
        if vendor_path_str not in sys.path:
            sys.path.insert(0, vendor_path_str)

        try:
            import pageindex  # noqa: F401
        except ImportError as exc:
            raise RuntimeError(
                "Unable to import PageIndex after bootstrap. "
                "Verify network access and dependencies."
            ) from exc

    def _pageindex_build_pdf(self, pdf_path: Path) -> Dict[str, Any]:
        from pageindex import page_index

        return page_index(
            str(pdf_path),
            model=self.model_name,
            if_add_node_id="yes",
            if_add_node_summary="yes",
            if_add_doc_description="yes",
            if_add_node_text="no",
        )

    def _pageindex_build_markdown(self, md_path: Path) -> Dict[str, Any]:
        from pageindex.page_index_md import md_to_tree
        from pageindex.utils import ConfigLoader

        config_loader = ConfigLoader()
        opt = config_loader.load(
            {
                "model": self.model_name,
                "if_add_node_id": "yes",
                "if_add_node_summary": "yes",
                "if_add_doc_description": "yes",
                "if_add_node_text": "no",
            }
        )

        structure = asyncio.run(
            md_to_tree(
                md_path=str(md_path),
                if_thinning=False,
                min_token_threshold=5000,
                if_add_node_summary=opt.if_add_node_summary,
                summary_token_threshold=200,
                model=opt.model,
                if_add_doc_description=opt.if_add_doc_description,
                if_add_node_text=opt.if_add_node_text,
                if_add_node_id=opt.if_add_node_id,
            )
        )
        return {
            "doc_name": md_path.name,
            "doc_description": f"Structured index generated from {md_path.name}",
            "structure": structure,
        }

    def _build_fallback_text_index(self, txt_path: Path) -> Dict[str, Any]:
        content = txt_path.read_text(encoding="utf-8", errors="ignore")
        snippet = " ".join(content.split())[:800]
        return {
            "doc_name": txt_path.name,
            "doc_description": f"Text document: {txt_path.name}",
            "structure": [
                {
                    "title": txt_path.stem,
                    "node_id": "0000",
                    "summary": snippet,
                    "start_index": 1,
                    "end_index": 1,
                    "nodes": [],
                }
            ],
        }

    def _supported_files(self) -> List[Path]:
        patterns = ("*.pdf", "*.txt", "*.md", "*.markdown")
        files: List[Path] = []
        for pattern in patterns:
            files.extend(self.docs_dir.glob(pattern))
        return sorted([f for f in files if f.is_file()])

    def _compute_doc_fingerprint(self, file_path: Path) -> str:
        stat = file_path.stat()
        hasher = hashlib.sha256()
        hasher.update(str(file_path.name).encode("utf-8"))
        hasher.update(str(stat.st_size).encode("utf-8"))
        hasher.update(str(stat.st_mtime_ns).encode("utf-8"))
        with file_path.open("rb") as handle:
            hasher.update(handle.read(1024 * 1024))
        return hasher.hexdigest()

    def _load_previous_doc_maps(self) -> tuple[Dict[str, Dict[str, Any]], Dict[str, str]]:
        if not self.index_file.exists():
            return {}, {}
        try:
            previous_payload = json.loads(self.index_file.read_text(encoding="utf-8"))
        except Exception:
            logger.warning("Previous index is unreadable; full rebuild will be used.")
            return {}, {}

        previous_docs: Dict[str, Dict[str, Any]] = {}
        for item in previous_payload.get("documents", []):
            doc_name = item.get("doc_name")
            if isinstance(doc_name, str):
                previous_docs[doc_name] = item

        fingerprints = previous_payload.get("doc_fingerprints", {})
        if not isinstance(fingerprints, dict):
            fingerprints = {}
        return previous_docs, {str(k): str(v) for k, v in fingerprints.items()}

    def build_index(self) -> Dict[str, Any]:
        if not self.docs_dir.exists():
            raise FileNotFoundError(
                f"Docs folder '{self.docs_dir}' not found. Create it and add documents."
            )

        documents = self._supported_files()
        if not documents:
            raise FileNotFoundError(
                f"No supported documents found in '{self.docs_dir}'. "
                "Add .pdf, .md, .markdown, or .txt files."
            )

        apply_pageindex_env(self.settings.api_key)
        self._ensure_pageindex_available()

        build_start = time.perf_counter()
        logger.info("Starting index build for %d documents", len(documents))

        previous_docs, previous_fingerprints = self._load_previous_doc_maps()
        indexed_docs: List[Dict[str, Any]] = []
        current_fingerprints: Dict[str, str] = {}
        reused_count = 0
        doc_root_ids: List[str] = []
        for file_path in documents:
            doc_start = time.perf_counter()
            logger.info("Indexing document: %s", file_path.name)
            try:
                fingerprint = self._compute_doc_fingerprint(file_path)
                current_fingerprints[file_path.name] = fingerprint

                previous_fingerprint = previous_fingerprints.get(file_path.name)
                if previous_fingerprint == fingerprint and file_path.name in previous_docs:
                    reused_doc = dict(previous_docs[file_path.name])
                    if not reused_doc.get("hierarchical_root_id"):
                        hierarchical_result = self._build_hierarchical_index(file_path)
                        reused_doc["hierarchical_root_id"] = hierarchical_result["root_id"]
                        reused_doc["hierarchical_chunk_count"] = hierarchical_result["chunk_count"]
                    indexed_docs.append(reused_doc)
                    reused_count += 1
                    if isinstance(reused_doc, dict) and reused_doc.get("hierarchical_root_id"):
                        doc_root_ids.append(str(reused_doc["hierarchical_root_id"]))
                    logger.info(
                        "Reused cached index for %s in %.2fs",
                        file_path.name,
                        time.perf_counter() - doc_start,
                    )
                    continue

                if file_path.suffix.lower() == ".pdf":
                    doc_index = self._pageindex_build_pdf(file_path)
                elif file_path.suffix.lower() in {".md", ".markdown"}:
                    doc_index = self._pageindex_build_markdown(file_path)
                else:
                    doc_index = self._build_fallback_text_index(file_path)

                hierarchical_result = self._build_hierarchical_index(file_path)
                doc_index["hierarchical_root_id"] = hierarchical_result["root_id"]
                doc_index["hierarchical_chunk_count"] = hierarchical_result["chunk_count"]
                doc_root_ids.append(str(hierarchical_result["root_id"]))
                indexed_docs.append(doc_index)
                logger.info(
                    "Indexed %s in %.2fs",
                    file_path.name,
                    time.perf_counter() - doc_start,
                )
            except Exception:
                logger.exception("Failed to index %s", file_path.name)
                raise

        payload = {
            "model_name": self.model_name,
            "built_at_epoch": int(time.time()),
            "document_count": len(indexed_docs),
            "documents": indexed_docs,
            "doc_fingerprints": current_fingerprints,
        }
        self._build_global_hierarchical_root(doc_root_ids)
        self.save_index(payload)

        total_sec = time.perf_counter() - build_start
        logger.info(
            "Index build completed in %.2fs (reused=%d, rebuilt=%d)",
            total_sec,
            reused_count,
            len(indexed_docs) - reused_count,
        )
        return payload

    def _build_hierarchical_index(self, file_path: Path) -> Dict[str, Any]:
        suffix = file_path.suffix.lower()
        if suffix == ".pdf":
            stream = self._balanced_indexer.stream_pdf_pages(file_path)
        elif suffix in {".md", ".markdown"}:
            stream = self._balanced_indexer.stream_markdown_file(file_path)
        else:
            stream = self._balanced_indexer.stream_text_file(file_path)
        return self._balanced_indexer.build_from_stream(stream, str(file_path))

    def _build_global_hierarchical_root(self, doc_root_ids: List[str]) -> None:
        seed = "|".join(doc_root_ids) if doc_root_ids else "empty"
        root_id = f"global-root-{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:8]}"
        node = {
            "id": root_id,
            "parent_id": None,
            "children_ids": doc_root_ids,
            "level": 0,
            "title": "Root",
            "summary": "Global document root",
            "fingerprint": root_id,
            "file_path": str(self.index_file),
            "metadata": {
                "child_count": len(doc_root_ids),
                "source": "global_hierarchical_root",
            },
        }
        self._lazy_store.save_node(node)
        self._lazy_store.save_root_pointer(
            root_id=root_id,
            metadata={
                "root_type": "global",
                "doc_root_count": len(doc_root_ids),
            },
        )

    def save_index(self, payload: Dict[str, Any]) -> None:
        save_start = time.perf_counter()
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.index_file.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        try:
            self._index_file_mtime = self.index_file.stat().st_mtime
        except OSError:
            self._index_file_mtime = None
        logger.info(
            "Saved index to %s in %.2fs",
            self.index_file,
            time.perf_counter() - save_start,
        )

    def load_index(self) -> Dict[str, Any]:
        if not self.index_file.exists():
            raise FileNotFoundError(f"Index file not found: {self.index_file}")
        load_start = time.perf_counter()
        try:
            data = json.loads(self.index_file.read_text(encoding="utf-8"))
        except Exception as exc:
            raise RuntimeError(f"Index load failure: {exc}") from exc
        try:
            self._index_file_mtime = self.index_file.stat().st_mtime
        except OSError:
            self._index_file_mtime = None
        logger.info("Loaded index in %.2fs", time.perf_counter() - load_start)
        return data

    def _reload_from_disk_if_changed(self) -> None:
        if not self.index_file.exists():
            return
        try:
            current_mtime = self.index_file.stat().st_mtime
        except OSError:
            return
        if self._index_file_mtime is None:
            self._index_file_mtime = current_mtime
            return
        if current_mtime > self._index_file_mtime:
            logger.info("Detected newer index file on disk. Reloading in-memory index.")
            self._index_data = self.load_index()

    def get_or_create_index(self, rebuild: bool = False) -> Dict[str, Any]:
        with self._data_lock:
            if self._index_data is not None and not rebuild:
                self._reload_from_disk_if_changed()
                return self._index_data

            if rebuild:
                logger.info("Rebuild requested. Building index from documents.")
                self._index_data = self.build_index()
                return self._index_data

            if self.index_file.exists():
                logger.info("Found existing saved index. Loading from disk.")
                self._index_data = self.load_index()
            else:
                logger.info("No existing index found. Building and saving a new index.")
                self._index_data = self.build_index()
            return self._index_data

    def rebuild_index(self) -> Dict[str, Any]:
        return self.get_or_create_index(rebuild=True)

