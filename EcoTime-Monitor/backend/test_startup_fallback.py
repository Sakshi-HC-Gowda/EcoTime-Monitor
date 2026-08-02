import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import create_app


def test_create_app_falls_back_to_sqlite_when_postgres_unavailable():
    os.environ.pop("DATABASE_URL", None)
    app = create_app(config_name="development")
    assert app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite")
    assert app.config["TESTING"] is False
