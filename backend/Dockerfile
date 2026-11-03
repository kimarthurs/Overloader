FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 한글 폰트(나눔글꼴) 및 헬스체크용 curl 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-nanum \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 복사 및 설치 (캐시 활용)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 백엔드 소스 복사 (.dockerignore 적용)
COPY . .

# 컨테이너 내부 0.0.0.0:8000 바인딩 실행
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
