# AWS(EC2) 배포

정식 배포는 GitHub Actions(`deploy-staging.yml`, `deploy-production.yml`)와 `deploy/scripts/deploy.sh`로 합니다.
서버 구성·배포·롤백·복원 절차는 [RUNBOOK.md](./RUNBOOK.md)를 따르세요. 이 문서는 구성 요약과 빌드 주의사항입니다.
스테이징 AWS 리소스는 `deploy/scripts/provision-staging.sh`로 만들고, 순서는 [STAGING-AWS.md](./STAGING-AWS.md) 체크리스트를 따릅니다.

## 구성

| 구성 요소 | 권장 |
|-----------|------|
| 서버 | EC2 (Ubuntu, Node 22, PM2, nginx), 환경별 `/srv/baesh/<env>` |
| DB | RDS PostgreSQL 16 (자동 백업·PITR 켜기) + 일일 `pg_dump`(S3) |
| 파일 | S3 비공개 버킷 2개: 증빙·보고서(`S3_BUCKET`), 백업(`BACKUP_S3_BUCKET`) — `deploy/scripts/s3-setup.sh`로 보안 설정 |
| 공개 미디어 | CloudFront (OAC) → `S3_BUCKET`의 `media/` 접두사, `MEDIA_PUBLIC_BASE_URL` |
| 비밀값 | SSM Parameter Store `/baesh/<env>/*` (SecureString) → `render-env.sh`가 `shared/backend.env` 생성 |
| 메일 | SES (`MAIL_DRIVER=ses`) |
| PDF | Playwright Chromium + 한글 폰트: `npx playwright install --with-deps chromium`, `apt install fonts-noto-cjk` |
| 모니터링 | 앱 내 `/admin/ops`, Sentry(`SENTRY_DSN`), CloudWatch(EC2·RDS), GitHub `uptime.yml` |

EC2 인스턴스 역할(IAM)에 필요한 권한: 두 버킷의 `s3:GetObject/PutObject/DeleteObject/ListBucket/GetObjectVersion/ListBucketVersions`,
버킷 설정 조회(`GetBucketVersioning/GetBucketEncryption/GetPublicAccessBlock/GetLifecycleConfiguration`),
`ssm:GetParametersByPath`(`/baesh/<env>/`), `kms:Decrypt/GenerateDataKey`, `ses:SendEmail`.

## 릴리스 묶음

CI가 `deploy/scripts/package-release.sh`로 만듭니다 (서버에서 빌드하지 않음).

```bash
VITE_API_URL=https://api.baesh.kr/api deploy/scripts/package-release.sh <git-sha> release.tgz
```

포함: `backend/{dist,prisma,scripts,package.json,package-lock.json,prisma.config.ts,tsconfig.json}`, `frontend/dist`, `deploy/`, `RELEASE.json`.
서버의 `deploy.sh`가 운영 의존성 설치 → `prisma generate` → (운영) 사전 백업 → `migrate deploy` → 전환 → 헬스 확인을 합니다.

## 빌드 주의사항

`npm install --omit=dev` 후 `npm run build`(`tsc`)를 실행하면 `@types/*`, `typescript`가 없어 TS7016 오류가 수백 개 납니다.
빌드는 반드시 dev 의존성을 포함한 `npm ci` 후에 하고, 운영 의존성만 남기는 작업은 빌드가 끝난 뒤에 합니다.

## 상태 확인

```bash
curl https://api.baesh.kr/api/health         # 프로세스 살아 있음
curl https://api.baesh.kr/api/health/ready   # DB 연결 + 배포 버전(version = git sha)
```
