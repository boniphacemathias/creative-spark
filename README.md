# Creative Spark Monorepo

This project is now split into two local apps:

- `frontend/` - React + Vite UI
- `backend/` - Node.js API server

## Localhost Setup

### 1) Run backend

```sh
cd backend
npm run dev
```

Backend runs on `http://127.0.0.1:8787`.

### 2) Run frontend

In a second terminal:

```sh
cd frontend
npm run dev
```

Frontend runs on Vite's default localhost URL (usually `http://127.0.0.1:5173`).

## Frontend Environment

Use `frontend/.env.example` as reference:

```sh
VITE_CAMPAIGN_API_BASE_URL=http://127.0.0.1:8787
# If backend auth token is enabled:
# VITE_BACKEND_AUTH_TOKEN=your_secure_token
```

## Backend AI Environment (OpenRouter + Gemini)

Set these before running `backend`:

```sh
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-4o-mini
GEMINI_API_KEY=your_gemini_api_key
AI_PROVIDER_DEFAULT=openrouter
STORAGE_MODE=mysql
BACKEND_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://localhost:8081,http://127.0.0.1:8081
# Optional: protect /api/* endpoints with a shared token
# BACKEND_AUTH_TOKEN=your_secure_token
# Optional: tune backend rate limiting
# BACKEND_RATE_LIMIT_WINDOW_MS=60000
# BACKEND_RATE_LIMIT_MAX_REQUESTS=180
# MYSQL_URL=mysql://user:password@127.0.0.1:3306/creative_spark
# Or:
# MYSQL_HOST=127.0.0.1
# MYSQL_PORT=3306
# MYSQL_DATABASE=creative_spark
# MYSQL_USER=root
# MYSQL_PASSWORD=secret
# MYSQL_CONNECTION_LIMIT=10
# Optional:
# OPENROUTER_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
# OPENROUTER_TIMEOUT_MS=45000
# OPENROUTER_APP_NAME=Creative Spark Backend
# OPENROUTER_APP_URL=http://127.0.0.1:8787
# GEMINI_MODEL=gemini-1.5-flash
# GEMINI_ENDPOINT_BASE=https://generativelanguage.googleapis.com/v1beta/models
# GEMINI_TIMEOUT_MS=45000
```

## Quick Notes

- Campaign, AI Drive, and chat state persistence is handled by MySQL (`platform_state` table) when `STORAGE_MODE=mysql`.
- For JSON file fallback storage, explicitly set `STORAGE_MODE=file` (uses `backend/data/`).
- Frontend campaign APIs are called from `src/lib/campaign-storage.ts`.
- Workspace scoping is enabled through `X-Workspace-Id` for Campaign, AI Drive, Chat, and AI generation endpoints.

## Workspace Smoke Test

Run a quick isolation check across Campaigns + Drive + Chat:

```sh
cd backend
npm run smoke:workspace
```

Optional custom port:

```sh
cd backend
npm run smoke:workspace -- 8899
```
