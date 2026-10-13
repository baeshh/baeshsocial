# BAESH 운영 런북

장애·배포·복구 때 그대로 따라 하는 절차서입니다. 명령은 서버에서 `baesh` 사용자로 실행합니다.
`<env>`는 `staging` 또는 `production`입니다.

## 0. 서버 구조

```
/srv/baesh/<env>/
├── releases/<git-sha>/        # 배포 단위 (backend/dist, frontend/dist, deploy/)
├── current -> releases/<sha>  # 지금 서비스 중인 릴리스 (원자적 심볼릭 링크 교체)
└── shared/
    ├── backend.env            # SSM에서 생성 (chmod 600, 저장소·CI 로그에 절대 없음)
    ├── storage/{private,media}
    ├── backups/               # 최근 DB 덤프 3개 (원본은 S3)
    └── logs/api.{out,err}.log
```

- API: PM2 `baesh-api-<env>` (fork 1개 — 요청 제한·스케줄러가 프로세스 내부에 있으므로 cluster 금지)
- 웹: nginx가 `current/frontend/dist`를 서빙, `api.baesh.kr`은 127.0.0.1:4000으로 프록시
- 상태 확인: `GET /api/health`(살아 있음), `GET /api/health/ready`(DB 연결·버전)
- 운영 콘솔: `/admin/ops` (플랫폼 관리자만)

## 1. 최초 서버 구성 (1회)

```bash
# 1) 비밀값은 SSM SecureString에만 저장
aws ssm put-parameter --name /baesh/production/JWT_SECRET --type SecureString --value "$(openssl rand -base64 48)"
aws ssm put-parameter --name /baesh/production/OPS_INGEST_TOKEN --type SecureString --value "$(openssl rand -hex 32)"
#    DATABASE_URL, FRONTEND_URL, STORAGE_DRIVER=s3, S3_BUCKET, MEDIA_PUBLIC_BASE_URL, BACKUP_S3_BUCKET,
#    ALERT_WEBHOOK_URL, SENTRY_DSN, MAIL_DRIVER=ses ... 도 같은 경로(/baesh/<env>/)에 등록

# 2) S3 버킷 보안 설정 (버전 관리·퍼블릭 차단·KMS 암호화·TLS 전용·수명 주기)
FILES_BUCKET=baesh-prod-files BACKUP_BUCKET=baesh-prod-backups deploy/scripts/s3-setup.sh

# 3) 첫 배포는 GitHub Actions로 (아래 2장). 배포 후 env 파일 생성 확인
BAESH_ENV=production /srv/baesh/production/current/deploy/scripts/render-env.sh

# 4) 백업·복원 훈련·파일 점검 타이머
sudo cp /srv/baesh/production/current/deploy/systemd/baesh-*@.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now baesh-backup@production.timer baesh-restore-drill@production.timer baesh-file-check@production.timer
systemctl list-timers 'baesh-*'

# 5) nginx
sudo cp /srv/baesh/production/current/deploy/nginx/baesh.conf /etc/nginx/sites-available/baesh.conf
sudo nginx -t && sudo systemctl reload nginx
```

운영 환경은 다음 조건이 하나라도 어긋나면 **API가 시작되지 않습니다**: 기본/짧은 `JWT_SECRET`, 기본 DB 비밀번호,
https가 아닌 `FRONTEND_URL`, `STORAGE_DRIVER≠s3`, `RATE_LIMIT_ENABLED=false`.

## 2. 배포

| 단계 | 방법 |
|------|------|
| CI | 모든 PR과 `main`·`develop`·`feat/**`·`fix/**`·`hotfix/**`·`chore/**`·`release/**` push마다 `ci.yml` 실행. 작업 4개: **Backend tests**(타입 검사·빌드·통합 테스트, 실제 PostgreSQL), **DB migrations**(빈 DB 적용·스키마 차이·데이터 손실 검사·기준 브랜치 데이터 업그레이드 경로), **Frontend build & lint**, **Security scan**(gitleaks·npm audit·.env 커밋 금지) |
| 배포 리허설 | `staging-rehearsal.yml`: 배포 스크립트·마이그레이션이 바뀐 PR/push 또는 수동 실행. 일회용 Ubuntu 러너에서 기준 브랜치 DB+시드 → `package-release.sh` → `deploy.sh` → 데이터 보존·API 확인 → 깨진 릴리스 자동 롤백 → `rollback.sh` → `backup-db.sh`까지 실제 스크립트로 검증 (AWS 미사용) |
| 스테이징 | `main`에 머지되고 CI가 통과하면 `deploy-staging.yml`이 자동 배포 → 스모크 테스트 → 커밋 상태 `deploy/staging` |
| 운영 | Actions → **Deploy production** → `ref` 입력 → `production` 환경 승인자 승인 |

운영 배포 흐름 (`deploy.sh`):
1. 스테이징에 같은 커밋이 성공 배포됐는지 확인 (`deploy/staging` 상태)
2. 운영 중인 버전과 비교해 데이터 손실 마이그레이션(`DROP`, 컬럼 삭제·타입 변경 등)이 있으면 `production-destructive` 환경의 **2차 승인** 필요
3. 배포 직전 DB 백업 (`BACKUP_LABEL=predeploy`)
4. `prisma migrate deploy` → `current` 교체 → PM2 reload
5. `/api/health/ready`의 `version`이 새 sha와 같은지 확인. 실패하면 **이전 릴리스로 자동 복귀하고 알림**
6. 스모크 테스트: 헬스, 인증 필요 API 401, 요금제 목록 200, 웹 index·로그인 페이지

마이그레이션 정책은 **확장 전용(expand-only)** 입니다. 컬럼·테이블 삭제는 코드가 더 이상 쓰지 않게 된 다음 배포에서,
파일 첫 줄에 `-- baesh:allow-destructive`를 넣고 2차 승인을 받아 진행합니다. 덕분에 코드 롤백은 항상 DB와 호환됩니다.

## 3. 롤백

**권장: GitHub Actions** → Deploy production → `mode=rollback`, `rollback_to`(비우면 직전 릴리스) → 승인.

서버에서 직접:
```bash
ls -1t /srv/baesh/production/releases                    # 남아 있는 릴리스 (최근 5개)
BAESH_ENV=production /srv/baesh/production/current/deploy/scripts/rollback.sh            # 직전 릴리스
BAESH_ENV=production /srv/baesh/production/current/deploy/scripts/rollback.sh <git-sha>  # 지정 릴리스
curl -s https://api.baesh.kr/api/health/ready             # version 확인
```
롤백은 코드만 되돌립니다. 데이터 자체를 되돌려야 하면 4장(DB 복원)을 따릅니다.

## 4. DB 복원

백업: 매일 03:30 KST `pg_dump` → sha256 → 매니페스트(테이블별 행 수, 마지막 마이그레이션) → S3(KMS).
보관: `db/` 35일, 매월 1일분은 `monthly/`에 1년. 배포 직전 백업도 같은 위치에 남습니다.

### 4-1. 복원할 백업 고르기
```bash
aws s3 ls s3://<BACKUP_S3_BUCKET>/db/production/ | tail -20
aws s3 cp s3://<BACKUP_S3_BUCKET>/db/production/latest.json - | jq
```

### 4-2. 먼저 검증 (운영 DB를 건드리지 않음)
```bash
BAESH_ENV=production KEEP_DRILL_DB=1 /srv/baesh/production/current/deploy/scripts/restore-drill.sh s3://<bucket>/db/production/<name>.json
```
체크섬 → 임시 DB 복원 → 마이그레이션 수준 → 행 수 비교 → 핵심 테이블 확인까지 통과하면 `baesh_restore_drill_<시각>` DB가 남습니다.

### 4-3. 전환 (권장: 새 DB로 교체)
1. 공지 게시 (`/admin/support` → 공지, 중요도 "긴급")
2. 쓰기 중단: `pm2 stop baesh-api-production` (이 동안 API는 502를 반환하므로 1번 공지를 먼저 게시)
3. 마지막 상태 보존: `BACKUP_LABEL=pre-restore deploy/scripts/backup-db.sh`
4. 검증된 DB 이름을 정식 이름으로 바꾸거나 SSM의 `DATABASE_URL`을 새 DB로 변경 → `render-env.sh`
5. `pm2 start /srv/baesh/production/current/deploy/ecosystem.config.cjs` → `/api/health/ready` 확인
6. 운영 콘솔에서 오류율 확인, 공지 내리기, 장애 기록 작성(7장)

RDS를 쓰는 경우 시점 복구(PITR)로 새 인스턴스를 만들고 같은 방식으로 `DATABASE_URL`만 바꿀 수 있습니다.
**목표: RPO 24시간(PITR 사용 시 5분), RTO 1시간.** 복원 훈련 결과의 소요 시간이 실제 RTO 근거입니다.

## 5. 파일(S3) 복원

증빙·보고서 버킷은 버전 관리가 켜져 있어 삭제·덮어쓰기 후 90일 안에는 되살릴 수 있습니다.
```bash
# 저장 키는 DB의 EvidenceFile.storageKey / 감사 로그(evidence.file_delete)의 대상에서 확인
BAESH_ENV=production deploy/scripts/restore-s3-object.sh evidence/<id>/<file>.pdf            # 최신 정상 버전
BAESH_ENV=production deploy/scripts/restore-s3-object.sh evidence/<id>/<file>.pdf <versionId> # 특정 버전
```
버킷 보호 상태와 DB가 가리키는 파일 표본은 매일 `file-backup-check.sh`가 점검하고, 결과는 운영 콘솔 "백업·복구"에 표시됩니다.

## 6. 복원 훈련

- 자동: 매주 토요일 05:00 KST `baesh-restore-drill@production.timer`
- 수동: `BAESH_ENV=production deploy/scripts/restore-drill.sh`
- 결과(성공/실패, 소요 시간, 행 수 비교)는 `/admin/ops` → 운영 기록 → "복원 훈련"에 남습니다.
- 35일 넘게 성공 기록이 없으면 경고, 26시간 넘게 백업 성공이 없으면 긴급 알림이 갑니다.
- 운영 서버 부하가 걱정되면 `RESTORE_ADMIN_URL`을 별도 훈련용 DB 서버로 지정합니다.

## 7. 장애 대응

| 증상 | 1차 확인 | 조치 |
|------|----------|------|
| 업타임 알림 (`uptime.yml`, 10분 간격) | `curl https://api.baesh.kr/api/health/ready` | `pm2 status`, `pm2 logs baesh-api-production --lines 200` → 최근 배포라면 3장 롤백 |
| 5xx 오류율 알림 | `/admin/ops` → 열린 오류(동일 원인 묶음), 상위 경로 | 원인 배포 롤백, 해결 후 "해결" 처리 |
| DB 응답 지연·연결 포화 | 운영 콘솔 "데이터베이스" 카드 | 느린 쿼리 확인, 필요 시 인스턴스 확장 |
| 백업 실패 알림 | `journalctl -u baesh-backup@production -n 100` | 디스크·S3 권한 확인 후 `systemctl start baesh-backup@production` |
| AI 비용 알림 | `/admin/ai` | 사용자별 한도·월 예산(`AI_MONTHLY_BUDGET_USD`) 조정 |
| 계정 탈취 의심 | `/admin/users` | 계정 정지(모든 세션 즉시 종료) → 감사 로그로 범위 확인 |

모든 장애는 다음을 남깁니다: 시작·인지·복구 시각, 영향 범위(기관·사용자 수), 원인, 조치, 재발 방지.
관련 서버 측 기록은 운영 기록(OpsRun)·오류 묶음(ErrorEvent)·감사 로그에서 자동으로 남습니다.

## 8. 알림 훈련

`/admin/ops` → **알림 훈련**: 웹훅으로 테스트 메시지를 보내고 전달 여부를 운영 기록에 남깁니다.
분기마다 1회, 그리고 웹훅 주소를 바꾼 직후 실행합니다. "알림 웹훅 미설정" 배지가 보이면 운영 환경 설정이 빠진 것입니다.

## 9. GitHub 설정

| 종류 | 이름 | 위치 | 용도 |
|------|------|------|------|
| Environment | `staging` | 환경 | 자동 배포 대상 |
| Environment | `production` | 환경 (필수 승인자 지정) | 운영 배포 승인 |
| Environment | `production-destructive` | 환경 (승인자 2명 권장) | 데이터 손실 마이그레이션 2차 승인 |
| Secret | `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `SSH_HOST`, `SSH_USER` | 각 환경 | 배포 서버 접속 |
| Variable | `VITE_API_URL` | 각 환경 | 프론트 빌드 시 API 주소 |
| Variable | `PUBLIC_API_URL`, `APP_URL` | 각 환경 | 배포 후 스모크 테스트 |
| Variable | `PRODUCTION_API_URL` | 저장소 | 운영 배포 전 현재 운영 버전 조회 |
| Variable | `UPTIME_URLS` | 저장소 | 업타임 점검 대상. 공백으로 구분한 `/api`까지의 주소 (예: `https://api.baesh.kr/api https://staging-api.baesh.kr/api`) |
| Secret | `ALERT_WEBHOOK_URL` | 저장소 | 업타임 실패 알림 |

`main` 브랜치 보호: PR로만 병합하고, 승인 리뷰 1건 이상과 CI 필수 검사 `Backend tests`, `DB migrations`, `Frontend build & lint`, `Security scan` 통과를 요구합니다. 작업 이름을 바꾸면 보호 규칙의 필수 검사 이름도 함께 바꿔야 합니다.

마이그레이션 업그레이드 경로 검사(로컬): `UPGRADE_DATABASE_URL=postgresql://…/baesh_upgrade npx tsx scripts/checkUpgradePath.ts --base origin/main` (backend 폴더). 이름에 `upgrade`가 들어간 임시 DB만 허용하며, 그 DB는 지우고 다시 만듭니다.
