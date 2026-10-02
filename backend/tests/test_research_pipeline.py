from __future__ import annotations

import math
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from sklearn.model_selection import TimeSeriesSplit

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from forecast.feature_engineering import build_features, get_feature_names
from forecast.preprocessing import clean_carbon_data
from forecast.train import order_features_for_timeseries
from services.activity_service import (
    _calculate_carbon_grams,
    _calculate_energy_kwh,
    _calculate_savings,
)
from services.carbon_service import detect_green_windows


class ResearchPipelineTests(unittest.TestCase):
    def test_zone_isolation_for_lag_rolling_and_target(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        rows = []
        for zone, base in [("A", 100), ("B", 1000)]:
            for hour in range(30):
                rows.append(
                    {
                        "datetime": start + timedelta(hours=hour),
                        "zone": zone,
                        "carbonIntensity": base + hour,
                    }
                )

        cleaned = clean_carbon_data(pd.DataFrame(rows))
        features = build_features(cleaned, drop_na=False)
        zone_b = features[features["zone"] == "B"]

        self.assertTrue(math.isnan(zone_b.iloc[0]["lag_1h"]))
        self.assertTrue(math.isnan(zone_b.iloc[0]["rolling_mean_3h"]))
        self.assertEqual(zone_b.iloc[1]["lag_1h"], 1000)
        self.assertEqual(zone_b.iloc[24]["lag_24h"], 1000)
        self.assertEqual(zone_b.iloc[0]["target"], 1001)

    def test_zone_features_preserve_row_order_when_zones_are_interleaved(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        rows = []
        for hour in range(4):
            rows.append(
                {
                    "datetime": start + timedelta(hours=hour),
                    "zone": "A",
                    "carbonIntensity": 10 + hour,
                }
            )
            rows.append(
                {
                    "datetime": start + timedelta(hours=hour),
                    "zone": "B",
                    "carbonIntensity": 100 + hour,
                }
            )

        df = pd.DataFrame(rows).set_index("datetime")
        features = build_features(df, drop_na=False)

        self.assertTrue(math.isnan(features.iloc[0]["lag_1h"]))
        self.assertTrue(math.isnan(features.iloc[1]["lag_1h"]))
        self.assertEqual(features.iloc[2]["lag_1h"], 10)
        self.assertEqual(features.iloc[3]["lag_1h"], 100)
        self.assertEqual(features.iloc[4]["rolling_mean_3h"], 10.5)
        self.assertEqual(features.iloc[5]["rolling_mean_3h"], 100.5)

    def test_activity_energy_carbon_and_savings_math(self) -> None:
        energy = _calculate_energy_kwh(500, 60)
        self.assertEqual(energy, 0.5)
        self.assertEqual(_calculate_carbon_grams(energy, 400), 200)

        savings = _calculate_savings(
            energy_kwh=0.5,
            baseline_intensity=600,
            optimized_intensity=400,
        )
        self.assertEqual(savings["baselineCarbonImpact"], 300)
        self.assertEqual(savings["optimizedCarbonImpact"], 200)
        self.assertEqual(savings["carbonSavings"], 100)
        self.assertAlmostEqual(savings["carbonSavingsPercent"], 33.3333333333)

    def test_green_window_detection_groups_contiguous_points(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        intensities = [500, 200, 210, 500, 205, 500]
        forecast = [
            {
                "datetime": (start + timedelta(hours=idx)).isoformat(),
                "carbonIntensity": intensity,
            }
            for idx, intensity in enumerate(intensities)
        ]

        windows = detect_green_windows(forecast, start.isoformat())

        self.assertEqual(len(windows), 2)
        self.assertEqual(windows[0]["duration"], 120)
        self.assertEqual(windows[1]["duration"], 60)

    def test_time_series_split_still_accepts_zone_aware_features(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        rows = []
        for zone, base in [("A", 120), ("B", 520)]:
            for hour in range(40):
                rows.append(
                    {
                        "datetime": start + timedelta(hours=hour),
                        "zone": zone,
                        "carbonIntensity": base + (hour % 24),
                    }
                )

        feat_df = build_features(clean_carbon_data(pd.DataFrame(rows)))
        feat_df = order_features_for_timeseries(feat_df)
        X = feat_df[get_feature_names()]
        y = feat_df["target"]
        splits = list(TimeSeriesSplit(n_splits=3).split(X))

        self.assertEqual(len(splits), 3)
        self.assertEqual(len(X.columns), 18)
        self.assertEqual(len(y), len(X))

    def test_timeseries_ordering_is_chronological_across_zones(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        rows = []
        for zone, base in [("A", 100), ("B", 500), ("C", 900)]:
            for hour in range(36):
                rows.append(
                    {
                        "datetime": start + timedelta(hours=hour),
                        "zone": zone,
                        "carbonIntensity": base + hour,
                    }
                )

        feat_df = build_features(clean_carbon_data(pd.DataFrame(rows)))
        ordered = order_features_for_timeseries(feat_df)

        ordered_times = ordered.index.to_series().reset_index(drop=True)
        self.assertTrue(ordered_times.is_monotonic_increasing)
        self.assertEqual(ordered.iloc[:3]["zone"].tolist(), ["A", "B", "C"])
        self.assertEqual(len(ordered[get_feature_names()].columns), 18)

        for _, val_idx in TimeSeriesSplit(n_splits=3).split(ordered):
            validation_zones = set(ordered.iloc[val_idx]["zone"])
            self.assertEqual(validation_zones, {"A", "B", "C"})


if __name__ == "__main__":
    unittest.main()
