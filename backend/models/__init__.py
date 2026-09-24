"""
EcoTime Database Models Package
================================
Exports all SQLAlchemy models so app.py can call db.create_all()
after a single import.
"""

from .activity import Activity
from .activity_history import ActivityHistory
from .analytics_recommendation import AnalyticsRecommendation
from .simulation_config import SimulationConfig
from .eco_point_transaction import EcoPointTransaction
from .sustainability_score import SustainabilityScore
from .badge import Badge

__all__ = ["Activity", "ActivityHistory", "AnalyticsRecommendation", "SimulationConfig", "EcoPointTransaction", "SustainabilityScore", "Badge"]
