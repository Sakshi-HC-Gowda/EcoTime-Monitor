"""Standalone worker for scheduled local file storage operations.

Run one or more copies with ``python worker.py``. PostgreSQL row locking lets
multiple worker copies claim separate due registrations safely.
"""

from __future__ import annotations

import logging
import os
import time

from app import create_app
from services.upload_service import process_due_uploads


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


def main() -> None:
    app = create_app(os.getenv("FLASK_ENV", "production"))
    interval = max(1, int(os.getenv("UPLOAD_WORKER_POLL_SECONDS", "5")))
    batch_size = max(1, int(os.getenv("UPLOAD_WORKER_BATCH_SIZE", "25")))
    logger.info("Scheduled upload worker started; poll=%ss batch=%s", interval, batch_size)
    while True:
        with app.app_context():
            try:
                count = process_due_uploads(batch_size)
                if count:
                    logger.info("Stored %s due upload(s)", count)
            except Exception:
                logger.exception("Scheduled upload polling failed")
        time.sleep(interval)


if __name__ == "__main__":
    main()
