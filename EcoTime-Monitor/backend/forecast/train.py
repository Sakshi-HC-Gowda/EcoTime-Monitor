"""
Model Training
==============
Trains three ML models on synthetic carbon intensity data and selects
the best one based on validation MAE (TimeSeriesSplit cross-validation):

  1. Linear Regression   — Fast baseline
  2. Random Forest       — Handles non-linearity, robust
  3. XGBoost             — Gradient boosting, typically best performer

Training data is generated using the zone simulation engine so that
training works immediately without any external data requirements.

The best model is saved to: backend/data/best_model.pkl
A training report is saved to: backend/data/training_report.json

Usage:
    python forecast/train.py                    # Train on all zones
    python forecast/train.py --zone IN          # Train on specific zone
    python forecast/train.py --hours 2000       # Custom dataset size
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# XGBoost is optional — graceful fallback if not installed
try:
    from xgboost import XGBRegressor
    _XGBOOST_AVAILABLE = True
except ImportError:
    _XGBOOST_AVAILABLE = False

# Add backend/ to path so imports work when run as a script
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from forecast.preprocessing import clean_carbon_data
from forecast.feature_engineering import build_features, get_feature_names
from services.carbon_service import generate_simulated_data

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

DATA_DIR = _BACKEND_DIR / "data"
MODEL_PATH = DATA_DIR / "best_model.pkl"
REPORT_PATH = DATA_DIR / "training_report.json"

# ---------------------------------------------------------------------------
# Data Generation
# ---------------------------------------------------------------------------

_ZONES_FOR_TRAINING = ["US-CA", "IN", "DK-DK2", "GB", "FR", "DE"]


def generate_training_data(hours: int = 8760, zones: list[str] | None = None) -> pd.DataFrame:
    """
    Generate a large synthetic dataset spanning multiple zones and time offsets.

    Args:
        hours: Number of hourly data points per zone (default 8760 = 1 year)
        zones: List of zone IDs to include (default: all 6 zones)

    Returns:
        DataFrame with DatetimeIndex and 'carbonIntensity' column.
    """
    zones = zones or _ZONES_FOR_TRAINING
    frames = []

    for zone_id in zones:
        logger.info("Generating %d hours of data for zone %s", hours, zone_id)
        records = []
        # Start from 1 year ago so we get a full calendar cycle
        start = datetime.now(timezone.utc) - timedelta(hours=hours)
        for h in range(hours):
            offset = h - hours  # negative offset = past
            data = generate_simulated_data(zone_id, offset_hours=offset)
            records.append({
                "datetime": data["current"]["datetime"],
                "carbonIntensity": data["current"]["carbonIntensity"],
            })
        frames.append(pd.DataFrame(records))

    combined = pd.concat(frames, ignore_index=True)
    logger.info("Combined training dataset: %d rows across %d zones", len(combined), len(zones))
    return combined


# ---------------------------------------------------------------------------
# Evaluation Helpers
# ---------------------------------------------------------------------------

def _evaluate(y_true: np.ndarray, y_pred: np.ndarray, model_name: str) -> dict:
    """Compute MAE, RMSE, R² for a prediction array."""
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    logger.info(
        "%-22s → MAE=%.2f  RMSE=%.2f  R²=%.4f",
        model_name, mae, rmse, r2
    )
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "r2": round(r2, 4)}


def _cross_validate(model, X: pd.DataFrame, y: pd.Series, n_splits: int = 5) -> dict:
    """
    TimeSeriesSplit cross-validation. Returns mean metrics across all folds.
    """
    tscv = TimeSeriesSplit(n_splits=n_splits)
    fold_maes, fold_rmses, fold_r2s = [], [], []

    for fold_idx, (train_idx, val_idx) in enumerate(tscv.split(X)):
        X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_tr, y_val = y.iloc[train_idx], y.iloc[val_idx]

        model.fit(X_tr, y_tr)
        y_pred = model.predict(X_val)

        fold_maes.append(mean_absolute_error(y_val, y_pred))
        fold_rmses.append(np.sqrt(mean_squared_error(y_val, y_pred)))
        fold_r2s.append(r2_score(y_val, y_pred))

    return {
        "mae": round(float(np.mean(fold_maes)), 4),
        "rmse": round(float(np.mean(fold_rmses)), 4),
        "r2": round(float(np.mean(fold_r2s)), 4),
        "n_splits": n_splits,
    }


# ---------------------------------------------------------------------------
# Main Training Loop
# ---------------------------------------------------------------------------

def train(hours: int = 4380, zones: list[str] | None = None) -> dict:
    """
    Full training pipeline.

    Args:
        hours: Synthetic data hours per zone (default 4380 ≈ 6 months)
        zones: Zone list (default all 6 training zones)

    Returns:
        Training report dict with per-model metrics and best model info.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Generate data
    t0 = time.perf_counter()
    raw_df = generate_training_data(hours=hours, zones=zones)

    # 2. Preprocess
    clean_df = clean_carbon_data(raw_df)

    # 3. Feature engineering
    feat_df = build_features(clean_df, target_shift_hours=1, drop_na=True)
    feature_cols = get_feature_names()
    X = feat_df[feature_cols]
    y = feat_df["target"]

    logger.info("Training set: %d samples × %d features", len(X), len(feature_cols))

    # 4. Define candidate models
    candidates: dict[str, object] = {
        "LinearRegression": Pipeline([
            ("scaler", StandardScaler()),
            ("model", LinearRegression()),
        ]),
        "RandomForest": RandomForestRegressor(
            n_estimators=100,
            max_depth=12,
            min_samples_leaf=5,
            n_jobs=-1,
            random_state=42,
        ),
    }

    if _XGBOOST_AVAILABLE:
        candidates["XGBoost"] = XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            verbosity=0,
        )
    else:
        logger.warning("XGBoost not available — skipping. Install with: pip install xgboost")

    # 5. Cross-validate each model
    results: dict[str, dict] = {}
    best_name: str = ""
    best_mae = float("inf")
    best_model = None

    for name, model in candidates.items():
        logger.info("Cross-validating %s …", name)
        metrics = _cross_validate(model, X, y, n_splits=5)
        results[name] = metrics
        logger.info(
            "%s CV → MAE=%.2f RMSE=%.2f R²=%.4f",
            name, metrics["mae"], metrics["rmse"], metrics["r2"]
        )

        if metrics["mae"] < best_mae:
            best_mae = metrics["mae"]
            best_name = name
            best_model = model

    logger.info("Best model: %s (CV MAE=%.2f)", best_name, best_mae)

    # 6. Retrain best model on full dataset
    logger.info("Retraining %s on full dataset …", best_name)
    best_model.fit(X, y)  # type: ignore[union-attr]

    # 7. Full-dataset evaluation
    y_pred_full = best_model.predict(X)  # type: ignore[union-attr]
    final_metrics = _evaluate(y.values, y_pred_full, f"{best_name} (full)")

    # 8. Persist model
    model_artifact = {
        "model": best_model,
        "feature_names": feature_cols,
        "model_name": best_name,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(model_artifact, MODEL_PATH)
    logger.info("Model saved to: %s", MODEL_PATH)

    # 9. Save training report
    elapsed = time.perf_counter() - t0
    report = {
        "best_model": best_name,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_samples": len(X),
        "feature_count": len(feature_cols),
        "features": feature_cols,
        "training_hours_per_zone": hours,
        "zones": zones or _ZONES_FOR_TRAINING,
        "elapsed_seconds": round(elapsed, 2),
        "cv_results": results,
        "final_metrics": final_metrics,
    }
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)
    logger.info("Training report saved to: %s", REPORT_PATH)
    logger.info("Training complete in %.1fs", elapsed)

    return report


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train EcoTime ML forecast model")
    parser.add_argument("--hours", type=int, default=4380, help="Training data hours per zone")
    parser.add_argument("--zone", type=str, default=None, help="Single zone ID to train on")
    args = parser.parse_args()

    zones = [args.zone] if args.zone else None
    report = train(hours=args.hours, zones=zones)
    print(f"\n✅ Training complete. Best model: {report['best_model']}")
    print(f"   MAE={report['final_metrics']['mae']:.2f}  "
          f"RMSE={report['final_metrics']['rmse']:.2f}  "
          f"R²={report['final_metrics']['r2']:.4f}")
