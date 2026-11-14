"""
Leaderboard Service
===================
Provides organization-level sustainability rankings.
"""

from __future__ import annotations

from models import SustainabilityScore, User


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
        display_name = (
            " ".join(
                part for part in (user.first_name, user.last_name)
                if part and part.strip()
            ).strip()
            if user
            else None
        )
        leaderboard.append({
            "rank": rank,
            "userId": score.user_id,
            "displayName": display_name,
            "score": score.score,
            "totalPoints": score.total_points,
            "currentStreak": score.current_streak,
            "longestStreak": score.longest_streak,
        })

    return leaderboard