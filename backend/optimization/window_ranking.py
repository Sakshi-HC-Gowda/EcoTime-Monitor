"""
Green Window Ranking
====================
Scores and ranks detected green windows so the scheduler can
prioritise the most valuable time slots.

WindowScore formula:
  score = 0.5 × CarbonSaving% + 0.3 × UserConvenience + 0.2 × NormalisedDuration

Where NormalisedDuration = (window.duration / max_window_duration) × 100
"""

from __future__ import annotations


def calculate_window_score(
    carbon_saving_percent: float,
    user_convenience: float,
    duration_minutes: float,
    max_duration_minutes: float,
) -> float:
    """
    Calculate a composite score for a single green window.

    Args:
        carbon_saving_percent: Estimated CO2 savings percentage [0-100]
        user_convenience: User convenience score [0-100]
            (higher = more convenient for users, e.g. overnight hours)
        duration_minutes: Window duration in minutes
        max_duration_minutes: Maximum window duration across all windows (for normalisation)

    Returns:
        Window score in range [0, 100], rounded to 1 decimal place
    """
    normalised_duration = (
        (duration_minutes / max_duration_minutes) * 100.0
        if max_duration_minutes > 0
        else 0.0
    )
    score = (
        0.5 * carbon_saving_percent
        + 0.3 * user_convenience
        + 0.2 * normalised_duration
    )
    return round(score, 1)


def rank_windows(windows: list[dict]) -> list[dict]:
    """
    Score and rank all green windows, returning them sorted best-first.

    Args:
        windows: List of green window dicts, each with:
            - id (str)
            - startTime (ISO string)
            - duration (minutes)
            - avgCarbonIntensity (gCO2e/kWh)
            - carbonSavingPercent (float)
            - userConvenience (float)

    Returns:
        Sorted list of windows with 'score' and 'rank' fields added.
        Rank 1 = best window.
    """
    if not windows:
        return []

    max_duration = max((w.get("duration", 0) for w in windows), default=1)
    if max_duration <= 0:
        max_duration = 1

    scored = []
    for w in windows:
        score = calculate_window_score(
            carbon_saving_percent=w.get("carbonSavingPercent", 0.0),
            user_convenience=w.get("userConvenience", 0.0),
            duration_minutes=w.get("duration", 0.0),
            max_duration_minutes=max_duration,
        )
        scored.append({**w, "score": score})

    scored.sort(key=lambda x: x["score"], reverse=True)

    for rank, window in enumerate(scored, start=1):
        window["rank"] = rank

    return scored
