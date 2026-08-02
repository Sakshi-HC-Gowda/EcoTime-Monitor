# Diagram 1 — Overall System Architecture

**Description:** High-level view of the two-tier EcoTime system: React/TypeScript frontend
communicating with the Flask/Python backend over a REST API. Shows external integration
with Electricity Maps API, SQLite persistence, and the ML subsystem.

**Recommended placement:** BE Report — Section 1 (Introduction/Overview); IEEE Paper — Figure 1.

```mermaid
graph TB
    subgraph "Frontend — React + TypeScript (Vite)"
        UI["Dashboard / AgentSimulator / Settings"]
        Hooks["Hooks: useCarbonData · useTasks · useSimulation"]
        Algos["Client Algorithms: Greedy · Knapsack · EcoScore"]
        UI --> Hooks
        UI --> Algos
    end

    subgraph "Backend — Flask + Python"
        APP["app.py — Application Factory"]

        subgraph "Routes (Blueprints)"
            R_CARBON["carbon_bp\n/api/carbon\n/api/windows\n/api/zones"]
            R_ACT["activities_bp\n/api/activities"]
            R_OPT["optimizer_bp\n/api/scheduler\n/api/eco-score\n/api/config/simulation"]
            R_FORE["forecast_bp\n/api/forecast\n/api/forecast/info\n/api/ml/train"]
        end

        subgraph "Services Layer"
            SVC_C["carbon_service"]
            SVC_A["activity_service"]
            SVC_O["optimizer_service"]
        end

        subgraph "Optimization Engine"
            OPT_ECO["eco_score.py"]
            OPT_WIN["window_ranking.py"]
            OPT_SCH["greedy_scheduler.py\n(Greedy + Knapsack DP)"]
            OPT_CALC["carbon_calculator.py"]
        end

        subgraph "ML Forecast Pipeline"
            F_TRAIN["train.py\n(LR · RF · XGBoost)"]
            F_PRE["preprocessing.py"]
            F_FEAT["feature_engineering.py"]
            F_PRED["predict.py (ForecastPredictor singleton)"]
        end

        subgraph "Data Layer"
            DB["SQLite — activities table\n(SQLAlchemy / models/activity.py)"]
            PKL["best_model.pkl\ntraining_report.json"]
        end

        APP --> R_CARBON & R_ACT & R_OPT & R_FORE
        R_CARBON --> SVC_C
        R_ACT --> SVC_A
        R_OPT --> SVC_O
        R_FORE --> F_PRED
        R_FORE --> SVC_C
        SVC_O --> OPT_ECO & OPT_WIN & OPT_SCH & OPT_CALC
        SVC_A --> DB
        F_TRAIN --> F_PRE --> F_FEAT
        F_PRED --> PKL
        F_TRAIN --> PKL
        R_CARBON --> OPT_WIN
    end

    subgraph "External"
        EMAPS["Electricity Maps API\n(optional — live gCO₂e/kWh)"]
        EMAPS_SIM["Zone Simulation Engine\n(mathematical fallback)"]
    end

    Hooks -- "REST /api/*" --> APP
    SVC_C --> EMAPS
    SVC_C --> EMAPS_SIM
    F_PRED --> EMAPS_SIM
```
