"""
EcoTime Optimization Package
Contains all carbon-aware scheduling algorithms.
"""

from .eco_score import calculate_eco_score, get_recommendation
from .window_ranking import rank_windows, calculate_window_score
from .greedy_scheduler import schedule_greedy
from .carbon_calculator import calculate_savings_grams, calculate_total_savings

__all__ = [
    "calculate_eco_score",
    "get_recommendation",
    "rank_windows",
    "calculate_window_score",
    "schedule_greedy",
    "calculate_savings_grams",
    "calculate_total_savings",
]
