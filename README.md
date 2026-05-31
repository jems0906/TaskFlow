# TaskFlow

TaskFlow is a full-stack internal workflow product built with React, TypeScript, Node.js, Express, Prisma, and PostgreSQL. Teams can create projects, add and assign tasks, track progress across Todo/In Progress/Done states, comment on work, and review a shared activity feed.

## Included capabilities

- JWT authentication with register and sign-in flows
- Team and project creation
- Task CRUD with assignees, due dates, and status transitions
- Task comments and activity history
- Search and filtering by status, assignee, text, and due date
- Notifications for new task assignments
- Role-based task permissions for editing and deleting work items
- Drag-and-drop task board interaction for moving tasks between states
- Basic analytics for total tasks, overdue tasks, and completion rate
- Seed data for a realistic internal demo workspace

## Project structure

- `frontend/` React + TypeScript + Vite UI
- `backend/` Express API with Prisma ORM
- `docker-compose.yml` local PostgreSQL service

## Local setup

1. Start PostgreSQL:

   ```powershell
   docker compose up -d
   ```

2. Create local env files:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   Copy-Item frontend/.env.example frontend/.env
   ```

3. Install dependencies if needed:

   ```powershell
   Set-Location backend
   npm install
   Set-Location ../frontend
   npm install
   ```

   If frontend install hangs on Windows, use the retry helper:

   ```powershell
   Set-Location frontend
   npm run install:retry
   ```

   Recommended Windows retry settings for this workspace:

   ```powershell
   Set-Location frontend
   $env:INSTALL_TIMEOUT_MS='120000'
   $env:INSTALL_RETRIES='2'
   $env:INSTALL_RETRY_CLEANUP='full'
   npm run install:retry
   ```

   Cleanup modes:

   - `none`: retry without deleting anything between attempts
   - `partial`: delete transient hidden package folders such as `.typescript-*`
   - `full`: delete `node_modules` between attempts before retrying

   On Windows non-system-drive workspaces, the frontend commands now stage automatically to `C:` when needed, so `npm run lint`, `npm run build`, `npm run dev`, and `npm run preview` work without a separate manual workaround command.

4. Prepare the database and demo data:

   ```powershell
   Set-Location backend
   npm run prisma:generate
   npm run prisma:push
   npm run seed
   ```

5. Run the app:

   ```powershell
   # Terminal 1
   Set-Location backend
   npm run dev

   # Terminal 2
   Set-Location frontend
   npm run dev
   ```

## Smoke validation

- Run backend smoke checks locally:

   ```powershell
   Set-Location backend
   npm run smoke
   ```

- CI automation:

   - Workflow: `.github/workflows/ci.yml` (contains both backend smoke and frontend checks)
   - Triggered on backend, frontend, and workflow changes in push and pull request events
   - Runs backend smoke checks and frontend lint/build checks

## Deploy to Render

This repository includes a Render Blueprint file at `render.yaml` for a 3-service deploy:

- `taskflow-postgres` (Render Postgres)
- `taskflow-api` (Node web service from `backend/`)
- `taskflow-web` (static site from `frontend/`)

Deploy steps:

1. In Render, choose **New +** -> **Blueprint**.
2. Connect/select this GitHub repo (`jems0906/TaskFlow`) and branch `main`.
3. Render will detect `render.yaml` and show all services.
4. When prompted for environment variables with `sync: false`, set:
   - `taskflow-web` -> `VITE_API_URL` = `https://<taskflow-api-onrender-domain>/api`
   - `taskflow-api` -> `CLIENT_URL` = `https://<taskflow-web-onrender-domain>`
5. Create the Blueprint and wait for deploys to complete.

After first deploy, if the API deploy ran before `CLIENT_URL` was set, update it in the Render dashboard and redeploy the API once.

## Demo accounts

- `alex@taskflow.local` / `password123`
- `maya@taskflow.local` / `password123`
- `jordan@taskflow.local` / `password123`

You can also register a new user from the sign-in screen.