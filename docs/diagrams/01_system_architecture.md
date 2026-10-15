# Diagram 1 — Overall System Architecture

**Description:** High-level view of the React/TypeScript frontend and Flask API,
the PostgreSQL application database (SQLite is used by tests), carbon-data
providers/fallback, forecast code, and organization-scoped local upload storage.

**Recommended placement:** BE Report — Section 1 (Introduction/Overview); IEEE Paper — Figure 1.

```mermaid
graph TB
    subgraph "Frontend — React + TypeScript (Vite)"
        UI["Dashboard / Activities / Optimization / Analytics"]
        Hooks["Feature hooks and API clients"]
        UI --> Hooks
    end

    subgraph "Backend — Flask + Python"
        APP["app.py — application factory, JWT, CORS, SQLAlchemy"]

        subgraph "Authenticated API routes"
            R_AUTH["auth.py\nregistration, login, identity"]
            R_CARBON["carbon.py\n/api/carbon · /api/windows · /api/zones"]
            R_ACT["activities.py\nactivity CRUD and bulk update"]
            R_OPT["optimizer.py\n/api/recommendations · /api/scheduler · /api/eco-score"]
            R_FORE["forecast.py\n/api/forecast · /api/forecast/info · /api/ml/train"]
            R_UPLOAD["upload.py\nregistration, schedule, execute, download"]
        end

        subgraph "Services and domain logic"
            SVC_C["carbon_service.py\nprovider and labeled simulation"]
            SVC_A["activity_service.py\nvalidated, tenant-scoped activity CRUD"]
            SVC_O["optimizer_service.py\nforecast and scheduling feasibility"]
            SVC_U["upload_service.py\nvalidated local upload lifecycle"]
            OPT["carbon_calculator.py · eco_score.py\nwindow_ranking.py · greedy_scheduler.py"]
            FORE["ForecastPredictor · training · feature engineering"]
        end

        subgraph "Persistence"
            DB[("PostgreSQL\nactivities · history · users · organizations\nrecommendations · upload registrations")]
            FILES[("Local files\nbackend/uploads/org-<id>/")]
            MODEL[("Optional generated artifacts\nbackend/data/best_model.pkl\ntraining_report.json")]
        end

        APP --> R_AUTH & R_CARBON & R_ACT & R_OPT & R_FORE & R_UPLOAD
        R_CARBON --> SVC_C
        R_ACT --> SVC_A
        R_OPT --> SVC_O
        R_FORE --> FORE & SVC_C
        R_UPLOAD --> SVC_U
        SVC_A --> DB
        SVC_O --> DB & OPT & SVC_C & FORE
        SVC_U --> DB & FILES & SVC_O
        FORE --> MODEL
    end

    subgraph "External / optional"
        EMAPS["Electricity Maps API\noptional backend credential"]
        SIM["Zone simulation\nexplicitly labeled data"]
    end

    Hooks -- "Bearer JWT · REST /api/*" --> APP
    SVC_C --> EMAPS
    SVC_C --> SIM
    DB -. "SQLite in-memory test configuration" .-> TESTDB[("Automated tests")]
```

Only the file-upload lifecycle has a supported executor: after explicit user
action, the backend finalizes validated content in local organization-scoped
storage. Other activity categories produce estimates and recommendations; no
general workload runner or automatic scheduling worker is present.
