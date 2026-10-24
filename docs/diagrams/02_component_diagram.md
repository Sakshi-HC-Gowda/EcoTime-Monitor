# Diagram 2 — Component Diagram

**Description:** Shows the backend package areas used by the authenticated API,
the activity and upload services, and shared forecasting/optimization modules.

**Recommended placement:** BE Report — Section 3 (System Design); IEEE Paper — Figure 2.

```mermaid
graph TB
    subgraph backend["backend/"]
        APP["app.py\n(Flask factory · db · CORS)"]
        INIT["__init__.py"]

        subgraph routes["routes/"]
            RAUTH["auth.py\nauth_bp"]
            RC["carbon.py\ncarbon_bp"]
            RA["activities.py\nactivities_bp"]
            RO["optimizer.py\noptimizer_bp"]
            RF["forecast.py\nforecast_bp"]
            RU["upload.py\nupload_bp"]
            RI["__init__.py"]
        end

        subgraph services["services/"]
            SC["carbon_service.py"]
            SA["activity_service.py"]
            SO["optimizer_service.py"]
            SU["upload_service.py"]
            SI["__init__.py"]
        end

        subgraph models["models/"]
            MA["activity.py\nActivity(db.Model)"]
            MH["activity_history.py\nActivityHistory(db.Model)"]
            MU["upload_registration.py\nUploadRegistration(db.Model)"]
            MO["organization.py · user.py · role.py"]
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
            DM["best_model.pkl\n(optional generated artifact)"]
            DR["training_report.json\n(optional generated artifact)"]
        end

        DB[("PostgreSQL in application deployments\nSQLite in-memory for tests")]
        UPLOADS[("Local backend/uploads/org-<id>/")]
    end

    APP --> RAUTH & RC & RA & RO & RF & RU
    APP --> MA

    RC --> SC
    RC --> OW

    RA --> SA --> MA & MH
    RAUTH --> MO

    RO --> SO
    RF --> FP
    RF --> SC
    RU --> SU

    SO --> OE & OW & OG & OC
    OG --> OC
    OG --> OW
    SO --> MA
    SU --> MU & MA & SO
    MA --> DB
    MH --> DB
    MU --> DB
    MO --> DB
    SU --> UPLOADS

    FP --> FF
    FT --> FPR & FF & SC
    FT --> DM & DR
    FP --> DM
```

Startup uses SQLAlchemy `create_all()` plus a PostgreSQL-specific additive
schema helper. This is not a versioned migration framework; legacy ownership
data is not guessed. Automated tests use SQLite fixtures.
