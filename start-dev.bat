@echo off
rem ResumeStudio AI - starts PostgreSQL (Docker), the NestJS API and the Angular app.
cd /d "%~dp0"

echo Starting PostgreSQL (Docker)...
docker compose up -d
if errorlevel 1 (
  echo.
  echo Docker is not running. Start Docker Desktop and run this script again.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo Installing backend packages...
  pushd backend && call npm install && popd
)
if not exist "frontend\node_modules" (
  echo Installing frontend packages...
  pushd frontend && call npm install && popd
)

start "ResumeStudio API (port 3000)" cmd /k "cd /d ""%~dp0backend"" && npm run start:dev"
start "ResumeStudio Web (port 4200)" cmd /k "cd /d ""%~dp0frontend"" && npm start"

echo.
echo Backend : http://localhost:3000/api/health
echo Frontend: http://localhost:4200  (opens in about 20 seconds)
timeout /t 20 /nobreak >nul
start "" http://localhost:4200
