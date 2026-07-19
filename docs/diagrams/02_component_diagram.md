# Diagram 2 — Component Diagram

**Description:** Shows the backend Python package hierarchy and inter-module dependencies
exactly as laid out in the `backend/` folder structure. Every node is a real file.

**Recommended placement:** BE Report — Section 3 (System Design); IEEE Paper — Figure 2.

```mermaid
graph TB
    subgraph backend["backend/"]
        APP["app.py\n(Flask factory · db · CORS)"]
        INIT["__init__.py"]

        subgraph routes["routes/"]
            RC["carbon.py\ncarbon_bp"]
            RA["activities.py\nactivities_bp"]
            RO["optimizer.py\noptimizer_bp"]
            RF["forecast.py\nforecast_bp"]
            RI["__init__.py"]
        end

        subgraph services["services/"]
            SC["carbon_service.py"]
            SA["activity_service.py"]
            SO["optimizer_service.py"]
            SI["__init__.py"]
        end

        subgraph models["models/"]
            MA["activity.py\nActivity(db.Model)"]
            MI["__init__.py"]
        end

        subgraph optimization["optimization/"]
            OE["eco_score.py"]
            OW["window_ranking.py"]
            OG["greedy_scheduler.py"]
            OC["carbon_calculator.py"]
            OI["__init__.py"]
        end

        subgraph forecast["forecast/"]
            FT["train.py"]
            FP["predict.py\nForecastPredictor"]
            FPR["preprocessing.py"]
            FF["feature_engineering.py"]
            FI["__init__.py"]
        end

        subgraph data["data/"]
            DM["best_model.pkl"]
            DR["training_report.json"]
        end
    end

    APP --> RC & RA & RO & RF
    APP --> MA

    RC --> SC
    RC --> OW

    RA --> SA
    SA --> MA

    RO --> SO
    RF --> FP
    RF --> SC

    SO --> OE & OW & OG & OC
    OG --> OC
    OG --> OW

    FP --> FF
    FT --> FPR & FF & SC
    FT --> DM & DR
    FP --> DM & DR
```
