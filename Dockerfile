# MyLokalEvent — container image (Fly.io, Railway, Render, any host).
# Build from the REPO ROOT:  docker build -t mylokalevent .
FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (better layer caching).
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend + frontend, preserving the sibling layout main.py expects.
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
