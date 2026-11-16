"""
Leaderboard Service
===================
Provides organization-level sustainability rankings.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from extensions import db
from models import SustainabilityScore, User


def resolve_user_display_name(user: User | None) -> str:
    """Return a non-sensitive configured name for leaderboard display."""
    if user is not None:
        display_name = " ".join(
            part.strip()
            for part in (user.first_name, user.last_name)
            if isinstance(part, str) and part.strip()
        )
        if display_name:
            return display_name
    return "EcoTime Member"


def get_organization_leaderboard(
    organization_id: str,
) -> list[dict]:
    """
    Return users in an organization ordered by sustainability score.
    """

    scores = (
    SustainabilityScore.query
    .filter(
        SustainabilityScore.organization_id == organization_id,
        SustainabilityScore.leaderboard_opt_in.is_(True),
    )
    .order_by(
        SustainabilityScore.score.desc(),
        SustainabilityScore.total_points.desc(),
    )
    .all()
  )

    leaderboard = []

    for rank, score in enumerate(scores, start=1):
        user = User.query.filter_by(id=int(score.user_id)).first() if str(score.user_id).isdigit() else None
        leaderboard.append({
            "rank": rank,
            "userId": score.user_id,
            "displayName": resolve_user_display_name(user),
            "score": score.score,
            "totalPoints": score.total_points,
            "currentStreak": score.current_streak,
            "longestStreak": score.longest_streak,
        })

    return leaderboard


def get_global_leaderboard() -> list[dict]:
    """Return one aggregate entry per organization."""
    if not global_consent_column_available():
        return []
    organizations = db.session.execute(text("""
        SELECT
            o.name AS organization_name,
            AVG(s.score) AS average_score,
            AVG(s.total_points) AS average_eco_points,
            COUNT(*) AS participating_members
        FROM sustainability_scores AS s
        JOIN users AS u
          ON s.user_id = CAST(u.id AS VARCHAR)
        JOIN organizations AS o
          ON o.id = u.organization_id
        WHERE s.global_leaderboard_opt_in IS TRUE
          AND s.organization_id = CAST(u.organization_id AS VARCHAR)
        GROUP BY o.id, o.name
        ORDER BY average_score DESC, average_eco_points DESC, o.name ASC
    """)).mappings().all()

    return [
        {
            "rank": rank,
            "organizationName": organization["organization_name"],
            "averageScore": float(organization["average_score"]),
            "averageEcoPoints": float(organization["average_eco_points"]),
            "participatingMembers": int(organization["participating_members"]),
        }
        for rank, organization in enumerate(organizations, start=1)
    ]


def global_consent_column_available() -> bool:
    return any(
        column["name"] == "global_leaderboard_opt_in"
        for column in inspect(db.engine).get_columns("sustainability_scores")
    )