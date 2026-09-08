"""Analytics event helpers.

Recommendation events are currently emitted through the backend logger.  The
function is deliberately isolated here so it can later be connected to an
analytics store without changing API routes or scheduling logic.
"""

from __future__ import annotations

import logging

from extensions import db
from models.analytics_recommendation import AnalyticsRecommendation
logger = logging.getLogger(__name__)


def log_recommendation(
    *,
    text: str,
    reason: str,
    expected_carbon_saving: float | None,
    expected_energy_saving: float | None,
    status: str,
    activity_id: str | None = None,
) -> dict:
    """Persist a recommendation event in PostgreSQL and return its payload."""
    event = AnalyticsRecommendation(
        activity_id=activity_id,
        text=str(text),
        reason=str(reason),
        expected_carbon_saving=expected_carbon_saving,
        expected_energy_saving=expected_energy_saving,
        status=str(status),
    )
    db.session.add(event)
    db.session.commit()
    payload = event.to_dict()
    logger.info("Recommendation event persisted: %s", payload)
    return payload
