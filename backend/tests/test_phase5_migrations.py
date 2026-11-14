from pathlib import Path

from app import create_app
from extensions import db, migrate


def test_startup_does_not_create_or_alter_schema(monkeypatch):
    create_all_called = False

    def fail_create_all(*_args, **_kwargs):
        nonlocal create_all_called
        create_all_called = True

    monkeypatch.setattr(db, "create_all", fail_create_all)
    app = create_app("testing")

    assert not create_all_called
    assert "migrate" in app.extensions
    assert app.extensions["migrate"].db is db


def test_phase5_migration_files_are_versioned():
    migrations_dir = Path(__file__).parents[1] / "migrations"
    revision_files = list((migrations_dir / "versions").glob("*.py"))

    assert revision_files
    assert (migrations_dir / "env.py").is_file()
    assert (migrations_dir / "alembic.ini").is_file()
    assert migrate is not None
