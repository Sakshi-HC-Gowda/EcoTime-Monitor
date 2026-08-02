# Diagram 3 — Data Flow Diagram (Level 0 & Level 1)

**Description:** Level 0 (context) shows the system as a single process receiving inputs
from the user and external grid API. Level 1 decomposes the system into its four major
processing subsystems matching the four Flask blueprints.

**Recommended placement:** BE Report — Section 4 (Data Design); IEEE Paper — Figure 3.

---

## Level 0 — Context DFD

```mermaid
graph LR
    USER(["👤 End User\n(Frontend)"])
    GRID(["🌍 Grid API /\nSimulation Engine"])
    SYSTEM[["EcoTime Backend\nSystem"]]

    USER -- "Task CRUD, scheduling\nrequests, config" --> SYSTEM
    SYSTEM -- "Recommendations, EcoScore,\nCO₂ savings, forecasts" --> USER
    GRID -- "Carbon intensity data\n(gCO₂e/kWh per zone)" --> SYSTEM
    SYSTEM -- "Zone query + offset" --> GRID
```

---

## Level 1 — DFD

```mermaid
graph TB
    USER(["👤 Frontend Client"])
    EMAPS(["Electricity Maps /\nSimulation Engine"])

    subgraph P1["P1 · Carbon Data Processor\n(carbon_service + routes/carbon)"]
        P1A["Fetch / simulate\ncarbon intensity"]
        P1B["Detect green windows\n(threshold scan)"]
        P1C["Rank windows\n(WindowScore formula)"]
        P1A --> P1B --> P1C
    end

    subgraph P2["P2 · Activity Manager\n(activity_service + routes/activities)"]
        P2A["Validate task input"]
        P2B["Store in SQLite\n(Activity model)"]
        P2C["CRUD operations\non task registry"]
        P2A --> P2B --> P2C
    end

    subgraph P3["P3 · Optimization Engine\n(optimizer_service + routes/optimizer)"]
        P3A["Compute EcoScore\n(0.5·C + 0.3·F + 0.2·P)"]
        P3B["Run Greedy Scheduler\n(power×duration sort)"]
        P3C["Run Knapsack DP\n(0/1 maximise savings)"]
        P3D["Compute CO₂ savings\n(carbon_calculator)"]
    end

    subgraph P4["P4 · ML Forecast Pipeline\n(forecast/ + routes/forecast)"]
        P4A["Generate training data\n(zone simulation)"]
        P4B["Train LR / RF / XGBoost\n(TimeSeriesSplit CV)"]
        P4C["Select best model\n(lowest MAE)"]
        P4D["Recursive 24h predict\n(ForecastPredictor)"]
        P4A --> P4B --> P4C --> P4D
    end

    DS1[("SQLite DB\nactivities table")]
    DS2[("data/\nbest_model.pkl\ntraining_report.json")]

    EMAPS --> P1A
    USER -- "GET /api/carbon\nGET /api/windows" --> P1
    P1 --> USER

    USER -- "POST/GET/PATCH/DELETE\n/api/activities" --> P2
    P2 --> DS1
    DS1 --> P2
    P2 --> USER

    USER -- "POST /api/scheduler\nGET /api/eco-score" --> P3
    P1C --> P3
    P3 --> USER

    USER -- "GET /api/forecast\nPOST /api/ml/train" --> P4
    P4 --> DS2
    DS2 --> P4D
    P1A --> P4D
    P4 --> USER
```
