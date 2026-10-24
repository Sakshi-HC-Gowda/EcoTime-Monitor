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
import math
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
        if not history:
            if self.is_trained():
                raise ValueError("A trained forecast requires observed history data")

        if not self.is_trained():
            return self._simulation_forecast(zone_id, horizon_hours)

        self._validate_history(history)
        predictions = self._ml_forecast(history, zone_id, horizon_hours)
        self._validate_forecast(predictions, horizon_hours)
        return predictions

    @staticmethod
    def _validate_history(history: list[dict]) -> None:
        if len(history) < 24:
            raise ValueError("A trained forecast requires at least 24 hourly history points")

        previous: datetime | None = None
        for point in history:
            if not isinstance(point, dict):
                raise ValueError("Forecast history contains an invalid point")
            try:
                raw_intensity = point["carbonIntensity"]
                if isinstance(raw_intensity, bool):
                    raise ValueError("boolean intensity is invalid")
                intensity = float(raw_intensity)
                timestamp = datetime.fromisoformat(
                    str(point["datetime"]).replace("Z", "+00:00")
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError("Forecast history contains an invalid point") from exc
            if not math.isfinite(intensity) or intensity < 0:
                raise ValueError("Forecast history contains an invalid intensity")
            if timestamp.tzinfo is None:
                raise ValueError("Forecast history timestamps must include a timezone")
            timestamp = timestamp.astimezone(timezone.utc)
            if previous is not None:
                elapsed_seconds = (timestamp - previous).total_seconds()
                if abs(elapsed_seconds - 3600) > 60:
                    raise ValueError("Forecast history must be hourly and strictly increasing")
            previous = timestamp

    @staticmethod
    def _validate_forecast(forecast: list[dict], horizon_hours: int) -> None:
        if len(forecast) != horizon_hours:
            raise ValueError("Forecast model returned an incomplete horizon")
        previous: datetime | None = None
        for point in forecast:
            try:
                raw_intensity = point["carbonIntensity"]
                if isinstance(raw_intensity, bool):
                    raise ValueError("boolean intensity is invalid")
                intensity = float(raw_intensity)
                timestamp = datetime.fromisoformat(
                    str(point["datetime"]).replace("Z", "+00:00")
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError("Forecast model returned an invalid point") from exc
            if not math.isfinite(intensity) or intensity < 0:
                raise ValueError("Forecast model returned an invalid intensity")
            if timestamp.tzinfo is None:
                raise ValueError("Forecast model timestamps must include a timezone")
            timestamp = timestamp.astimezone(timezone.utc)
            if previous is not None:
                elapsed_seconds = (timestamp - previous).total_seconds()
                if abs(elapsed_seconds - 3600) > 60:
                    raise ValueError("Forecast model timestamps must be hourly and strictly increasing")
            previous = timestamp

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
        # Build a rolling buffer (need 24+ points for lag features)
        buffer = list(history)
        predictions = []
        now = datetime.now(timezone.utc)

        for h in range(1, horizon_hours + 1):
            target_dt = now + timedelta(hours=h)

            feature_row = build_inference_features(
                recent_history=buffer[-48:],  # Use last 48 points max
                target_datetime=target_dt,
                zone_id=zone_id,
            )
            feature_row = feature_row.reindex(columns=self._feature_names)
            if feature_row.isna().any().any():
                raise ValueError(f"Forecast feature row {h} contains missing values")
            predicted_intensity = float(self._model.predict(feature_row)[0])
            if not math.isfinite(predicted_intensity) or predicted_intensity < 0:
                raise ValueError(f"Forecast model returned an invalid value at step {h}")
            predicted_intensity = round(predicted_intensity)

            predictions.append({
                "datetime": target_dt.isoformat(),
                "carbonIntensity": int(predicted_intensity),
                "isML": True,
            })

            # Append prediction to buffer for next iteration
            buffer.append({
                "datetime": target_dt.isoformat(),
                "zone": zone_id,
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
