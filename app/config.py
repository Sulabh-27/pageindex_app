from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent

INDEX_DIR = "saved_index"
DOCS_DIR = "docs"
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-4o-mini")

PAGEINDEX_REPO_URL = "https://github.com/VectifyAI/PageIndex.git"
PAGEINDEX_VENDOR_DIR = PROJECT_ROOT / ".vendor" / "PageIndex"
INDEX_FILE_NAME = "index.json"


class ConfigError(RuntimeError):
    """Raised when application configuration is invalid."""


@dataclass(frozen=True)
class AppSettings:
    project_root: Path = PROJECT_ROOT
    docs_dir: Path = PROJECT_ROOT / DOCS_DIR
    index_dir: Path = PROJECT_ROOT / INDEX_DIR
    index_file: Path = (PROJECT_ROOT / INDEX_DIR / INDEX_FILE_NAME)
    model_name: str = MODEL_NAME
    api_key: str = ""


def get_api_key() -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or api_key.lower() in {"your_openai_api_key_here", "changeme"}:
        raise ConfigError(
            "Missing OPENAI_API_KEY in .env. Set a valid key before running index build/query."
        )
    return api_key


def get_settings(model_override: str | None = None) -> AppSettings:
    model_name = model_override or MODEL_NAME
    api_key = get_api_key()
    return AppSettings(model_name=model_name, api_key=api_key)


def apply_pageindex_env(api_key: str) -> None:
    """
    PageIndex resolves CHATGPT_API_KEY at import time.
    Keep both names in sync before importing pageindex modules.
    """
    os.environ["OPENAI_API_KEY"] = api_key
    os.environ["CHATGPT_API_KEY"] = api_key

