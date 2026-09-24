"""
Leaderboard Service
===================
Provides organization-level sustainability rankings.
"""

from __future__ import annotations

from models import SustainabilityScore


def get_organization_leaderboard(
    organization_id: str,
) -> list[dict]:
    """
    Return users in an organization ordered by sustainability score.
    """

    scores = (
        SustainabilityScore.query
        .filter_by(organization_id=organization_id)
        .order_by(
            SustainabilityScore.score.desc(),
            SustainabilityScore.total_points.desc(),
        )
        .all()
    )

    leaderboard = []

    for rank, score in enumerate(scores, start=1):
        leaderboard.append({
            "rank": rank,
            "userId": score.user_id,
            "score": score.score,
            "totalPoints": score.total_points,
            "currentStreak": score.current_streak,
            "longestStreak": score.longest_streak,
        })

    return leaderboard