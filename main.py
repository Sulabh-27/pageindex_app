from __future__ import annotations

import logging
import sys

import uvicorn

from app.cli_chat import run_cli_chat
from app.index_manager import PageIndexManager


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    )


def start_api_server() -> None:
    uvicorn.run("app.api:app", host="0.0.0.0", port=8000, reload=False)


def rebuild_index() -> None:
    manager = PageIndexManager.get_instance()
    manager.rebuild_index()
    print("Index rebuilt successfully.")


def main() -> None:
    configure_logging()

    menu = (
        "\nPageIndex Document Q&A\n"
        "1 -> Start API server\n"
        "2 -> Start CLI chat\n"
        "3 -> Rebuild index\n"
        "Select an option: "
    )

    choice = input(menu).strip()

    try:
        if choice == "1":
            start_api_server()
        elif choice == "2":
            run_cli_chat()
        elif choice == "3":
            rebuild_index()
        else:
            print("Invalid option. Please run again and select 1, 2, or 3.")
    except Exception as exc:
        logging.getLogger(__name__).exception("Application error")
        print(f"Error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()

