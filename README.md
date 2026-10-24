# EcoTime — Carbon-Aware Activity Recommendations

EcoTime is a React/TypeScript frontend and Flask API for viewing grid carbon
intensity, estimating workload energy and emissions, and recommending times for
flexible workloads. Recommendations are planning output: except for the local
file-upload lifecycle described below, EcoTime does not execute the workload.
Energy and emissions are estimates, not device measurements or verified
environmental savings.

## Implemented capabilities

- Authenticated, organization-scoped activity registration and history.
- Electricity Maps carbon data when configured, with explicitly labeled
  simulated carbon data under the supported fallback conditions.
- Provider, simulation, or trained-model forecast output, with invalid or
  unavailable forecast errors surfaced to recommendation workflows.
- Forecast-derived Green Windows and Greedy/0/1 Knapsack recommendations.
- Persisted, organization-scoped local file uploads with manual scheduling and
  execution controls.

## Activity registration

`POST /api/activities` accepts a JSON object with:

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | Yes | Non-empty activity name, at most 255 characters. |
| `type` | Yes | `flexible` or `non-flexible`; only flexible work can be moved by the optimizer. |
| `duration` | Yes | Estimated duration in minutes; must be finite and greater than zero. |
| `activityType` | No | `file-upload`, `cloud-backup`, `software-update`, `dataset-download`, `ci-cd-pipeline`, or `batch-processing`. Defaults to `batch-processing`. |
| `powerDraw` | No | Estimated power in watts. If omitted, the backend uses the workload-class estimates below. |
| `priorityScore` | No | Integer from 0 to 100. Defaults to 30 (or a named workload profile default). |
| `flexibilityScore` | No | Integer from 0 to 100. Defaults to 80 (or a named workload profile default). |
| `earliestStart` | No | ISO timestamp; the activity cannot be scheduled before it. |
| `deadline` | No | ISO timestamp; the complete activity must finish by it. |

Default power values are assumptions, not user-supplied measurements:

| Activity type | Assumed power |
| --- | ---: |
| File upload | 120 W |
| Cloud backup | 120 W |
| Software update | 80 W |
| Dataset download | 200 W |
| CI/CD pipeline | 450 W |
| Batch processing | 350 W |

`Idempotency-Key` is an optional request header for safe retries. Repeating the
same key and request replays the created activity; reusing that key with a
different request returns a conflict.

## What actually executes

The activity categories describe workload classes; they are not all connected
to workload executors:

- **File upload:** implemented lifecycle. A selected CSV, JSON, TXT, ZIP, or
  supported checkpoint/binary file (up to 100 MiB) is validated, staged in
  organization-scoped local storage, and can be finalized as a stored file.
  This is not a cloud upload, remote transfer, model run, or automatic scheduler.
- **Cloud backup, software update, dataset download, CI/CD pipeline, and batch
  processing:** registration, estimates, analytics, and recommendations only.
  The application has no corresponding workload executor.

Generic optimizer endpoints return recommendations and record them; they do
not transition activity rows into an executed state. Upload scheduling is also
a recommendation until a user manually triggers execution. The UI labels power
as assumed and duration, energy, and emissions as estimates. Transfer time is
not inferred from file size.

## Frontend-to-backend flow

1. The user authenticates. API requests send a JWT authorization header; the
   server resolves the user and organization from persisted identity data.
2. The activity form submits the registration fields above. The backend
   validates and stores the activity, initially with `idle` status.
3. Carbon and forecast views call authenticated `/api/carbon`, `/api/windows`,
   and `/api/forecast` endpoints and display their data-source labels.
4. The user requests recommendations. The backend reloads requested activity
   metrics from the authenticated user's organization rather than trusting
   client-supplied metrics, validates forecast/time bounds, schedules eligible
   work, and stores recommendation records.
5. For a file upload, the frontend posts the file and activity ID to
   `/api/upload`; metadata and staged content are persisted. The user may
   request `/api/uploads/<id>/schedule`, then explicitly call
   `/api/uploads/<id>/execute` when due, or confirm a run-now operation.
   Successful execution finalizes the local file and persists `completed`.

Other upload states include `pending`, `scheduled`, `running`, and `failed`.
Failed storage operations are not reported as completed; retry is supported
when staged content remains available. A completed upload can be downloaded
only by an authenticated member of its owning organization.

## Carbon data, forecast, and Green Windows

The backend uses Electricity Maps when an API key is configured. Without a
provider key, its supported carbon service returns simulated data labeled with
`source="simulation"` and `isSimulated=true`. If a live carbon request fails,
the service may return a clearly labeled simulated fallback with an `error`
field. Carbon endpoints preserve source and observation metadata.

Fallback does not imply that every downstream operation can proceed:
recommendation scheduling rejects error-marked fallback data, and forecast
workflows return an unavailable error when their required inputs are invalid
or unavailable. A live current reading does not make a missing provider
forecast available. When a trained model is present, the forecast endpoint can
use that model; without one, it uses the available carbon forecast. Training
data generation is synthetic and generated from the repository's zone
simulation functions. A trained model or simulated result is not a measured
future grid value.

Green Windows are contiguous forecast periods in the forecast's cleanest
relative band. The detection threshold is derived from the forecast minimum
and range (the configured `GREEN_WINDOW_THRESHOLD_RATIO`, currently 0.35);
when there is no lower-carbon range, detection returns no Green Windows.
Ranking scores compare windows with forecast conditions and are not measured
emissions savings.

## Scheduling behavior and constraints

The authenticated optimizer routes (`POST /api/recommendations` and its
`/api/scheduler` alias) support `greedy` and `knapsack` modes. They accept
organization-owned activity IDs, a method, baseline intensity, zone, and an
optional permitted interval. Stored activity measurements and bounds are
authoritative.

Only flexible, non-urgent (priority below 80), inactive activities with valid
duration can be moved. A candidate window must:

- be inside the requested permitted interval;
- start no earlier than the activity's `earliestStart`;
- fit the complete activity duration before its deadline;
- have enough capacity for the activity; and
- provide a non-overlapping slot when competing activities are placed.

Greedy orders eligible work by estimated duration × power and assigns it to
ranked windows with available capacity. Knapsack uses window duration as
capacity and estimated carbon savings weighted by priority and flexibility as
value. Both modes share eligibility, feasibility, and final placement checks.
If no feasible window exists, the response explains why and does not invent a
start time. A scheduled recommendation is not an automatic execution.

## Units and calculation conventions

All API and display calculations use the following units:

- duration: minutes;
- estimated power: watts (`W`);
- energy: kilowatt-hours (`kWh`);
- carbon intensity: grams of carbon-dioxide equivalent per kilowatt-hour
  (`gCO2e/kWh`);
- estimated emissions and savings: grams of carbon-dioxide equivalent
  (`gCO2e`).

```text
Energy (kWh) = estimated power (W) × estimated duration (min) / 60000
Emissions (gCO2e) = estimated energy (kWh) × carbon intensity (gCO2e/kWh)
Savings (gCO2e) = baseline emissions - recommended emissions
CarbonScore = clamp(0, 100, (peak - current) / max(50, peak - 0.5 × baseline) × 100)
EcoScore = 0.5 × CarbonScore + 0.3 × FlexibilityScore + 0.2 × PriorityScore
```

The EcoScore inputs and result are on a 0–100 scale; the result is rounded to
one decimal place. Energy, emissions, and savings calculations round to four
decimal places; the reduction percentage rounds to two. Savings are signed:
they are negative if recommended emissions exceed baseline emissions.
Baseline and recommendation use the same estimated activity energy with their
respective carbon intensities. These calculations do not measure physical
device energy or establish actual emissions reductions.

## Environment setup

Requirements: Python 3.11 (the tested project runtime), Node.js/npm, and
PostgreSQL for non-test backend operation.

### Backend

From the repository root, create and activate a virtual environment, then
install dependencies:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` to a
PostgreSQL database and replace the `SECRET_KEY` placeholder with a locally
generated secret. Optionally set `ELECTRICITY_MAPS_API_KEY`; the key is used by
the backend only. `DEFAULT_ZONE`, `LOW_CARBON_THRESHOLD`, and `PORT` have
documented defaults in the example file. Do not commit `.env` files or put
provider keys in frontend variables.

Start the backend from its directory:

```powershell
cd backend
python app.py
```

Outside testing, application startup requires a PostgreSQL URL; SQLite is
accepted only for testing. The PostgreSQL database must already exist and the
configured database user must be able to create/alter the application's
schema. Set `FLASK_ENV=production` in production and configure a strong,
locally generated `SECRET_KEY`.

### Frontend

From the repository root, install the lockfile dependencies and start Vite:

```powershell
npm ci
npm run dev
```

The frontend defaults to `http://localhost:5000/api`. To override it, copy
`.env.example` to `.env.local` and set `VITE_API_BASE`. Vite variables are
client-visible; do not put secrets in them.

## Database and schema safety

SQLAlchemy uses PostgreSQL in development/production and an in-memory SQLite
database by default for tests. Startup calls `db.create_all()` and a
PostgreSQL-specific additive schema helper. The helper adds supported columns,
indexes and ownership constraints and does not drop tables or reset data. It is
not a versioned migration system and does not infer ownership for legacy rows
with missing organization IDs. Review the helper and take a database backup
before deploying schema changes to an existing database; resolve legacy
unowned data deliberately rather than assigning tenants speculatively.

Uploaded files are stored locally beneath `backend/uploads/org-<organization
id>/`. This is local application storage, not object storage or a production
retention/backup service.

## Verification and evaluation evidence

Automated tests use deterministic fixtures/mocks; they do not require a live
Electricity Maps request. From the repository root:

```powershell
python -m pytest -q
npm run build
git diff --check
```

Verified for the reviewed implementation: **97 backend tests passed**;
`npm run build` passed (TypeScript build and Vite production bundle); and
`git diff --check` passed. The frontend build emits a Vite warning that one
minified bundle exceeds 500 kB. No browser/manual end-to-end test, live carbon
provider integration test, or production PostgreSQL migration test is claimed.

| Evaluation scenario | Automated evidence | Verified result |
| --- | --- | --- |
| Flexible upload scheduling and completion | Separate optimizer schedule and upload lifecycle tests | Schedule recommendation and local upload completion are tested separately; a single end-to-end carbon-to-upload test is not present. |
| Urgent/inflexible activity | Greedy and Knapsack tests | Not selected for delay. |
| No feasible Green Window | Green Window and optimizer tests | No recommendation is fabricated; explanation is returned. |
| Carbon/forecast failure | Mocked carbon and forecast tests | Fallback provenance is retained where supported; invalid/unavailable forecast prevents recommendations. |
| Competing activities | Greedy and Knapsack capacity/placement tests | Capacity and non-overlap constraints are verified. |
| Cross-organization requests | Activity, optimizer, upload and organization-isolation tests | Foreign-organization access is rejected. |

Known limits: non-upload workload types have no executor; scheduled work is
not run by a background worker; local uploads require user-triggered execution;
training data is simulated; carbon history can be simulated/scaled; and
automated tests do not establish real-world energy or carbon savings.

## Contributors

- **Sakshi H C**
- **Nayana**
- **Nikitha**
- **Prathiksha**

## Project layout

```text
backend/
  forecast/       Forecast training and prediction
  models/         SQLAlchemy models, including activities and uploads
  optimization/   Shared calculations, EcoScore, ranking and schedulers
  routes/         Authenticated Flask API routes
  services/       Carbon, activity, optimizer and upload workflows
  tests/          Deterministic backend tests
src/
  features/       React feature components and hooks
  pages/          Application pages
  services/       API clients
docs/diagrams/    Architecture and data-flow diagrams
```

## Project acknowledgement

This project was developed as a Bachelor of Engineering (Computer Science &
Engineering) major project by Sakshi H C and project team members. The
implementation uses React, Flask, Electricity Maps (when configured),
scikit-learn, XGBoost, Tailwind CSS, and Recharts.
