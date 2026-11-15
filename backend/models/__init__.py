"""
EcoTime Database Models Package
================================
Exports all SQLAlchemy models so SQLAlchemy and Alembic register the
complete metadata after a single import.
"""

from .activity import Activity
from .activity_history import ActivityHistory
from .analytics_recommendation import AnalyticsRecommendation
from .organization import Organization
from .organization_member import OrganizationMember
from .organization_invitation import OrganizationInvitation
from .organization_provider_credential import OrganizationProviderCredential
from .role import Role
from .simulation_config import SimulationConfig
from .eco_point_transaction import EcoPointTransaction
from .sustainability_score import SustainabilityScore
from .badge import Badge
from .user import User
from .upload_registration import UploadRegistration

__all__ = [
    "Activity",
    "ActivityHistory",
    "AnalyticsRecommendation",
    "Organization",
    "OrganizationMember",
    "OrganizationInvitation",
    "OrganizationProviderCredential",
    "Role",
    "SimulationConfig",
    "EcoPointTransaction",
    "SustainabilityScore",
    "Badge",
    "User",
    "UploadRegistration",
]
