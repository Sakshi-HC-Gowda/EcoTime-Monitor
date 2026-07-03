# EcoTime Phase 1 Setup Guide

This document explains how to set up and run the EcoTime platform with the Phase 1 foundation.

## Architecture Overview

EcoTime consists of two main components:

- **Frontend**: React + TypeScript + Vite (runs on http://localhost:5173)
- **Backend**: Flask + Python (runs on http://localhost:5000)

The frontend can work in two modes:
1. **Connected Mode**: Communicates with the backend for data persistence and scheduling
2. **Simulation Mode**: Works entirely in the browser with mock data (falls back when backend is unavailable)

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+
- pip (Python package manager)

## Backend Setup (Python)

### 1. Navigate to Backend Directory
```bash
cd backend
```

### 2. Create Virtual Environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment
```bash
# Copy the example env file
cp ..\.env.example .env  # Windows
cp ../.env.example .env  # macOS/Linux

# Edit .env with your Electricity Maps API key (optional for simulation mode)
```

### 5. Run Backend
```bash
python app.py
```

The backend will start on `http://localhost:5000/api`

You should see:
```
 * Serving Flask app 'app'
 * Debug mode: on
 * Running on http://127.0.0.1:5000
```

### 6. Verify Backend Health
```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-07-02T...",
  "version": "1.0.0"
}
```

## Frontend Setup (Node.js)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Backend URL (Optional)
If the backend is not at the default `http://localhost:5000/api`, create a `.env.local` file:

```bash
REACT_APP_API_BASE=http://localhost:5000/api
```

### 3. Run Development Server
```bash
npm run dev
```

The frontend will start on `http://localhost:5173`

### 4. Build for Production
```bash
npm run build
```

## Testing the Integration

1. **Start Backend** (Terminal 1):
   ```bash
   cd backend
   python app.py
   ```

2. **Start Frontend** (Terminal 2):
   ```bash
   npm run dev
   ```

3. **Open Browser**:
   Navigate to `http://localhost:5173`

4. **Test Features**:
   - Dashboard: Loads carbon data (simulated)
   - Simulator: Create tasks and run algorithms
   - Settings: Change zone and thresholds
   - Console Logs: Monitor actions in real-time

## Phase 1 Endpoints

### Carbon Data
- `GET /api/carbon?zone=US-CA&offset=0` - Get carbon intensity data
- `GET /api/windows?zone=US-CA&threshold=180` - Get green windows

### Activities
- `POST /api/activities` - Create a new task
- `GET /api/activities` - List all tasks
- `GET /api/activities/:id` - Get task details
- `PATCH /api/activities/:id` - Update task
- `DELETE /api/activities/:id` - Delete task

### Optimization
- `POST /api/scheduler` - Run greedy or knapsack scheduler
- `GET /api/eco-score?taskId=...` - Calculate EcoScore
- `POST /api/config/simulation` - Set simulation parameters

### Health
- `GET /api/health` - Backend health check
- `GET /` - Root info endpoint

## Known Limitations (Phase 1)

- Data is not persisted to database yet (will be Phase 2)
- Electricity Maps API integration is stubbed (will be Phase 2)
- No user authentication (will be Phase 3+)
- Tests are not implemented yet (will be Phase 5)

## Next Steps (Phase 2+)

- Implement database models and persistence
- Add real Electricity Maps API integration
- Implement carbon service layer
- Add automated tests
- Build scheduler service implementations

## Troubleshooting

### Backend won't start
- Ensure Python 3.10+ is installed: `python --version`
- Check that port 5000 is not in use: `lsof -i :5000` (macOS/Linux)
- Try a different port: `python app.py --port 5001`

### Frontend can't connect to backend
- Verify backend is running on http://localhost:5000/api/health
- Check CORS settings in `backend/app.py`
- Frontend will fall back to simulation mode if backend is unavailable

### Port already in use
- Backend (Flask): Change port in `app.py` line
- Frontend (Vite): Automatically uses next available port

## Development Workflow

1. Modify backend routes in `backend/routes/`
2. Backend auto-reloads (Flask debug mode enabled)
3. Modify frontend components in `src/components/`
4. Frontend hot-reloads (Vite HMR enabled)
5. Test both modes: with backend and in simulation mode (stop backend)

## Questions?

Refer to the main README.md for architecture overview and the implementation_plan.md for the milestone breakdown.
