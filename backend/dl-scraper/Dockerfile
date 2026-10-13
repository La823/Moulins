FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

RUN useradd --system --no-create-home --uid 10001 app
USER app

EXPOSE 5002

CMD ["python", "app.py"]
