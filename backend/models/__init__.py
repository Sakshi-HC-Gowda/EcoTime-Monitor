"""
EcoTime Database Models Package
================================
Exports all SQLAlchemy models so app.py can call db.create_all()
after a single import.
"""

from .activity import Activity

__all__ = ["Activity"]
