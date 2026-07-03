# Phase 1 Implementation: Architecture & Foundation

## ✅ Completed in Phase 1

### 1. Shared Domain Types (`src/types/domain.ts`)
**Purpose**: Single source of truth for data contracts between frontend and backend

**Includes**:
- Carbon data types (CarbonDataPoint, CarbonResponse, GridZone)
- Activity/Task types (Task, TaskStatus, TaskFlexibility, ActivityType)
- Green window types (GreenWindow, EcoScore, WindowScore)
- Optimization types (OptimizationResult, SchedulingRequest, SchedulingResponse)
- API wrapper types (ApiResponse, PaginatedResponse)

**Why**: Prevents drift between frontend and backend implementations. Both can import from the same types file.

---

### 2. Frontend API Client (`src/services/api.ts`)
**Purpose**: Abstraction layer for all backend communication with automatic fallback to simulation

**Features**:
- Typed REST client methods for all endpoints
- Automatic backend health checking
- Graceful fallback to simulation mode if backend is unavailable
- Request/response error handling
- Vite environment variable support (`import.meta.env.VITE_API_BASE`)

**Methods**:
- Carbon: `getCarbonData()`, `getGreenWindows()`
- Activities: `createTask()`, `getTasks()`, `getTask()`, `updateTask()`, `deleteTask()`
- Scheduling: `runScheduler()`, `getEcoScore()`
- Config: `setSimulationConfig()`

**Why**: Centralizes API communication logic so UI components don't call fetch directly. Makes testing and refactoring easier.

---

### 3. Flask Backend Skeleton (`backend/app.py`)
**Purpose**: Entry point for the Python backend with module routing

**Features**:
- Application factory pattern for flexible configuration
- CORS enabled for frontend communication
- Blueprint registration for modular routes
- Error handlers for 404 and 500
- Health check endpoint
- Environment-based configuration (dev, test, production)

**Why**: Follows Python/Flask best practices for scalability. Easy to add features and test.

---

### 4. Backend Routes (Carbon, Activities, Optimizer)

#### **Carbon Routes** (`backend/routes/carbon.py`)
- `GET /api/carbon` - Fetch carbon intensity data for a zone
- `GET /api/windows` - Fetch green windows with scoring

#### **Activities Routes** (`backend/routes/activities.py`)
- `POST /api/activities` - Create new task
- `GET /api/activities` - List tasks (paginated)
- `GET /api/activities/:id` - Get single task
- `PATCH /api/activities/:id` - Update task status/progress
- `DELETE /api/activities/:id` - Delete task

#### **Optimizer Routes** (`backend/routes/optimizer.py`)
- `POST /api/scheduler` - Run greedy or knapsack scheduler
- `GET /api/eco-score` - Calculate EcoScore for a task
- `POST /api/config/simulation` - Configure simulation parameters

**Why**: Separates concerns into logical route modules. Easy to add service layers later.

---

### 5. Routes Package Initialization (`backend/routes/__init__.py`)
**Purpose**: Exports all blueprints for clean importing in app.py

---

### 6. Backend Dependencies (`backend/requirements.txt`)
Includes:
- Flask 3.0.0 - Web framework
- Flask-CORS 4.0.0 - Cross-origin requests
- Flask-SQLAlchemy 3.1.1 - ORM (ready for Phase 2)
- python-dotenv 1.0.0 - Environment variables
- requests 2.31.0 - HTTP client for API calls

---

### 7. Configuration & Setup Documentation

#### `.env.example` - Environment template
Template for configuring backend with:
- Flask environment settings
- Database URL
- Electricity Maps API key placeholder
- Grid configuration (zone, thresholds)
- Simulation settings

#### `SETUP.md` - Developer setup guide
Complete guide including:
- Architecture overview
- Prerequisites
- Backend setup (Python virtual environment, pip install, running)
- Frontend setup (npm install, dev server)
- Integration testing steps
- All Phase 1 API endpoints
- Troubleshooting guide
- Next steps for Phase 2+

---

## 📊 Project Structure After Phase 1

```
EcoTime2/
├── backend/
│   ├── app.py                 (Flask app factory)
│   ├── requirements.txt       (Python dependencies)
│   ├── __init__.py
│   └── routes/
│       ├── __init__.py
│       ├── carbon.py          (Carbon data endpoints)
│       ├── activities.py       (Task CRUD endpoints)
│       └── optimizer.py        (Scheduling endpoints)
├── src/
│   ├── types/
│   │   └── domain.ts          (Shared types)
│   ├── services/
│   │   └── api.ts             (Frontend API client)
│   ├── components/            (Existing UI components)
│   ├── utils/                 (Existing algorithms)
│   └── [other existing files]
├── .env.example               (Configuration template)
├── SETUP.md                   (Setup guide)
└── [other existing files]
```

---

## 🧪 Verification & Build Status

✅ **Backend**: Python syntax verified
✅ **Frontend**: TypeScript compilation clean (npx tsc --noEmit)
✅ **Production Build**: Success (dist/ artifacts generated)

---

## 🚀 How to Use Phase 1

### Quick Start

**Terminal 1 - Start Backend**:
```bash
cd backend
pip install -r requirements.txt  # One-time setup
python app.py
```

**Terminal 2 - Start Frontend**:
```bash
npm install  # One-time setup
npm run dev
```

**Browser**:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000/api
- Health Check: http://localhost:5000/api/health

---

## 📋 Phase 1 Deliverables Checklist

- ✅ Shared domain types defined
- ✅ Frontend API client with fallback
- ✅ Flask backend skeleton
- ✅ Route stubs for all planned endpoints
- ✅ Backend dependencies file
- ✅ Configuration template
- ✅ Setup & troubleshooting documentation
- ✅ Build verification (both frontend and backend)

---

## 🔄 What's Stubbed (Ready for Phase 2)

The following are marked with `TODO` comments and ready for Phase 2 implementation:

1. **Carbon Service** - Real Electricity Maps API integration
2. **Database Layer** - SQLite/PostgreSQL persistence
3. **Activity Service** - Database queries for tasks
4. **Optimizer Service** - Algorithm implementations moving from frontend to backend
5. **Simulation Service** - Carbon data generation on backend

Each `TODO` indicates where service logic should be injected.

---

## 🎯 Phase 2 Preview

Phase 2 will:
1. Implement database models and persistence
2. Create service layer classes for carbon, activities, and optimization
3. Integrate real carbon data from Electricity Maps API
4. Add algorithm implementations on the backend
5. Refactor frontend to use backend APIs
6. Add basic tests

---

## 📝 Key Design Decisions

1. **Shared Types**: Both frontend and backend import from `src/types/domain.ts` to prevent drift
2. **Graceful Degradation**: Frontend works in simulation mode if backend is unavailable
3. **Modular Routes**: Each feature (carbon, activities, optimizer) is a separate blueprint for clarity
4. **Environment-Based Config**: Same code runs in dev, test, and production with environment variables
5. **Vite for Frontend**: Uses `import.meta.env` for environment variables (Vite standard)

---

## 🔗 Documentation Links

- [SETUP.md](SETUP.md) - Complete setup and running guide
- [implementation_plan.md](implementation_plan.md) - Original Milestone 1 plan
- [README.md](README.md) - Project overview (to be updated in Phase 2)

---

## ✨ Next Steps

1. **Review Phase 1** with stakeholders
2. **Start Phase 2** when ready:
   - Implement database models
   - Create service classes
   - Add persistence layer
   - Test integration end-to-end

For questions or issues, refer to SETUP.md or the troubleshooting section.
