"""
Data Preprocessing
==================
Cleans raw carbon intensity data before ML feature engineering:
  - Remove nulls / NaNs
  - Cap outliers using IQR fencing
  - Enforce minimum valid intensity (≥ 5 gCO2e/kWh)
  - Enforce monotonic datetime index
  - Fill small gaps by linear interpolation

Input/output:
    pandas DataFrame with columns: ['datetime', 'carbonIntensity']
    datetime column must be parseable by pd.to_datetime()
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_MIN_INTENSITY = 5.0      # Physical minimum (g CO2e/kWh)
_MAX_INTENSITY = 1200.0   # Hard cap (no real grid exceeds this)
_IQR_FENCE = 3.0          # Fence multiplier for outlier detection
_MAX_INTERP_GAP = 6       # Max consecutive NaN rows to fill via interpolation


def clean_carbon_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean a raw carbon intensity DataFrame.

    Args:
        df: DataFrame with at least:
            'datetime' (str or datetime) and
            'carbonIntensity' (numeric)

    Returns:
        Cleaned DataFrame indexed by UTC datetime, sorted ascending,
        with column 'carbonIntensity' (float).

    Raises:
        ValueError: If required columns are missing or no valid rows remain.
    """
    required_cols = {"datetime", "carbonIntensity"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df = df.copy()

    # --- 1. Parse datetime and set as index ---
    df["datetime"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
    n_bad_dates = df["datetime"].isna().sum()
    if n_bad_dates > 0:
        logger.warning("Dropping %d rows with unparseable datetime values", n_bad_dates)
    df = df.dropna(subset=["datetime"])
    df = df.set_index("datetime").sort_index()

    # Remove duplicate timestamps (keep last)
    n_dupes = df.index.duplicated().sum()
    if n_dupes > 0:
        logger.warning("Removing %d duplicate timestamps", n_dupes)
        df = df[~df.index.duplicated(keep="last")]

    # --- 2. Coerce carbonIntensity to numeric ---
    df["carbonIntensity"] = pd.to_numeric(df["carbonIntensity"], errors="coerce")

    # --- 3. Hard physical bounds ---
    n_below = (df["carbonIntensity"] < _MIN_INTENSITY).sum()
    n_above = (df["carbonIntensity"] > _MAX_INTENSITY).sum()
    if n_below > 0:
        logger.debug("Clamping %d values below %s g/kWh", n_below, _MIN_INTENSITY)
    if n_above > 0:
        logger.debug("Clamping %d values above %s g/kWh", n_above, _MAX_INTENSITY)

    df["carbonIntensity"] = df["carbonIntensity"].clip(
        lower=_MIN_INTENSITY, upper=_MAX_INTENSITY
    )

    # --- 4. IQR-based outlier removal (replace with NaN, then interpolate) ---
    q1 = df["carbonIntensity"].quantile(0.25)
    q3 = df["carbonIntensity"].quantile(0.75)
    iqr = q3 - q1
    lower_fence = max(_MIN_INTENSITY, q1 - _IQR_FENCE * iqr)
    upper_fence = min(_MAX_INTENSITY, q3 + _IQR_FENCE * iqr)

    outlier_mask = (
        (df["carbonIntensity"] < lower_fence) | (df["carbonIntensity"] > upper_fence)
    )
    n_outliers = outlier_mask.sum()
    if n_outliers > 0:
        logger.warning(
            "Flagging %d outliers outside IQR fence [%.1f, %.1f] → will interpolate",
            n_outliers, lower_fence, upper_fence
        )
        df.loc[outlier_mask, "carbonIntensity"] = np.nan

    # --- 5. Interpolate small gaps ---
    df["carbonIntensity"] = df["carbonIntensity"].interpolate(
        method="time", limit=_MAX_INTERP_GAP, limit_direction="both"
    )

    # --- 6. Drop rows that are still NaN after interpolation ---
    n_remaining_nans = df["carbonIntensity"].isna().sum()
    if n_remaining_nans > 0:
        logger.warning("Dropping %d rows where interpolation could not fill NaN", n_remaining_nans)
        df = df.dropna(subset=["carbonIntensity"])

    if df.empty:
        raise ValueError("No valid rows remain after cleaning — check input data")

    logger.info("Preprocessing complete: %d rows, intensity range [%.0f, %.0f]",
                len(df), df["carbonIntensity"].min(), df["carbonIntensity"].max())

    return df[["carbonIntensity"]].astype(float)


def validate_dataframe(df: pd.DataFrame) -> dict:
    """
    Run basic quality checks and return a report dict.
    Useful for debugging and API diagnostics.
    """
    report = {
        "total_rows": len(df),
        "null_count": int(df["carbonIntensity"].isna().sum()) if "carbonIntensity" in df.columns else -1,
        "min_intensity": float(df["carbonIntensity"].min()) if "carbonIntensity" in df.columns else None,
        "max_intensity": float(df["carbonIntensity"].max()) if "carbonIntensity" in df.columns else None,
        "mean_intensity": float(df["carbonIntensity"].mean()) if "carbonIntensity" in df.columns else None,
    }
    return report
