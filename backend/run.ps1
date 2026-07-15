z# Start the MyLokalEvent backend (Windows / PowerShell).
# Usage:  ./run.ps1
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment (Python 3.13)..." -ForegroundColor Cyan
    py -3.13 -m venv .venv
    .\.venv\Scripts\python.exe -m pip install --upgrade pip
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}
Write-Host "Starting server at http://localhost:8000 ..." -ForegroundColor Green
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
