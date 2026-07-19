# EcoTime — Full Audit & Refactoring Plan

## Executive Summary

The EcoTime project is a **Phase 1 skeleton** that completed its foundation (types, routes stubs, API client) but has **never progressed to Phase 2**. Every backend service is stubbed with `TODO` comments and returns mock/empty data. The optimization algorithms live on the **frontend** when they should be on the **backend**. There are duplicate type definitions, a monolithic `App.tsx`, and the ML pipeline (forecasting, feature engineering, model training) is entirely absent.

This plan covers everything needed to transform EcoTime into a complete, production-quality application.

---

## Audit Summary

### ✅ Completed & Working Modules

| Module | Location | Status |
|---|---|---|
| Frontend UI Shell | `src/App.tsx` | ✅ Working (but monolithic — 595 lines) |
| Dashboard Component | `src/components/Dashboard.tsx` | ✅ Working — SVG chart, green windows |
| Agent Simulator | `src/components/AgentSimulator.tsx` | ✅ Working — task management + console |
| Savings Card | `src/components/SavingsCard.tsx` | ✅ Working — equivalency metrics |
| Settings Panel | `src/components/Settings.tsx` | ✅ Working |
| Greedy Algorithm | `src/utils/algorithms.ts` | ✅ Working (frontend only) |
| Knapsack Algorithm | `src/utils/algorithms.ts` | ✅ Working (frontend only) |
| EcoScore Calculator | `src/utils/algorithms.ts` | ✅ Working (frontend only) |
| Window Ranking | `src/utils/algorithms.ts` | ✅ Working (frontend only) |
| Carbon Simulation | `src/services/electricityMaps.ts` | ✅ Working — zone-based math models |
| Electricity Maps API | `src/services/electricityMaps.ts` | ✅ Working — real API fallback |
| Frontend API Client | `src/services/api.ts` | ✅ Well-structured (but unused) |
| Domain Types (Frontend) | `src/types/domain.ts` | ✅ Complete |
| Flask App Factory | `backend/app.py` | ✅ Working structure |
| Blueprint Registration | `backend/app.py` | ✅ All 3 blueprints registered |
| CORS Config | `backend/app.py` | ✅ Correct |
| Route Stubs | `backend/routes/*.py` | ✅ Stub structure correct |
| CSS Design System | `src/index.css` | ✅ Excellent (1059 lines) |

---

### ❌ Incomplete / Stub-Only Modules

| Module | Location | Issue |
|---|---|---|
| Carbon Service | `backend/routes/carbon.py` | Returns hardcoded `carbonIntensity: 180`, empty history/forecast |
| Green Windows Backend | `backend/routes/carbon.py` | Returns empty `[]` — detection not implemented |
| Optimizer Service | `backend/routes/optimizer.py` | Returns placeholder result with zeros, no algorithm logic |
| EcoScore Backend | `backend/routes/optimizer.py` | Returns hardcoded scores, no real calculation |
| Activities Persistence | `backend/routes/activities.py` | Uses in-memory dict `ACTIVITIES_STORE`, lost on restart |
| Database Layer | Missing | No models, no migrations, no SQLite schema |
| ML Service | Missing | No preprocessing, feature engineering, model training |
| Forecast Service | Missing | No `forecast/` module at all |
| Carbon Service Class | Missing | No `services/carbon_service.py` |
| Orchestrator | Missing | No task state machine beyond frontend simulation |
| Tests | Missing | No backend or frontend tests |

---

### 🔴 Critical Issues Found

1. **Duplicate Type Definitions**: `Task` and `GreenWindow` are defined in **both** `src/utils/algorithms.ts` AND `src/types/domain.ts` with differing fields (`algorithms.ts` is missing `activityType`, `createdAt`, `updatedAt`)
2. **Optimization Algorithms on Frontend**: `scheduleGreedy`, `optimizeKnapsack`, `calculateEcoScore`, `getRecommendation`, `calculateWindowScore` all live in `src/utils/algorithms.ts` — they should be backend-only per spec
3. **Frontend-Backend Disconnect**: `src/services/api.ts` exists and is well-designed but is **never called** anywhere in the app — all data flows through `electricityMaps.ts` directly in `App.tsx`
4. **Missing ML stack**: `requirements.txt` only has Flask/CORS/SQLAlchemy — no scikit-learn, XGBoost, pandas, numpy
5. **No `.env` for Vite**: Frontend environment variable `VITE_API_BASE` is never set — hardcoded fallback to `http://localhost:5000/api`
6. **Monolithic App.tsx**: All business logic (loading, simulation loop, task management, optimization triggering) is in a single 595-line component
7. **Missing Backend Services Layer**: Routes call non-existent service functions (noted as TODOs)
8. **No Persistence**: Activities are stored in `ACTIVITIES_STORE` dict — cleared on server restart

---

### 🟡 Structural Problems

| Problem | Detail |
|---|---|
| Missing `services/` in backend | No `carbon_service.py`, `activity_service.py`, `optimizer_service.py` |
| Missing `models/` in backend | No SQLAlchemy model files |
| Missing `optimization/` in backend | No `eco_score.py`, `window_ranking.py`, `greedy_scheduler.py`, `carbon_calculator.py` |
| Missing `forecast/` in backend | No `preprocessing.py`, `feature_engineering.py`, `train.py`, `predict.py` |
| Missing `data/` in backend | No data directory for ML datasets |
| Missing `utils/` in backend | No shared utilities |
| Missing `tests/` in backend | No test suite |
| Frontend missing `pages/`, `hooks/`, `charts/`, `cards/`, `layout/`, `common/` | All UI lives in flat `components/` directory |

---

## User Review Required

> [!IMPORTANT]
> **Algorithms Location Decision**: The spec says "Keep all optimization logic inside backend only." However, the frontend currently works fully in simulation mode WITHOUT a backend. If we move algorithms to backend-only, offline/simulation mode will break unless we replicate the logic. **Proposed solution**: Keep a lightweight version on frontend for simulation mode, but the primary logic runs on backend when available. Backend responses always take precedence.

> [!WARNING]
> **Breaking Change**: `src/utils/algorithms.ts` exports `Task` and `GreenWindow` types that are imported by `AgentSimulator.tsx` and `Dashboard.tsx`. These must be migrated to `src/types/domain.ts` imports. This is a safe refactor but requires touching 3 files.

> [!IMPORTANT]
> **ML Pipeline scope**: The full ML pipeline (train/predict with scikit-learn + XGBoost) requires Python packages not in `requirements.txt`. For simulation, the backend will use the same mathematical model currently in `electricityMaps.ts` (ported to Python). The ML training module will train on synthetic data. Do you want ML training triggered automatically on startup, or manually via an API endpoint?

---

## Open Questions

1. **Database**: Stay with SQLite (zero-setup) or PostgreSQL? SQLite is fine for development.
2. **ML Training**: Auto-train on startup with synthetic data, or provide a `/api/ml/train` endpoint?
3. **Frontend pages**: Should we add new pages (Forecast, Green Windows detail, Analytics, Scheduler) or keep current 3-tab layout?
4. **Task Status States**: Backend orchestrator should add `pending`, `scheduled`, `failed` states — frontend currently uses `idle | running | paused | delayed | completed`. Align both?

---

## Proposed Changes

### Phase A — Backend Services Layer (No frontend changes)

#### [NEW] `backend/services/carbon_service.py`
Python port of `electricityMaps.ts` simulation logic + real Electricity Maps API calls. Returns structured `CarbonResponse`.

#### [NEW] `backend/services/activity_service.py`
Activity CRUD operations backed by SQLite. Replaces in-memory `ACTIVITIES_STORE`.

#### [NEW] `backend/services/optimizer_service.py`
Python port of `src/utils/algorithms.ts` algorithms (EcoScore, Greedy, Knapsack, Window Ranking).

#### [MODIFY] `backend/routes/carbon.py`
Wire up `carbon_service` — replace TODO stubs with real service calls.

#### [MODIFY] `backend/routes/activities.py`
Wire up `activity_service` — replace in-memory dict with database.

#### [MODIFY] `backend/routes/optimizer.py`
Wire up `optimizer_service` — replace placeholder responses with real algorithms.

---

### Phase B — Backend Optimization Module

#### [NEW] `backend/optimization/eco_score.py`
`calculate_eco_score(task, current_intensity, baseline, peak)` → EcoScore + recommendation

#### [NEW] `backend/optimization/window_ranking.py`
`rank_windows(windows, max_duration)` → scored + ranked windows list

#### [NEW] `backend/optimization/greedy_scheduler.py`
`schedule_greedy(tasks, windows)` → task allocations per window

#### [NEW] `backend/optimization/carbon_calculator.py`
`calculate_savings(task, window, baseline)` → CO2 savings in grams

---

### Phase C — ML Forecast Pipeline

#### [NEW] `backend/forecast/preprocessing.py`
Data cleaning: handle missing values, outliers, type validation

#### [NEW] `backend/forecast/feature_engineering.py`
Lag features (1h, 2h, 6h, 12h, 24h), rolling mean/std (3h, 6h, 12h), hour-of-day, day-of-week, is_weekend

#### [NEW] `backend/forecast/train.py`
Train LinearRegression, RandomForest, XGBoost on synthetic zone data. Evaluate MAE/RMSE/R² with TimeSeriesSplit. Auto-save best model as `backend/data/best_model.pkl`.

#### [NEW] `backend/forecast/predict.py`
Load best model, generate 24-hour forecast for any zone.

#### [NEW] `backend/routes/forecast.py`
`GET /api/forecast` — return ML-predicted forecast. `POST /api/ml/train` — trigger training.

#### [MODIFY] `backend/requirements.txt`
Add: `scikit-learn`, `xgboost`, `pandas`, `numpy`, `joblib`

---

### Phase D — Database Models

#### [NEW] `backend/models/__init__.py`
Initialize SQLAlchemy with `db` instance.

#### [NEW] `backend/models/activity.py`
`Activity` SQLAlchemy model: id, name, type, activity_type, duration, power_draw, priority_score, flexibility_score, status, progress, assigned_window_id, created_at, updated_at

#### [MODIFY] `backend/app.py`
Initialize database, create tables on startup.

---

### Phase E — Frontend Refactoring (Structure Only, No UI Redesign)

#### [MODIFY] `src/types/domain.ts`
Add missing statuses: `'pending' | 'scheduled' | 'failed'` to `TaskStatus`

#### [MODIFY] `src/components/AgentSimulator.tsx`
Change imports from `../utils/algorithms` → `../types/domain`

#### [MODIFY] `src/components/Dashboard.tsx`
Change imports from `../utils/algorithms` → `../types/domain`

#### [MODIFY] `src/App.tsx`
- Split state management into custom hooks (`useSimulation`, `useCarbonData`, `useTasks`)
- Wire up `apiClient` from `src/services/api.ts` for backend calls
- Keep local simulation as fallback

#### [NEW] `src/hooks/useSimulation.ts`
Simulation loop, offset management, time advancement

#### [NEW] `src/hooks/useCarbonData.ts`
Carbon data fetching, green window detection

#### [NEW] `src/hooks/useTasks.ts`
Task CRUD, manual trigger, optimization invocation

---

### Phase F — Tests

#### [NEW] `backend/tests/test_carbon_service.py`
Test zone simulation, green window detection

#### [NEW] `backend/tests/test_optimizer.py`
Test EcoScore calculation, greedy scheduler, knapsack

#### [NEW] `backend/tests/test_routes.py`
Test API endpoints (health, carbon, activities, optimizer)

#### [NEW] `backend/tests/test_ml_pipeline.py`
Test preprocessing, feature engineering, train/predict cycle

---

### Phase G — Configuration & Documentation

#### [NEW] `.env.frontend` (renamed to `frontend/.env.local`)
`VITE_API_BASE=http://localhost:5000/api`

#### [MODIFY] `vite.config.ts`
Add `server.proxy` for `/api` → `http://localhost:5000` to avoid CORS in dev

#### [MODIFY] `backend/requirements.txt`
Add ML packages

#### [MODIFY] `README.md`
Update with complete setup guide

---

## Execution Order

```
Phase A → Phase B → Phase C → Phase D → Phase E → Phase F → Phase G
  │           │          │         │         │         │         │
Services   Optim.    ML/Forecast  DB     Frontend   Tests    Config
  │           │          │         │      hooks     suite    & docs
  └───────────┴──────────┴─────────┘
           Backend core complete
                    │
                    ↓
            Phase E (Frontend wiring)
```

> Each phase is independently testable. Phase A can be verified with `curl`. Phase C can be verified by running training and checking model output.

---

## Verification Plan

### Automated Tests
```bash
cd backend
python -m pytest tests/ -v
```

### Backend API Checks (manual curl)
```bash
curl http://localhost:5000/api/health
curl "http://localhost:5000/api/carbon?zone=IN"
curl "http://localhost:5000/api/windows?zone=IN&threshold=180"
curl -X POST http://localhost:5000/api/activities -H "Content-Type: application/json" -d '{"name":"Test","type":"flexible","duration":30,"powerDraw":150,"priorityScore":50}'
curl "http://localhost:5000/api/eco-score?taskId=test&currentIntensity=150&baselineIntensity=380&peakIntensity=800"
curl -X POST http://localhost:5000/api/scheduler -H "Content-Type: application/json" -d '{...}'
```

### Frontend Build Check
```bash
npx tsc --noEmit
npm run build
```

### ML Pipeline Check
```bash
cd backend
python forecast/train.py
python forecast/predict.py
```

---

## File Count Summary

| Category | Files Added | Files Modified |
|---|---|---|
| Backend Services | 3 new | 3 route files |
| Backend Optimization | 4 new | 0 |
| Backend ML Forecast | 4 new + 1 route | 1 (requirements.txt) |
| Backend Models | 2 new | 1 (app.py) |
| Frontend Hooks | 3 new | 3 existing components |
| Tests | 4 new | 0 |
| Config | 1 new | 2 existing |
| **Total** | **21 new** | **10 modified** |

No files will be deleted until migration is verified.
