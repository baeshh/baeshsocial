# AWS(EC2) — 프로필만 구글 검색 노출

게시물(`/p/`)은 검색 대상에서 제외하고, 공개 프로필(`/u/{userId}`)만 색인합니다.

## 백엔드 제공 경로

| 경로 | 설명 |
|------|------|
| `GET /robots.txt` | 크롤러 규칙 (`/u/` 허용, `/p/` 차단) |
| `GET /sitemap.xml` | 프로필 URL 목록 (DB 사용자) |
| `GET /u/:userId` | 검색·미리보기용 HTML (이름, 소개, 스킬 등) |

`FRONTEND_URL` 환경 변수에 실제 도메인(예: `https://baeshdev.cloud`)이 설정되어 있어야 canonical·사이트맵 URL이 맞습니다.

## nginx 설정 (EC2)

정적 프론트는 그대로 두고, 아래만 Node(4000)로 넘깁니다.

```nginx
# /etc/nginx/sites-available/baesh (예시)

upstream baesh_api {
  server 127.0.0.1:4000;
}

server {
  listen 443 ssl;
  server_name baeshdev.cloud;

  root /var/www/baesh/frontend/dist;
  index index.html;

  location = /robots.txt {
    proxy_pass http://baesh_api;
    proxy_set_header Host $host;
  }

  location = /sitemap.xml {
    proxy_pass http://baesh_api;
    proxy_set_header Host $host;
  }

  # 공개 프로필 — 검색엔진·SNS 미리보기용 HTML
  location ~ ^/u/[^/]+$ {
    proxy_pass http://baesh_api;
    proxy_set_header Host $host;
  }

  location /api/ {
    proxy_pass http://baesh_api;
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

적용:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Google Search Console

1. [Google Search Console](https://search.google.com/search-console)에 `baeshdev.cloud` 등록
2. **Sitemaps** → `https://baeshdev.cloud/sitemap.xml` 제출
3. 며칠~몇 주 후 `site:baeshdev.cloud 홍길동` 형태로 점진적 노출

이름 검색은 프로필에 **이름·한 줄 소개·스킬**이 채워져 있을수록 잘 잡힙니다.

## 확인

```bash
curl -s https://baeshdev.cloud/robots.txt
curl -s https://baeshdev.cloud/sitemap.xml | head
curl -s https://baeshdev.cloud/u/{USER_ID} | head -40
```

HTML에 `<title>`, `meta description`, `application/ld+json`(Person)이 보이면 정상입니다.
