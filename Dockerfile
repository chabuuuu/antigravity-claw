FROM python:3.11-slim

# Install system utilities and git
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    sqlite3 \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create volume directories
RUN mkdir -p data logs /workspace

ENV OPENCLAW_HOST=0.0.0.0
ENV OPENCLAW_PORT=8080
ENV OPENCLAW_WORKSPACE=/workspace

EXPOSE 8080

CMD ["python3", "-m", "backend.app"]

