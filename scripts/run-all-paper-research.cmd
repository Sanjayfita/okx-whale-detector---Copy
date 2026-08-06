@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0.."
pushd "%PROJECT_ROOT%" || exit /b 1

for /f %%I in ('powershell.exe -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HHmmss"') do set "RUN_STAMP=%%I"

set "STRATEGY_EVALUATION_ID=%~1"
if not defined STRATEGY_EVALUATION_ID set "STRATEGY_EVALUATION_ID=strategy-eval-%RUN_STAMP%-v1"

set "EVIDENCE_EVALUATION_ID=%~2"
if not defined EVIDENCE_EVALUATION_ID set "EVIDENCE_EVALUATION_ID=eval-%RUN_STAMP%-v1"

set "EVIDENCE_DASHBOARD_PORT=%~3"
if not defined EVIDENCE_DASHBOARD_PORT set "EVIDENCE_DASHBOARD_PORT=4174"

echo ================================================================
echo OKX Paper Research Launcher
echo ================================================================
echo Strategy evaluation: %STRATEGY_EVALUATION_ID%
echo Evidence evaluation: %EVIDENCE_EVALUATION_ID%
echo Evidence dashboard:  http://127.0.0.1:%EVIDENCE_DASHBOARD_PORT%
echo.
echo PAPER ONLY - LIVE, TESTNET, AND TRANSPORT EXECUTION REMAIN DISABLED
echo ================================================================
echo.

findstr /C:"strategy:evaluation:init" package.json >nul 2>&1
if errorlevel 1 (
  echo ERROR: The current branch does not contain the R22-R28 strategy scripts.
  echo Run:
  echo   git fetch origin
  echo   git checkout feature/r21-strategy-redesign
  echo   git pull --ff-only origin feature/r21-strategy-redesign
  popd
  exit /b 1
)

if not exist "data\strategy-evaluations\%STRATEGY_EVALUATION_ID%\manifest.json" (
  echo Initializing fresh strategy evaluation...
  call npm.cmd run strategy:evaluation:init -- %STRATEGY_EVALUATION_ID%
  if errorlevel 1 (
    echo ERROR: Strategy evaluation initialization failed.
    popd
    exit /b 1
  )
) else (
  echo Resuming existing strategy evaluation: %STRATEGY_EVALUATION_ID%
)

if not exist "data\evaluations\%EVIDENCE_EVALUATION_ID%\manifest.json" (
  echo Initializing fresh evidence evaluation...
  call npm.cmd run evidence:init -- %EVIDENCE_EVALUATION_ID%
  if errorlevel 1 (
    echo ERROR: Evidence evaluation initialization failed.
    popd
    exit /b 1
  )
) else (
  echo Resuming existing evidence evaluation: %EVIDENCE_EVALUATION_ID%
)

echo.
echo Starting separate windows...

start "Strategy Paper Runtime" cmd.exe /k "pushd ""%PROJECT_ROOT%"" ^&^& set STRATEGY_RESEARCH_ENABLED=true ^&^& set STRATEGY_RESEARCH_DIRECTORY=data\strategy-evaluations\%STRATEGY_EVALUATION_ID% ^&^& npm.cmd run dev"

start "Strategy Research Dashboard" powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%\scripts\watch-strategy-research.ps1" -EvaluationId "%STRATEGY_EVALUATION_ID%" -RefreshSeconds 10

start "Evidence Collector - Legacy Baseline" cmd.exe /k "pushd ""%PROJECT_ROOT%"" ^&^& npm.cmd run evidence:collect -- %EVIDENCE_EVALUATION_ID%"

start "Evidence Profitability Dashboard" cmd.exe /k "pushd ""%PROJECT_ROOT%"" ^&^& set EVIDENCE_DASHBOARD_PORT=%EVIDENCE_DASHBOARD_PORT% ^&^& npm.cmd run evidence:dashboard -- %EVIDENCE_EVALUATION_ID%"

timeout /t 5 /nobreak >nul
start "" "http://127.0.0.1:%EVIDENCE_DASHBOARD_PORT%"

echo.
echo Started:
echo   1. New strategy paper runtime
echo   2. New strategy console dashboard
echo   3. Legacy evidence collector in a separate fresh evaluation
echo   4. Legacy evidence browser dashboard
echo.
echo Strategy files:
echo   data\strategy-evaluations\%STRATEGY_EVALUATION_ID%
echo.
echo Evidence files:
echo   data\evaluations\%EVIDENCE_EVALUATION_ID%
echo.
echo Close each process gracefully with Ctrl+C in its own window.
echo Do not switch branches, pull commits, or modify frozen configuration while running.

popd
endlocal
