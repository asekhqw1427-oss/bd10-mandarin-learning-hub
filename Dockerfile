# Repository-root entry point for Render's single-service API deployment.
# Keep the same converter runtime as services/slide-converter/Dockerfile.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-impress poppler-utils python3 python3-venv fonts-noto-cjk fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 renderer
WORKDIR /app
COPY services/slide-converter/requirements.txt /app/requirements.txt
RUN python3 -m venv /app/venv && /app/venv/bin/pip install --no-cache-dir -r /app/requirements.txt
ENV PATH="/app/venv/bin:${PATH}"
COPY services/slide-converter/server.py /app/server.py
USER renderer
EXPOSE 8080
CMD ["python3", "/app/server.py"]
