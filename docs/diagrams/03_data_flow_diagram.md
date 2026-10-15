# Diagram 3 — Data Flow Diagram (Level 0 & Level 1)

**Description:** Level 0 (context) shows the system receiving authenticated user
requests and optional external grid data. Level 1 follows the implemented
carbon, activity, recommendation, forecast, and upload flows.

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
        P1A["Fetch provider data\nor explicit simulation"]
        P1B["Detect contiguous\nrelative low-carbon periods"]
        P1C["Rank windows\n(WindowScore formula)"]
        P1D["Attach source and\nobservation timestamp"]
        P1A --> P1D --> P1B --> P1C
    end

    subgraph P2["P2 · Activity Manager\n(activity_service + routes/activities)"]
        P2A["Validate task input"]
        P2B["Store in PostgreSQL\n(Activity and history models)"]
        P2C["CRUD operations\non task registry"]
        P2A --> P2B --> P2C
    end

    subgraph P3["P3 · Recommendation Engine\n(optimizer_service + routes/optimizer)"]
        P3A["Authenticate user;\nload tenant-owned activities"]
        P3B["Validate forecast and\npermitted time interval"]
        P3C["Find/rank lower-carbon\nwindows in interval"]
        P3D["Greedy or 0/1 Knapsack\nwith shared feasibility rules"]
        P3E["Enforce activity deadline,\nfull duration, capacity, no overlap"]
        P3F["Return per-activity reason\nand data provenance"]
        P3A --> P3B --> P3C --> P3D --> P3E --> P3F
    end

    subgraph P4["P4 · ML Forecast Pipeline\n(forecast/ + routes/forecast)"]
        P4A["Generate training data\n(zone simulation)"]
        P4B["Train LR / RF / XGBoost\n(TimeSeriesSplit CV)"]
        P4C["Select best model\n(lowest MAE)"]
        P4D["Recursive predict only\nwith valid inputs (ForecastPredictor)"]
        P4A --> P4B --> P4C --> P4D
    end

    DS1[("PostgreSQL\nactivities, tenants, history,\nrecommendations, upload metadata")]
    DS2[("Optional generated model\nand training report")]
    DS3[("Local staged/final files\nbackend/uploads/org-<id>/")]

    EMAPS --> P1A
    USER -- "GET /api/carbon\nGET /api/windows" --> P1
    P1 --> USER

    USER -- "POST/GET/PATCH/DELETE\n/api/activities" --> P2
    P2 --> DS1
    DS1 --> P2
    P2 --> USER

    USER -- "POST /api/recommendations\nGET /api/eco-score" --> P3
    P1C --> P3B
    P4D --> P3B
    P3 --> USER

    USER -- "GET /api/forecast\nPOST /api/ml/train" --> P4
    P4 --> DS2
    DS2 --> P4D
    P1A --> P4D
    P4 --> USER

    USER -- "POST /api/upload\nPOST /api/uploads/<id>/schedule\nPOST /api/uploads/<id>/execute" --> P5
    subgraph P5["P5 · Local File Upload Lifecycle\n(upload_service + routes/upload)"]
        P5A["Validate file, activity ownership,\nand optional idempotency key"]
        P5B["Persist pending registration\nand staged local content"]
        P5C["Obtain feasible recommendation;\nwait for explicit user execution"]
        P5D["Finalize local stored file;\npersist completed or failed state"]
        P5A --> P5B --> P5C --> P5D
    end
    P5 --> DS1
    P5 --> DS3
    P5 --> USER
```

The recommendation endpoint loads activity metrics and scheduling bounds from
the authenticated user's organization. Carbon API readings and forecasts carry
source/timestamp metadata; simulated values are labeled as simulation. Invalid
or unavailable forecasts do not produce scheduling recommendations. A forecast
range with no lower-carbon band yields no Green Windows. General activity
recommendations do not execute workloads. Only the upload flow finalizes local
file content after an explicit execution request; uploads are not sent to a
remote cloud or compute service.
