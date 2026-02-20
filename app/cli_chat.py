from __future__ import annotations

import logging

from .query_engine import QueryEngine

logger = logging.getLogger(__name__)


def run_cli_chat() -> None:
    print("\nPageIndex CLI Chat")
    print("Type your question and press Enter. Type 'exit' to quit.\n")

    engine = QueryEngine()

    while True:
        user_input = input("You: ").strip()
        if user_input.lower() == "exit":
            print("Goodbye.")
            break
        if not user_input:
            print("Please enter a non-empty question.")
            continue

        try:
            result = engine.query(user_input)
            print(f"Assistant: {result.answer}")
            print(f"(latency: {result.latency_ms} ms)\n")
        except Exception as exc:
            logger.exception("CLI query failed")
            print(f"Error: {exc}\n")

