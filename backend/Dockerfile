FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Fail the image build if any FastAPI route/module has an import-time error
# (for example, an undefined Pydantic request type in a route annotation).
RUN python -m compileall -q app \
    && DATABASE_URL=sqlite:////tmp/ghm-build-smoke.db SECRET_KEY=ghm-build-smoke-only python -c "import app.main; print('GHM backend import smoke test passed')"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
