# MicroService ERP & Automation Platform

Enterprise-grade Project Management, Automation, and Resource Planning ERP built with Next.js 16 (React 19) and FastAPI.

---

## Architecture Overview

```
├── frontend/          # Next.js 16 App Router Frontend (Vercel deployment)
│   ├── app/           # App routes (Dashboard, Projects, Costing, SOA, Inventory, Users)
│   ├── components/    # Reusable UI components & modals
│   ├── lib/           # API clients, store utilities, and PDF generation
│   └── package.json
├── backend/           # FastAPI 0.115+ Python Backend (Render deployment)
│   ├── app/
│   │   ├── api/v1/    # REST API endpoints (Auth, Projects, Inventory, Manpower, etc.)
│   │   ├── core/      # Security, JWT, hashing, password management
│   │   ├── db/        # SQLAlchemy session, engine, connection pool, and migrations
│   │   ├── models/    # Database models
│   │   └── schemas/   # Pydantic validation schemas
│   ├── requirements.txt
│   └── run.py
├── .gitignore         # Monorepo gitignore (strictly excludes secrets, node_modules, .venv)
└── README.md
```

---

## Environment Variables

### Backend (`backend/.env`)
Copy `backend/.env.example` to `backend/.env`:
```env
PROJECT_NAME="MicroService ERP"
API_V1_STR="/api/v1"
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
ADMIN_USERNAME="admin"
ADMIN_EMAIL="admin@microservice.io"
ADMIN_PASSWORD="YourSecurePassword"
JWT_SECRET="your-jwt-secret-key"
JWT_ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=1440
STORAGE_ROOT="./storage/MicroServiceData"
BACKEND_CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

### Frontend (`frontend/.env.local`)
Copy `frontend/.env.example` to `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

---

## Local Development

### 1. Backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt
python run.py
# Backend runs on http://127.0.0.1:8000 (API Docs: http://127.0.0.1:8000/docs)
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:3000
```

---

## Production Deployment

### 1. Backend Deployment (Render)
- **Service Type**: Web Service
- **Root Directory**: `backend`
- **Environment**: Python 3
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `DATABASE_URL`: Your PostgreSQL / Neon connection string
  - `JWT_SECRET`: Secure random string
  - `ADMIN_PASSWORD`: Admin initial password

### 2. Frontend Deployment (Vercel)
- **Framework Preset**: Next.js
- **Root Directory**: `frontend`
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL`: `https://<your-backend-url>.onrender.com/api/v1`
  - `NEXT_PUBLIC_BACKEND_URL`: `https://<your-backend-url>.onrender.com`
