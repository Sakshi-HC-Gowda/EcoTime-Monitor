"""
Forecast Predictor
==================
Loads the trained best model and generates multi-hour carbon intensity forecasts.

If no trained model is found, falls back to the mathematical simulation model
(same as the frontend simulation) so the API always returns something useful.

Usage:
    predictor = ForecastPredictor()
    result = predictor.predict(zone_id='IN', horizon_hours=24)
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

# Add backend/ to path when running as script
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from forecast.feature_engineering import build_inference_features, get_feature_names

logger = logging.getLogger(__name__)

# Paths (relative to backend/data/)
DATA_DIR = _BACKEND_DIR / "data"
MODEL_PATH = DATA_DIR / "best_model.pkl"
REPORT_PATH = DATA_DIR / "training_report.json"


class ForecastPredictor:
    """
    Loads the trained model and generates carbon intensity forecasts.

    Falls back to simulation if:
    - No model file exists (training hasn't been run yet)
    - The model file is corrupted
    - Prediction fails for any other reason
    """

    def __init__(self) -> None:
        self._model = None
        self._feature_names: list[str] = get_feature_names()
        self._model_name: str = "simulation_fallback"
        self._trained_at: str | None = None
        self._load_model()

    def _load_model(self) -> None:
        """Attempt to load the trained model from disk."""
        if not MODEL_PATH.exists():
            logger.info("No trained model found at %s — using simulation fallback", MODEL_PATH)
            return

        try:
            import joblib
            artifact = joblib.load(MODEL_PATH)
            self._model = artifact["model"]
            self._feature_names = artifact.get("feature_names", get_feature_names())
            self._model_name = artifact.get("model_name", "unknown")
            self._trained_at = artifact.get("trained_at")
            logger.info(
                "Loaded trained model: %s (trained %s)",
                self._model_name, self._trained_at
            )
        except Exception as exc:
            logger.error("Failed to load model from %s: %s — using fallback", MODEL_PATH, exc)
            self._model = None

    def is_trained(self) -> bool:
        """Return True if a trained model is loaded."""
        return self._model is not None

    def predict(
        self,
        zone_id: str,
        horizon_hours: int = 24,
        history: list[dict] | None = None,
    ) -> list[dict]:
        """
        Generate an hourly carbon intensity forecast.

        Args:
            zone_id: Grid zone identifier
            horizon_hours: Number of hours to forecast ahead (default: 24)
            history: Optional list of {datetime, carbonIntensity} dicts.
                     If None, fetches fresh simulation data.

        Returns:
            List of {datetime, carbonIntensity, isML} dicts,
            one entry per hour for horizon_hours.
        """
        # Import here to avoid circular import at module level
        from services.carbon_service import generate_simulated_data

        if not history:
            # Get enough history for lag features (need 24+ hours)
            sim = generate_simulated_data(zone_id, offset_hours=0)
            history = sim["history"][-24:]

        if not self.is_trained():
            return self._simulation_forecast(zone_id, horizon_hours)

        try:
            return self._ml_forecast(history, zone_id, horizon_hours)
        except Exception as exc:
            logger.error("ML prediction failed: %s — falling back to simulation", exc)
            return self._simulation_forecast(zone_id, horizon_hours)

    def _ml_forecast(
        self,
        history: list[dict],
        zone_id: str,
        horizon_hours: int,
    ) -> list[dict]:
        """
        Recursive one-step-ahead ML prediction over horizon_hours.
        Each predicted value is appended to the rolling history window.
        """
        from services.carbon_service import generate_simulated_data

        # Build a rolling buffer (need 24+ points for lag features)
        buffer = list(history)
        predictions = []
        now = datetime.now(timezone.utc)

        for h in range(1, horizon_hours + 1):
            target_dt = now + timedelta(hours=h)

            try:
                feature_row = build_inference_features(
                    recent_history=buffer[-48:],  # Use last 48 points max
                    target_datetime=target_dt,
                )
                # Align feature columns to what the model was trained on
                feature_row = feature_row.reindex(columns=self._feature_names, fill_value=0)
                predicted_intensity = float(self._model.predict(feature_row)[0])
                predicted_intensity = max(5.0, round(predicted_intensity))
            except Exception as exc:
                logger.warning("Step %d prediction failed: %s — using simulation", h, exc)
                sim = generate_simulated_data(zone_id, offset_hours=h)
                predicted_intensity = sim["current"]["carbonIntensity"]

            predictions.append({
                "datetime": target_dt.isoformat(),
                "carbonIntensity": int(predicted_intensity),
                "isML": True,
            })

            # Append prediction to buffer for next iteration
            buffer.append({
                "datetime": target_dt.isoformat(),
                "carbonIntensity": predicted_intensity,
            })

        logger.info(
            "ML forecast for zone=%s horizon=%dh using model=%s",
            zone_id, horizon_hours, self._model_name,
        )
        return predictions

    def _simulation_forecast(self, zone_id: str, horizon_hours: int) -> list[dict]:
        """Fallback: use mathematical simulation model for forecasting."""
        from services.carbon_service import generate_simulated_data

        now = datetime.now(timezone.utc)
        predictions = []

        for h in range(1, horizon_hours + 1):
            sim = generate_simulated_data(zone_id, offset_hours=h)
            predictions.append({
                "datetime": (now + timedelta(hours=h)).isoformat(),
                "carbonIntensity": sim["current"]["carbonIntensity"],
                "isML": False,
            })

        return predictions

    def get_model_info(self) -> dict:
        """Return metadata about the currently loaded model."""
        report = {}
        if REPORT_PATH.exists():
            try:
                with open(REPORT_PATH) as f:
                    report = json.load(f)
            except Exception:
                pass

        return {
            "model_name": self._model_name,
            "is_trained": self.is_trained(),
            "trained_at": self._trained_at,
            "feature_count": len(self._feature_names),
            "metrics": report.get("final_metrics"),
            "cv_results": report.get("cv_results"),
        }


# Singleton predictor instance (loaded once on first import)
_predictor: ForecastPredictor | None = None


def get_predictor() -> ForecastPredictor:
    """Return the global singleton ForecastPredictor."""
    global _predictor
    if _predictor is None:
        _predictor = ForecastPredictor()
    return _predictor
