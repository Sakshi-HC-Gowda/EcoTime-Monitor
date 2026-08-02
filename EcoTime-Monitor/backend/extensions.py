"""
Flask Extensions
==================
Holds shared extension instances (currently just SQLAlchemy) in a module
that nothing else needs to import indirectly through app.py.

Why this file exists: if models/services import `db` via `from app import db`,
and the app is launched with `python app.py`, Python loads app.py twice —
once as `__main__` (the running script) and once as `app` (a fresh import
triggered by `from app import db`) — creating two separate SQLAlchemy
instances, only one of which is ever wired up with `db.init_app(app)`.
That mismatch causes:
    RuntimeError: The current Flask app is not registered with this
    'SQLAlchemy' instance.

Importing `db` from this neutral module instead avoids the double-import
entirely, regardless of how the app is launched (`python app.py`,
`python -m app`, `flask run`, gunicorn, etc.).
"""

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
