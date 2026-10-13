# AWS 스테이징 구축 체크리스트

스테이징만 대상으로 합니다. 운영(`production`) 리소스·DB는 이 절차로 만들거나 바꾸지 않습니다.
배포 스크립트·마이그레이션 자체는 AWS 없이 `staging-rehearsal.yml`(로컬·CI 리허설)로 먼저 검증되어 있습니다.

## 0. 준비물

- [ ] 스테이징용 AWS 계정 ID와, 그 계정에서 EC2·RDS·S3·IAM·SSM을 만들 수 있는 자격 증명 (AWS CLI v2)
- [ ] 리전: 기본 `ap-northeast-2` (`AWS_REGION`으로 변경)
- [ ] EC2 키 페어 이름(`KEY_NAME`): 비상 SSH용 (`ubuntu` 사용자)
- [ ] SSH를 허용할 관리자 IP 대역(`ADMIN_CIDR`, 예: `203.0.113.4/32`)
- [ ] GitHub Actions 배포용 SSH 키 한 쌍: `ssh-keygen -t ed25519 -N '' -C baesh-staging-deploy -f ~/.ssh/baesh-staging-deploy`
- [ ] 도메인: 웹 `staging.baesh.kr`, API `staging-api.baesh.kr` (`APP_DOMAIN`, `API_DOMAIN`으로 변경)

## 1. 계획 확인 (AWS 호출 없음)

```bash
deploy/scripts/provision-staging.sh
```

만들 리소스 목록만 출력합니다. 이름에 `prod`가 들어가면 거부합니다.

## 2. 리소스 생성

```bash
AWS_ACCOUNT_ID=<스테이징 계정 ID> ADMIN_CIDR=<관리자 IP>/32 KEY_NAME=<키 페어> \
DEPLOY_PUBLIC_KEY_FILE=~/.ssh/baesh-staging-deploy.pub \
deploy/scripts/provision-staging.sh --apply
```

| 리소스 | 내용 |
|--------|------|
| S3 | `baesh-staging-files`, `baesh-staging-backups` — `s3-setup.sh`로 버전 관리·퍼블릭 차단·SSE-KMS·TLS 전용·수명 주기 |
| 보안 그룹 | `baesh-staging-web`(80/443 공개, 22는 `ADMIN_CIDR`만), `baesh-staging-db`(5432는 web 그룹에서만) |
| RDS | PostgreSQL 16 최신 마이너, `db.t4g.micro`, 20GB gp3, 암호화, 비공개, 자동 백업 7일, 삭제 방지 |
| SSM | `/baesh/staging/*`(앱 설정, 비밀값은 SecureString으로 생성), `/baesh-admin/staging/DB_MASTER_PASSWORD`(앱이 읽지 않음) |
| IAM | `baesh-staging-ec2`: 두 버킷 객체 읽기/쓰기, `/baesh/staging/*` 읽기, S3·SSM 경유 KMS, SES 발송, Session Manager |
| EC2 | Ubuntu 24.04 `t3.small`, 30GB 암호화 디스크, IMDSv2 전용, 탄력적 IP |

- 다시 실행해도 안전합니다. 이름으로 기존 리소스를 찾아 재사용하고, SSM 값은 덮어쓰지 않습니다.
- `--apply`는 현재 자격 증명의 계정이 `AWS_ACCOUNT_ID`와 다르면 멈춥니다.
- 생성된 비밀값은 화면·명령줄·저장소에 남지 않고 SSM에만 저장됩니다.
- 스테이징 메일은 `MAIL_DRIVER=log`(실제 발송 안 함), AI는 `AI_PROVIDER=mock`입니다. 바꾸려면 SSM 값을 수정한 뒤 서버에서 `render-env.sh`를 다시 실행합니다.

## 3. 서버 부팅 확인 (약 5분)

```bash
ssh ubuntu@<탄력적 IP> 'sudo tail -n 20 /var/log/baesh-bootstrap.log'
# "BAESH bootstrap finished for staging" 이 보여야 함
ssh ubuntu@<탄력적 IP> 'sudo ls -l /srv/baesh/staging/shared/backend.env'   # -rw------- baesh
```

- [ ] Node 22, PM2, nginx, certbot, `postgresql-client-16`, aws-cli 설치
- [ ] `/etc/ssl/certs/rds-global-bundle.pem` 존재 (RDS는 TLS를 강제하고, Node가 이 CA로 인증서를 검증)
- [ ] `backend.env` 생성됨 (SSM 값 반영). 실패했다면 `sudo -u baesh BAESH_ENV=staging /usr/local/lib/baesh/render-env.sh`

## 4. DNS·TLS

- [ ] DNS A 레코드: `staging.baesh.kr`, `staging-api.baesh.kr` → 탄력적 IP
- [ ] 인증서 (서버에서):

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d staging.baesh.kr -d staging-api.baesh.kr --agree-tos -m <운영 메일> -n
sudo systemctl start nginx
```

nginx 사이트는 첫 배포 뒤 릴리스에 포함된 스크립트로 만듭니다 (6단계).

## 5. GitHub `staging` 환경

| 종류 | 이름 | 값 |
|------|------|----|
| Secret | `SSH_HOST` | 탄력적 IP |
| Secret | `SSH_USER` | `baesh` |
| Secret | `SSH_PRIVATE_KEY` | `~/.ssh/baesh-staging-deploy` 내용 |
| Secret | `SSH_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 <탄력적 IP>` 출력 |
| Variable | `VITE_API_URL` | `https://staging-api.baesh.kr/api` |
| Variable | `PUBLIC_API_URL` | `https://staging-api.baesh.kr/api` |
| Variable | `APP_URL` | `https://staging.baesh.kr` |

자동 배포는 저장소 변수 `STAGING_AUTO_DEPLOY=true`일 때만 켜집니다 (Settings → Secrets and variables → Actions → Variables). 첫 수동 배포가 성공한 뒤 설정하면, 그 뒤로는 `main`에 머지되고 CI가 통과할 때마다 `deploy-staging.yml`이 자동 실행됩니다. 머지 전 검증은 Actions → **Deploy staging** → `ref`에 브랜치 이름을 넣고 수동 실행합니다.

## 6. 첫 배포와 검증

1. Actions → Deploy staging → `ref = feat/stage1-4-platform` (또는 검증할 브랜치)
2. 서버에서 nginx 사이트와 타이머 설치:

```bash
sudo -u baesh bash -c '/srv/baesh/staging/current/deploy/scripts/render-nginx.sh staging staging.baesh.kr staging-api.baesh.kr' \
  | sudo tee /etc/nginx/sites-available/baesh-staging.conf >/dev/null
sudo ln -sf /etc/nginx/sites-available/baesh-staging.conf /etc/nginx/sites-enabled/baesh-staging.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo cp /srv/baesh/staging/current/deploy/systemd/baesh-*@.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now baesh-backup@staging.timer baesh-restore-drill@staging.timer baesh-file-check@staging.timer
```

3. 검증 체크리스트

- [ ] `curl https://staging-api.baesh.kr/api/health/ready` → `version`이 배포한 커밋 sha
- [ ] 서버에서 `cd /srv/baesh/staging/current/backend && npx prisma migrate status` → 모든 마이그레이션 적용
- [ ] 웹 `https://staging.baesh.kr` 로그인·회원가입, 인증 필요 API 401, 요금제 목록 200 (배포 워크플로 스모크 테스트와 동일)
- [ ] 증빙 파일 업로드 → S3 `baesh-staging-files`에 저장되고, 다운로드는 만료되는 임시 URL로만 열림
- [ ] `sudo systemctl start baesh-backup@staging.service` → S3 `baesh-staging-backups/db/staging/`에 덤프·매니페스트
- [ ] `sudo systemctl start baesh-restore-drill@staging.service` → 임시 DB 복원 성공, `/admin/ops` 운영 기록에 표시
- [ ] 롤백 연습: 서버에서 `sudo -u baesh BAESH_ENV=staging /srv/baesh/staging/current/deploy/scripts/rollback.sh` → 이전 릴리스로 돌아간 뒤 다시 배포. 마이그레이션 `20261018000100_confirm_existing_selections` 이후에는 그 이전 릴리스가 새 지원 상태 값을 읽지 못하므로, 그보다 오래된 릴리스로는 코드만 롤백하지 말고 백업 복원을 사용합니다 (RUNBOOK "프로그램 선발 흐름").

## 7. 비용·정리

대략 월 40~60 USD (t3.small, db.t4g.micro, 스토리지·전송량 소량 기준, 리전·사용량에 따라 다름).

삭제할 때는 RDS 삭제 방지를 먼저 끄고(`aws rds modify-db-instance --db-instance-identifier baesh-staging-db --no-deletion-protection --apply-immediately`),
EC2 종료 → 탄력적 IP 해제 → RDS 삭제(최종 스냅샷 권장) → 버킷 비우기·삭제 → IAM 역할·인스턴스 프로필 → 보안 그룹 → SSM `/baesh/staging/*`, `/baesh-admin/staging/*` 순으로 지웁니다.
