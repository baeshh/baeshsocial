# BAESH v2

BAESH는 AI 기반 프로젝트 커리어 데이터 인프라 플랫폼입니다. 개인의 프로젝트 경험을 커리어 데이터로 구조화하고, 기업과 기관이 검증된 인재와 성과를 확인할 수 있도록 확장 가능한 웹앱 구조로 개발합니다.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Zustand
- Backend: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL
- Auth foundation: JWT, role based access control 준비
- AI foundation: provider 확장 구조 예정

## Project Structure

```text
baesh-v2/
  frontend/
  backend/
  README.md
  .env.example
```

## Environment Setup

루트의 `.env.example`을 참고해 백엔드 실행 환경을 설정합니다.

```bash
cp .env.example backend/.env
cp .env.example frontend/.env
```

PostgreSQL 데이터베이스를 준비한 뒤 `backend/.env`의 `DATABASE_URL`을 실제 연결 문자열로 수정합니다.
프론트는 `frontend/.env`의 `VITE_API_URL`을 통해 백엔드 API 주소를 읽습니다.

## Install

```bash
cd frontend
npm install

cd ../backend
npm install
```

## Run Frontend

```bash
cd frontend
npm run dev
```

기본 주소는 `http://localhost:5173`입니다.

## Run Backend

```bash
cd backend
npm run dev
```

기본 API 주소는 `http://localhost:4000`입니다.

헬스체크:

```bash
curl http://localhost:4000/api/health
```

## Prisma

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

초기 테스트 계정과 샘플 프로필/프로젝트 데이터는 `backend/prisma/seed.ts`에서 관리합니다.

## Demo Accounts

seed 실행 후 아래 계정으로 로그인할 수 있습니다. 모든 계정의 비밀번호는 `password123`입니다.

```text
demo@baesh.dev
company@baesh.dev
institution@baesh.dev
admin@baesh.dev
```

## Auth API

```bash
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
GET /api/users/me
PATCH /api/users/me
GET /api/users/:id
GET /api/profiles/me
PATCH /api/profiles/me
GET /api/profiles/:userId
POST /api/profiles/me/certificates
POST /api/profiles/me/careers
POST /api/profiles/me/awards
POST /api/profiles/me/portfolios
GET /api/projects
POST /api/projects
GET /api/projects/:id
PATCH /api/projects/:id
DELETE /api/projects/:id
POST /api/projects/:id/members
POST /api/projects/:id/tasks
PATCH /api/projects/:id/tasks/:taskId
POST /api/projects/:id/activities
POST /api/projects/:id/files
GET /api/posts
POST /api/posts
GET /api/posts/:id
PATCH /api/posts/:id
DELETE /api/posts/:id
POST /api/posts/:id/like
DELETE /api/posts/:id/like
POST /api/posts/:id/comments
GET /api/opportunities
POST /api/opportunities
GET /api/opportunities/:id
PATCH /api/opportunities/:id
DELETE /api/opportunities/:id
POST /api/opportunities/:id/save
DELETE /api/opportunities/:id/save
POST /api/ai/profile-insight
POST /api/ai/project-insight
POST /api/ai/opportunity-match
POST /api/ai/portfolio-generator
GET /api/ai/analyses/me
```

인증이 필요한 API는 `Authorization: Bearer <token>` 헤더를 사용합니다.

## Phase 1 Scope

- `baesh-v2` 모노레포 기반 폴더 구조 생성
- React/Vite/Tailwind 프론트엔드 초기화
- Express/TypeScript/Prisma 백엔드 초기화
- PostgreSQL 기반 Prisma schema 초안 작성
- 전문적인 SaaS 톤의 Tailwind 디자인 토큰 설정
- Landing Page와 Login/Register 진입 버튼 구현
- `/api/health` 엔드포인트 구현

## Phase 2 Scope

- JWT 기반 회원가입, 로그인, 로그아웃, 현재 사용자 조회
- role 값 `user`, `company`, `institution`, `admin` 지원
- 백엔드 인증 미들웨어와 role 검증 미들웨어 추가
- 프론트 Auth store, API client, 로그인/회원가입 폼 추가
- 로그인 후 `/dashboard`에서 세션 정보 확인

## Phase 3 Scope

- 재사용 가능한 디자인 시스템 컴포넌트 추가
- `Button`, `Card`, `Input`, `Select`, `Textarea`, `Badge`, `Avatar`, `Tabs`, `Modal`, `EmptyState`, `LoadingState`
- 인증 후 앱 레이아웃 `AppLayout` 추가
- 데스크톱 `Sidebar`, 상단 `Navbar`, 모바일 `BottomNav`, 모바일 drawer menu 구성
- Dashboard 화면을 앱 셸과 디자인 시스템 컴포넌트 기반으로 전환
- 이후 Phase 화면 경로에 준비 상태 페이지 연결

## Phase 4 Scope

- Profile API 구현
- 인증 사용자 프로필 조회와 수정
- 자격/수료, 경력, 수상/성과, 포트폴리오 추가 API
- Profile Page 구현
- 프로필 카드, 기술스택, 관심분야, 소셜 링크 저장
- AI Skill Insights, Growth Timeline, Verified Record 영역 구성
- 프로젝트 이력 요약 영역 구성

## Phase 5 Scope

- Project CRUD API 구현
- Project Detail API 구현
- Members, Tasks, Activities, Files 추가 API 구현
- `/projects` 목록/생성 화면 구현
- `/projects/:projectId` 상세 화면 구현
- Project Readme, Objective, Skills, Board, Recent Activity, Files, Project Health, AI Insight 영역 구성

## Phase 6 Scope

- Post CRUD API 구현
- Like, Unlike API 구현
- Comment 생성 API 구현
- `/network` 피드 화면 구현
- 프로젝트 연결 게시글 작성
- 좋아요, 댓글, 공유, DM 액션 UI 구성
- 해시태그 표시와 AI 추천 노출 문구 구성

## Phase 7 Scope

- Opportunity CRUD API 구현
- 검색, 타입, 원격, 기술스택, 저장 여부 필터 구현
- 사용자 프로필 기술스택 기반 매칭 점수 계산
- Opportunity 저장/저장 취소 API 구현
- `/opportunities` 목록, 필터, 저장, 매칭 점수 UI 구현
- admin role 기반 기회 등록 UI와 백엔드 권한 검증 구현

## Phase 8 Scope

- AI provider 인터페이스 구현
- `mock`, `openai`, `upstage` provider 구조 추가
- 기본값은 `AI_PROVIDER=mock`
- Profile Insight, Project Insight, Opportunity Match, Portfolio Generator API 구현
- AI 결과를 `AIAnalysis` 테이블에 저장
- `/ai-copilot` 화면 구현
- 최근 AI 결과와 분석 이력 표시
