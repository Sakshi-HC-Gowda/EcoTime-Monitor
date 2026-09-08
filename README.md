# 🌱 EcoTime – Intelligent Carbon-Aware Digital Activity Optimizer

> **A Full-Stack Platform for Sustainable Digital Workload Scheduling using Machine Learning and Carbon-Aware Optimization**

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![Python](https://img.shields.io/badge/Python-3.11-green?logo=python)
![Flask](https://img.shields.io/badge/Flask-Backend-black?logo=flask)
![SQLite](https://img.shields.io/badge/Database-SQLite-blue)
![Machine Learning](https://img.shields.io/badge/Machine%20Learning-scikit--learn-orange)
![Algorithms](https://img.shields.io/badge/Algorithms-Greedy%20%7C%200%2F1%20Knapsack-success)

---

# 📖 Overview

EcoTime is an intelligent carbon-aware scheduling platform that helps reduce the environmental impact of flexible digital workloads.

Instead of executing workloads immediately, EcoTime forecasts future electricity carbon intensity, identifies low-carbon **Green Windows**, and recommends environmentally optimal execution times.

The platform combines:

- Machine Learning-based Carbon Forecasting
- Green Window Detection
- Intelligent Workload Scheduling
- Sustainability Analytics
- Real-time Carbon Monitoring
- Carbon Savings Estimation

---

# 🚀 Problem Statement

Modern digital workloads such as cloud backups, software updates, AI model training, CI/CD pipelines, and large file transfers are typically executed without considering fluctuations in electricity carbon intensity. This leads to avoidable carbon emissions and inefficient energy utilization.

EcoTime addresses this challenge by enabling **carbon-aware scheduling**, allowing flexible workloads to execute during periods of lower carbon intensity while maintaining operational efficiency.

---

# ✨ Key Features

## 🌍 Carbon Intelligence

- Real-time Carbon Intensity Monitoring
- Historical Carbon Analysis
- Carbon Forecast Visualization
- Sustainability Dashboard

---

## 🤖 Machine Learning Forecasting

- Historical Carbon Data Processing
- Feature Engineering Pipeline
- Automatic Model Selection
- Future Carbon Intensity Prediction

Supported Models

- Linear Regression
- Random Forest Regressor
- XGBoost Regressor

The system automatically selects the best-performing model using **TimeSeriesSplit Cross Validation**.

---

## 🟢 Green Window Detection

Automatically identifies low-carbon execution periods by analyzing forecasted carbon intensity.

Displays:

- Recommended Time Windows
- Window Score
- Average Carbon Intensity
- Window Duration

---

## 📋 Activity Management

Register flexible digital workloads including:

- File Upload
- Cloud Backup
- Dataset Download
- Software Update
- Batch Processing
- CI/CD Pipeline

Each activity stores:

- Duration
- Power Consumption
- Priority Score
- Flexibility Score
- Estimated EcoScore
- Carbon Impact
- Recommended Execution Time

---

## ⚡ Carbon-Aware Optimization

Two optimization strategies are implemented.

### Greedy Scheduler

Prioritizes workloads using:

```
Priority = Duration × Power Draw
```

Fast scheduling suitable for real-time recommendations.

---

### 0/1 Knapsack Optimizer

Treats

- Green Window Duration → Capacity
- Task Duration → Weight
- Carbon Savings × Priority × Flexibility → Value

Finds the optimal workload combination maximizing carbon savings.

---

## 📁 File Upload Workflow

Supports

- Native File Picker
- Upload Progress Tracking
- Backend Storage
- Upload Metadata
- Activity Lifecycle
- Scheduled Upload Queue

Uploaded files are stored inside

```
backend/uploads/
```

---

## 📊 Sustainability Analytics

Provides

- Estimated CO₂ Savings
- Energy Consumption
- EcoScore
- Carbon Reduction Metrics

---

# 🔄 System Workflow

```text
User
   │
   ▼
Register Activity
   │
   ▼
Carbon Service
(Electricity Maps API / Simulation)
   │
   ▼
Historical Carbon Data
   │
   ▼
Preprocessing
   │
   ▼
Feature Engineering
   │
   ▼
Machine Learning Forecast
   │
   ▼
Green Window Detection
   │
   ▼
Greedy / Knapsack Optimization
   │
   ▼
Optimized Execution Recommendation
   │
   ▼
Estimated CO₂ Savings
```

---

# 🛠 Technology Stack

## Frontend

- React.js
- TypeScript
- Vite
- Tailwind CSS
- Recharts

---

## Backend

- Flask
- Python
- REST APIs
- SQLite

---

## Machine Learning

- scikit-learn
- XGBoost
- Pandas
- NumPy
- Joblib

---

## Optimization

- Greedy Algorithm
- 0/1 Knapsack Algorithm

---

## Version Control

- Git
- GitHub

---

# 🤖 Machine Learning Pipeline

The forecasting module follows this pipeline.

```text
Historical Carbon Data
        │
        ▼
Preprocessing
        │
        ▼
Feature Engineering
        │
        ▼
Train 3 Regression Models

 • Linear Regression
 • Random Forest
 • XGBoost

        │
        ▼
TimeSeriesSplit Cross Validation
        │
        ▼
Model Evaluation

 MAE
 RMSE
 R² Score

        │
        ▼
Best Model Selected
        │
        ▼
Future Carbon Forecast
```

---

# ⚙ Optimization Pipeline

```text
Forecasted Carbon Intensity
            │
            ▼
Green Window Detection
            │
            ▼
Flexible Activities
            │
            ▼
Greedy Scheduler
      OR
0/1 Knapsack Optimizer
            │
            ▼
Recommended Schedule
            │
            ▼
Estimated Carbon Savings
```

---

# 📂 Project Structure

```text
EcoTime/
│
├── backend/
│   ├── forecast/
│   ├── optimization/
│   ├── routes/
│   ├── services/
│   ├── models/
│   ├── uploads/
│   └── app.py
│
├── src/
│   ├── pages/
│   ├── features/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── types/
│
├── package.json
├── requirements.txt
└── README.md
```

---

# 🚀 Installation

## Clone Repository

```bash
git clone https://github.com/<your-username>/EcoTime-Monitor.git

cd EcoTime-Monitor
```

---

## Backend Setup

```bash
cd backend

python -m venv .venv

pip install -r requirements.txt

python app.py
```

---

## Frontend Setup

```bash
npm install

npm run dev
```

---

# 📈 Results

EcoTime successfully demonstrates:

- Carbon-aware scheduling of digital workloads
- Machine Learning-based carbon forecasting
- Green Window identification
- Intelligent workload optimization
- Real-time sustainability analytics
- Estimated CO₂ savings for flexible workloads

---

# 🔮 Future Enhancements

- AI-powered RAG Sustainability Assistant
- Automatic Background Scheduler
- Enterprise EcoScore Dashboard
- CI/CD Integration
- Cloud Deployment
- Carbon Credit Reporting
- Multi-user Authentication
- Mobile Application

---

# 👥 Contributors

- **Sakshi H C**
- Project Team Members

---

# 📜 License

This project was developed as part of the **Bachelor of Engineering (Computer Science & Engineering) Major Project**.

---

# 🙏 Acknowledgements

- Electricity Maps API
- React
- Flask
- scikit-learn
- XGBoost
- Tailwind CSS
- Recharts
- Open Source Community

---

⭐ **If you found this project useful, consider giving it a Star on GitHub!**
