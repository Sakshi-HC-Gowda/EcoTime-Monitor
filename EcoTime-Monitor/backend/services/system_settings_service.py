"""
System Settings Service
=======================
PostgreSQL-backed persistence for simulation config, system status,
and ML training status (replaces in-memory module-level dicts).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from extensions import db
from models.system_setting import SystemSetting

logger = logging.getLogger(__name__)

_SIMULATION_DEFAULTS = {
    "zone": os.getenv("DEFAULT_ZONE", "US-CA"),
    "lowCarbonThreshold": float(os.getenv("LOW_CARBON_THRESHOLD", "180")),
    "baselineIntensity": float(os.getenv("BASELINE_INTENSITY", "380")),
    "simulationSpeed": int(os.getenv("SIMULATION_SPEED", "15")),
    "isSimulating": os.getenv("SIMULATION_MODE", "true").lower() == "true",
}

_SYSTEM_DEFAULTS = {
    "isActive": True,
    "updatedAt": None,
}

_TRAINING_DEFAULTS = {
    "running": False,
    "last_started": None,
    "last_finished": None,
    "error": None,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load(key: str, defaults: dict) -> dict:
    row = db.session.get(SystemSetting, key)
    if not row:
        return dict(defaults)
    try:
        stored = json.loads(row.value_json)
        merged = dict(defaults)
        merged.update(stored)
        return merged
    except (ValueError, TypeError):
        logger.warning("Invalid JSON for system setting %s — using defaults", key)
        return dict(defaults)


def _save(key: str, value: dict) -> dict:
    payload = json.dumps(value)
    row = db.session.get(SystemSetting, key)
    if row:
        row.value_json = payload
        row.updated_at = datetime.now(timezone.utc)
    else:
        db.session.add(SystemSetting(key=key, value_json=payload))
    db.session.commit()
    return value


def get_simulation_config() -> dict:
    return _load("simulation_config", _SIMULATION_DEFAULTS)


def set_simulation_config(updates: dict) -> dict:
    current = get_simulation_config()
    for field in ("zone", "lowCarbonThreshold", "baselineIntensity", "simulationSpeed", "isSimulating"):
        if field in updates:
            current[field] = updates[field]
    return _save("simulation_config", current)


def get_system_status() -> dict:
    return _load("system_status", _SYSTEM_DEFAULTS)


def set_system_status(is_active: bool) -> dict:
    value = {"isActive": bool(is_active), "updatedAt": _now_iso()}
    return _save("system_status", value)


def get_training_status() -> dict:
    return _load("ml_training_status", _TRAINING_DEFAULTS)


def set_training_status(updates: dict) -> dict:
    current = get_training_status()
    current.update(updates)
    return _save("ml_training_status", current)


def seed_defaults() -> None:
    """Ensure default rows exist on startup (idempotent)."""
    for key, defaults in (
        ("simulation_config", _SIMULATION_DEFAULTS),
        ("system_status", _SYSTEM_DEFAULTS),
        ("ml_training_status", _TRAINING_DEFAULTS),
    ):
        if not db.session.get(SystemSetting, key):
            db.session.add(SystemSetting(key=key, value_json=json.dumps(defaults)))
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to seed system settings")
