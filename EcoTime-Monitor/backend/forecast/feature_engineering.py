"""
Feature Engineering
===================
Transforms a cleaned carbon intensity time series into a feature matrix
suitable for supervised ML (regression) forecasting.

Features created:
    Time features:
        hour            — Hour of day (0-23)
        day_of_week     — Day of week (0=Mon, 6=Sun)
        month           — Month of year (1-12)
        is_weekend      — Binary flag (1=Sat/Sun)
        hour_sin/cos    — Cyclic encoding of hour
        dow_sin/cos     — Cyclic encoding of day-of-week

    Lag features (previous values):
        lag_1h          — Intensity 1 hour ago
        lag_2h          — Intensity 2 hours ago
        lag_6h          — Intensity 6 hours ago
        lag_12h         — Intensity 12 hours ago
        lag_24h         — Intensity 24 hours ago (same time yesterday)

    Rolling statistics:
        rolling_mean_3h  — Rolling mean over last 3 hours
        rolling_mean_6h  — Rolling mean over last 6 hours
        rolling_mean_12h — Rolling mean over last 12 hours
        rolling_std_3h   — Rolling std-dev over last 3 hours
        rolling_std_6h   — Rolling std-dev over last 6 hours

Target column: 'target' = carbonIntensity shifted 1h forward (next hour prediction)
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Feature column names (exported for use in train/predict)
LAG_FEATURES = ["lag_1h", "lag_2h", "lag_6h", "lag_12h", "lag_24h"]
ROLLING_FEATURES = [
    "rolling_mean_3h", "rolling_mean_6h", "rolling_mean_12h",
    "rolling_std_3h", "rolling_std_6h",
]
TIME_FEATURES = [
    "hour", "day_of_week", "month", "is_weekend",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
]
ALL_FEATURES = TIME_FEATURES + LAG_FEATURES + ROLLING_FEATURES


def build_features(
    df: pd.DataFrame,
    target_shift_hours: int = 1,
    drop_na: bool = True,
) -> pd.DataFrame:
    """
    Build the full feature + target DataFrame from a cleaned time series.

    Args:
        df: Cleaned DataFrame with DatetimeIndex and 'carbonIntensity' column.
            Index must be hourly (or close to it).
        target_shift_hours: Forecast horizon — how many hours ahead to predict.
            Default 1 (next-hour prediction).
        drop_na: If True (default), rows with NaN due to lag/rolling windows
                 are dropped. Set to False during inference to preserve rows.

    Returns:
        DataFrame with ALL_FEATURES columns plus 'target' column.
        The target represents future carbonIntensity at +target_shift_hours.
    """
    feat = pd.DataFrame(index=df.index)
    ci = df["carbonIntensity"]

    # --- Time features ---
    feat["hour"] = feat.index.hour
    feat["day_of_week"] = feat.index.dayofweek
    feat["month"] = feat.index.month
    feat["is_weekend"] = (feat.index.dayofweek >= 5).astype(int)

    # Cyclic encoding (avoids the discontinuity at midnight / Sunday)
    feat["hour_sin"] = np.sin(2 * np.pi * feat["hour"] / 24)
    feat["hour_cos"] = np.cos(2 * np.pi * feat["hour"] / 24)
    feat["dow_sin"] = np.sin(2 * np.pi * feat["day_of_week"] / 7)
    feat["dow_cos"] = np.cos(2 * np.pi * feat["day_of_week"] / 7)

    # --- Lag features ---
    feat["lag_1h"] = ci.shift(1)
    feat["lag_2h"] = ci.shift(2)
    feat["lag_6h"] = ci.shift(6)
    feat["lag_12h"] = ci.shift(12)
    feat["lag_24h"] = ci.shift(24)

    # --- Rolling statistics (min_periods avoids NaN for full-length windows) ---
    feat["rolling_mean_3h"] = ci.shift(1).rolling(window=3, min_periods=1).mean()
    feat["rolling_mean_6h"] = ci.shift(1).rolling(window=6, min_periods=1).mean()
    feat["rolling_mean_12h"] = ci.shift(1).rolling(window=12, min_periods=1).mean()
    feat["rolling_std_3h"] = ci.shift(1).rolling(window=3, min_periods=2).std().fillna(0)
    feat["rolling_std_6h"] = ci.shift(1).rolling(window=6, min_periods=2).std().fillna(0)

    # --- Target: next N-hour intensity ---
    feat["target"] = ci.shift(-target_shift_hours)

    if drop_na:
        before = len(feat)
        feat = feat.dropna()
        after = len(feat)
        if before > after:
            logger.debug(
                "Dropped %d rows with NaN during feature build (lag/rolling warmup)", before - after
            )

    logger.info("Feature matrix built: %d rows × %d features", len(feat), len(ALL_FEATURES))
    return feat


def get_feature_names() -> list[str]:
    """Return the ordered list of feature column names used by the model."""
    return list(ALL_FEATURES)


def build_inference_features(
    recent_history: list[dict],
    target_datetime: "pd.Timestamp | None" = None,
) -> pd.DataFrame:
    """
    Build feature row(s) for model inference (no target column).

    Args:
        recent_history: List of {datetime, carbonIntensity} dicts
            sorted oldest-first. Should have at least 24 entries for full features.
        target_datetime: The datetime to predict for. If None, uses the last
            historical timestamp + 1 hour.

    Returns:
        Single-row DataFrame with ALL_FEATURES columns, ready for model.predict()
    """
    if not recent_history:
        raise ValueError("recent_history must be non-empty")

    # Build a temp series from history
    records = pd.DataFrame(recent_history)
    records["datetime"] = pd.to_datetime(records["datetime"], utc=True)
    records = records.set_index("datetime").sort_index()
    records = records[["carbonIntensity"]].astype(float)

    # Build features (no drop_na — we need the last row)
    feat = build_features(records, target_shift_hours=1, drop_na=False)

    # Return only the last row (inference point)
    inference_row = feat.tail(1)[ALL_FEATURES]
    return inference_row
