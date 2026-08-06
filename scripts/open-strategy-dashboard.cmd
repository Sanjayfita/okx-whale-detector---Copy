@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0.."
pushd "%PROJECT_ROOT%" || exit /b 1

set "EVALUATION_ID=%~1"
if not defined EVALUATION_ID set "EVALUATION_ID=strategy-eval-2026-08-06-v1"

set "STRATEGY_DASHBOARD_PORT=%~2"
if not defined STRATEGY_DASHBOARD_PORT set "STRATEGY_DASHBOARD_PORT=4175"

if not exist "data\strategy-evaluations\%EVALUATION_ID%" (
  echo ERROR: Strategy evaluation directory not found:
  echo   data\strategy-evaluations\%EVALUATION_ID%
  echo.
  echo Available evaluations:
  dir /b /ad /o-d "data\strategy-evaluations" 2>nul
  popd
  exit /b 1
)

if not exist "src\tools\serveStrategyResearchDashboard.ts" (
  echo ERROR: Browser strategy dashboard source is missing.
  echo Pull the latest feature branch first:
  echo   git fetch origin
  echo   git checkout feature/r21-strategy-redesign
  echo   git pull --ff-only origin feature/r21-strategy-redesign
  popd
  exit /b 1
)

echo ================================================================
echo Strategy Research Browser Dashboard
echo ================================================================
echo Evaluation: %EVALUATION_ID%
echo URL:        http://127.0.0.1:%STRATEGY_DASHBOARD_PORT%
echo Mode:       READ ONLY - PAPER ONLY - EXECUTION DISABLED
echo ================================================================

start "" "http://127.0.0.1:%STRATEGY_DASHBOARD_PORT%"
set "STRATEGY_DASHBOARD_PORT=%STRATEGY_DASHBOARD_PORT%"
npx.cmd tsx src\tools\serveStrategyResearchDashboard.ts "%EVALUATION_ID%"

popd
endlocal
