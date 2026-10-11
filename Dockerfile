FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080 DATABASE_PATH=/data/ue4-manager.sqlite3
WORKDIR /app
COPY app/ /app/app/
COPY web/ /app/web/
RUN useradd --uid 10001 --create-home ue4 && mkdir -p /data && chown -R ue4:ue4 /data /app
USER ue4
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz',timeout=3).read()"
CMD ["python", "-m", "app.server"]
