# AWS(EC2) 배포 — 백엔드 빌드 오류 방지

## 원인

`npm install --omit=dev` 또는 `NODE_ENV=production npm install` 후 `npm run build`(`tsc`)를 실행하면, 예전에는 `devDependencies`에만 있던 `@types/express`, `@types/cors`, `typescript` 등이 설치되지 않아 **TS7016 / implicit any** 오류가 수백 개 발생합니다.

## 권장 배포 순서 (EC2)

```bash
cd /var/www/baeshsocial
git pull origin main

# 백엔드
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
# 선택: 용량 줄이기 — 빌드 후에만 dev 제거 (tsx 등)
# npm prune --omit=dev

# 프론트
cd ../frontend
npm ci
npm run build
```

**주의:** `npm run build` **전에** `npm ci --omit=dev` 하지 마세요.

## 한 줄 요약

| 단계 | 명령 |
|------|------|
| 의존성 | `npm ci` (dev 포함) |
| DB | `npx prisma migrate deploy` |
| 백엔드 빌드 | `npm run build` |
| 실행 | `npm run start` 또는 pm2 |

백엔드 재시작 후 헬스체크:

```bash
curl http://127.0.0.1:4000/api/health
```
