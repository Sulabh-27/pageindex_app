# PageIndex Document Q&A System

Production-ready document Q&A system using VectifyAI PageIndex for index generation, with both FastAPI and CLI interfaces.

## Project Structure

```text
pageindex_app/
|
|- docs/                  # add PDFs / text / markdown docs here
|- saved_index/           # persistent index storage (auto-created)
|- app/
|  |- __init__.py
|  |- config.py
|  |- index_manager.py
|  |- query_engine.py
|  |- api.py
|  |- cli_chat.py
|
|- main.py
|- requirements.txt
|- .env
|- README.md
```

## Features

- Persistent index storage (`saved_index/index.json`)
- Singleton index manager and query engine (index loaded once in memory)
- Auto load/build logic:
  - If saved index exists: load it
  - Else: build from `docs/` and persist
- FastAPI async endpoint: `POST /query`
- Interactive CLI chat mode
- Rebuild-on-demand from menu
- Structured logging:
  - index build/load timings
  - query latency
  - errors and tracebacks

## Requirements

- Python 3.10+
- OpenAI API key
- `git` installed (used for PageIndex source bootstrap if not already importable)

## Installation

From `pageindex_app/`:

```bash
pip install -r requirements.txt
```

## Configure Environment

Edit `.env`:

```env
OPENAI_API_KEY=your_real_openai_key
MODEL_NAME=gpt-4o-mini
```

`OPENAI_API_KEY` is required and validated at runtime.

## Add Documents

Put files into `docs/`:

- `.pdf`
- `.md` / `.markdown`
- `.txt` (supported via fallback text indexing)

## Run

```bash
python main.py
```

Menu:

- `1` Start API server
- `2` Start CLI chat
- `3` Rebuild index

## CLI Chat

Choose option `2` in `main.py`, then ask questions in terminal.

Type `exit` to quit.

## API Usage

Choose option `1` in `main.py` to start FastAPI on port `8000`.

### Request

`POST /query`

Body:

```json
{
  "question": "What is warranty?"
}
```

### Example curl

```bash
curl -X POST "http://127.0.0.1:8000/query" ^
  -H "Content-Type: application/json" ^
  -d "{\"question\":\"What is warranty?\"}"
```

### Response

```json
{
  "answer": "....",
  "latency_ms": 1234
}
```

## Notes on PageIndex Dependency

The upstream `VectifyAI/PageIndex` repository currently does not publish pip packaging metadata.  
This app includes runtime bootstrap in `app/index_manager.py`:

1. tries `import pageindex`
2. if unavailable, clones the repo into `.vendor/PageIndex`
3. adds it to Python path and continues

This keeps the system functional end-to-end while still using VectifyAI PageIndex for index generation.

