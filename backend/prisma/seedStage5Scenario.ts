/**
 * Stage 5 completion scenario fixture (development only):
 * one approved university running 10 program projects with 50 students, plus an approved company.
 *
 *   npm run scenario:stage5            # (re)create
 *   npm run scenario:stage5 -- --clean # remove everything this script created
 *
 * All accounts use the @scenario.baesh.dev domain so cleanup never touches real data.
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import bcrypt from 'bcryptjs'
import {
  EvidenceCategory,
  EvidenceFileKind,
  EvidenceReviewAction,
  EvidenceStatus,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationType,
  OrganizationVerificationStatus,
  ProjectActivityType,
  ProjectLinkType,
  ProjectStatus,
  ProjectTaskStatus,
  ProjectVisibility,
  UserRole,
} from '@prisma/client'
import { prisma } from '../src/config/prisma.js'
import { storage } from '../src/services/storage/storage.js'
import { issueVerifiedRecord } from '../src/services/verification/verifiedRecords.js'

const DOMAIN = '@scenario.baesh.dev'
const UNIVERSITY = 'BAESH 시나리오대학교'
const COMPANY = 'BAESH 시나리오테크'
const STORAGE_PREFIX = 'evidence/scenario'

if (process.env.NODE_ENV === 'production') {
  console.error('This fixture must not run in production.')
  process.exit(1)
}

let seed = 20261013
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]
const DAY = 24 * 60 * 60 * 1000
const at = (iso: string) => new Date(`${iso}T09:00:00.000Z`)
const between = (from: Date, to: Date) => new Date(from.getTime() + rand() * (to.getTime() - from.getTime()))

function crc32(buf: Buffer) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** Small gradient PNG standing in for an activity photo. */
function photoPng(hue: number, width = 320, height = 200) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x += 1) {
      const o = y * (width * 3 + 1) + 1 + x * 3
      raw[o] = (hue * 37 + x / 2) & 255
      raw[o + 1] = (120 + y / 2) & 255
      raw[o + 2] = (hue * 91 + (x + y) / 4) & 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

async function clean() {
  const files = await prisma.evidenceFile.findMany({ where: { storageKey: { startsWith: STORAGE_PREFIX } }, select: { storageKey: true } })
  const reports = await prisma.generatedReport.findMany({
    where: { organization: { name: { in: [UNIVERSITY, COMPANY] } }, storageKey: { not: null } },
    select: { storageKey: true },
  })
  for (const file of [...files, ...reports]) await storage.remove(file.storageKey!).catch(() => undefined)
  await prisma.organization.deleteMany({ where: { name: { in: [UNIVERSITY, COMPANY] } } })
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } })
  const ids = users.map((u) => u.id)
  await prisma.project.deleteMany({ where: { ownerId: { in: ids } } })
  await prisma.aIUsageLog.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  console.log(`cleaned: ${ids.length} users, ${files.length} files, ${reports.length} reports`)
}

const SKILLS = ['React', 'TypeScript', 'Node.js', 'Python', 'Figma', 'Spring', 'Kotlin', 'Flutter', 'PostgreSQL', 'AWS', 'Docker', 'PyTorch', 'Swift', 'Next.js', 'Django']
const LAST = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임']
const FIRST = ['민준', '서연', '도윤', '하은', '지호', '수아', '예준', '지민', '시우', '채원', '현우', '유진', '건우', '다은', '우진']
const DEPTS = ['컴퓨터공학과', '소프트웨어학과', '산업디자인학과', '경영학과', '데이터사이언스학과']

const PROJECTS = [
  { title: '캠퍼스 분실물 매칭 서비스', team: '1팀 찾아줘', skills: ['React', 'Node.js', 'PostgreSQL'] },
  { title: 'AI 기반 강의 요약 도우미', team: '2팀 요약왕', skills: ['Python', 'PyTorch', 'React'] },
  { title: '지역 소상공인 예약 플랫폼', team: '3팀 동네가게', skills: ['Spring', 'React', 'AWS'] },
  { title: '헬스케어 복약 알림 앱', team: '4팀 약속', skills: ['Flutter', 'Node.js', 'PostgreSQL'] },
  { title: '탄소 발자국 트래커', team: '5팀 그린스텝', skills: ['Kotlin', 'Django', 'Docker'] },
  { title: '시각장애인 보행 보조 비전 모델', team: '6팀 길잡이', skills: ['Python', 'PyTorch', 'Swift'] },
  { title: '스타트업 IR 자료 자동 생성기', team: 'A팀 피치덱', skills: ['Next.js', 'TypeScript', 'AWS'] },
  { title: '로컬 축제 방문객 분석 대시보드', team: 'B팀 축제랩', skills: ['Python', 'React', 'PostgreSQL'] },
  { title: '중고 전공서적 거래 앱', team: 'C팀 책방', skills: ['Flutter', 'Spring', 'Docker'] },
  { title: '1인 가구 공동구매 커뮤니티', team: 'D팀 같이사', skills: ['React', 'TypeScript', 'Figma'] },
]

const ACTIVITY_TITLES = ['요구사항 정의 회의', '와이어프레임 리뷰', 'API 설계 공유', '데이터베이스 스키마 확정', '프로토타입 사용자 테스트', '중간 발표 리허설', '배포 파이프라인 구성', '버그 수정 스프린트', '멘토링 피드백 반영']
const EVIDENCE = [
  { title: '사용자 인터뷰 진행 기록', category: EvidenceCategory.RESEARCH },
  { title: '중간 발표 자료 및 발표 사진', category: EvidenceCategory.PRESENTATION },
  { title: '주간 팀 회의록', category: EvidenceCategory.MEETING },
  { title: '핵심 기능 구현 화면', category: EvidenceCategory.DEVELOPMENT },
  { title: '현장 실증 테스트', category: EvidenceCategory.FIELDWORK },
]
const TASKS = ['화면 설계', '로그인 기능 구현', '데이터 수집 스크립트 작성', 'API 연동', '테스트 케이스 작성', '배포 환경 구성', '발표 자료 작성']

async function createUser(email: string, name: string, password: string, role: UserRole = UserRole.USER) {
  return prisma.user.create({ data: { email, name, password, role }, select: { id: true, name: true } })
}

async function main() {
  await clean()
  if (process.argv.includes('--clean')) return

  const password = await bcrypt.hash(process.env.SEED_DEMO_PASSWORD || 'password123', 10)
  const admin = await createUser(`admin${DOMAIN}`, '오기관', password, UserRole.INSTITUTION)
  const profA = await createUser(`prof.kim${DOMAIN}`, '김교수', password, UserRole.INSTITUTION)
  const profB = await createUser(`prof.lee${DOMAIN}`, '이교수', password, UserRole.INSTITUTION)
  const recruiter = await createUser(`recruiter${DOMAIN}`, '한채용', password, UserRole.COMPANY)

  const university = await prisma.organization.create({
    data: {
      name: UNIVERSITY,
      type: OrganizationType.UNIVERSITY,
      verificationStatus: OrganizationVerificationStatus.APPROVED,
      verifiedAt: new Date(),
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: OrganizationRole.OWNER, status: OrganizationMemberStatus.ACTIVE, joinedAt: new Date() },
          { userId: profA.id, role: OrganizationRole.MANAGER, status: OrganizationMemberStatus.ACTIVE, joinedAt: new Date(), title: '교수' },
          { userId: profB.id, role: OrganizationRole.MANAGER, status: OrganizationMemberStatus.ACTIVE, joinedAt: new Date(), title: '교수' },
        ],
      },
    },
  })
  await prisma.organization.create({
    data: {
      name: COMPANY,
      type: OrganizationType.COMPANY,
      verificationStatus: OrganizationVerificationStatus.APPROVED,
      verifiedAt: new Date(),
      createdById: recruiter.id,
      members: { create: [{ userId: recruiter.id, role: OrganizationRole.OWNER, status: OrganizationMemberStatus.ACTIVE, joinedAt: new Date() }] },
    },
  })

  const programStart = at('2026-09-01')
  const now = new Date()
  const capstone = await prisma.program.create({
    data: {
      organizationId: university.id,
      title: '2026-2 캡스톤디자인',
      term: '2026-2학기',
      description: '전공 융합 팀이 실제 문제를 정의하고 서비스를 개발하는 학기 프로그램',
      startDate: programStart,
      endDate: at('2026-12-19'),
      createdById: admin.id,
      kpiTargets: { participationRate: 90, submissionRate: 80, approvalRate: 75, averageProgress: 60 },
      managers: { create: [{ userId: profA.id }] },
    },
  })
  const internship = await prisma.program.create({
    data: {
      organizationId: university.id,
      title: '2026 창업 인턴십',
      term: '2026 하반기',
      description: '예비 창업팀이 MVP를 만들고 시장 검증을 수행하는 프로그램',
      startDate: programStart,
      endDate: at('2026-11-30'),
      createdById: admin.id,
      kpiTargets: { participationRate: 85, submissionRate: 70, projectCompletionRate: 20 },
      managers: { create: [{ userId: profB.id }] },
    },
  })

  const students: { id: string; name: string }[] = []
  for (let i = 0; i < 50; i += 1) {
    const name = `${LAST[i % LAST.length]}${FIRST[(i * 7) % FIRST.length]}`
    const user = await createUser(`student${String(i + 1).padStart(2, '0')}${DOMAIN}`, name, password)
    const skills = [...new Set([pick(SKILLS), pick(SKILLS), pick(SKILLS)])]
    await prisma.profile.create({
      data: {
        userId: user.id,
        headline: `${DEPTS[i % DEPTS.length]} 학생 · ${skills[0]} 개발`,
        school: UNIVERSITY,
        skills,
        talentSearchOptIn: i % 5 !== 4,
        talentSearchOptInAt: i % 5 !== 4 ? new Date() : null,
      },
    })
    await prisma.organizationMember.create({
      data: { organizationId: university.id, userId: user.id, role: OrganizationRole.MEMBER, status: OrganizationMemberStatus.ACTIVE, joinedAt: new Date() },
    })
    students.push(user)
  }

  let photoIndex = 0
  let evidenceCount = 0
  for (let p = 0; p < PROJECTS.length; p += 1) {
    const spec = PROJECTS[p]
    const program = p < 6 ? capstone : internship
    const manager = p < 6 ? profA : profB
    const team = students.slice(p * 5, p * 5 + 5)
    for (const student of team) {
      await prisma.programParticipant.create({
        data: { programId: program.id, userId: student.id, studentNo: `2026${String(students.indexOf(student) + 1).padStart(4, '0')}`, department: DEPTS[students.indexOf(student) % DEPTS.length], addedById: manager.id },
      })
    }
    const status = p === 6 || p === 9 ? ProjectStatus.COMPLETED : ProjectStatus.ACTIVE
    const project = await prisma.project.create({
      data: {
        title: spec.title,
        slug: `scenario-${p + 1}-${Date.now().toString(36)}`,
        objective: `${spec.title}을(를) 통해 실제 사용자 문제를 해결하는 MVP를 완성합니다.`,
        description: `${program.title} ${spec.team}의 프로젝트입니다.`,
        ownerId: team[0].id,
        status,
        progress: 0,
        visibility: p % 3 === 2 ? ProjectVisibility.TEAM : ProjectVisibility.PUBLIC,
        skills: spec.skills,
        programId: program.id,
        teamName: spec.team,
        startDate: programStart,
        members: {
          create: team.map((student, index) => ({
            userId: student.id,
            role: index === 0 ? '팀장' : pick(['프론트엔드 개발', '백엔드 개발', '디자이너', '데이터 분석', 'PM']),
            contribution: index === 0 ? '일정 관리와 핵심 기능 개발을 맡았습니다.' : null,
          })),
        },
        externalLinks: { create: [{ type: ProjectLinkType.GITHUB, url: `https://github.com/baesh-scenario/project-${p + 1}`, label: '메인 저장소', createdById: team[0].id }] },
      },
    })

    for (let t = 0; t < 7; t += 1) {
      const done = status === ProjectStatus.COMPLETED || rand() < 0.35 + p * 0.05
      await prisma.projectTask.create({
        data: {
          projectId: project.id,
          title: TASKS[t],
          status: done ? ProjectTaskStatus.DONE : rand() < 0.5 ? ProjectTaskStatus.IN_PROGRESS : ProjectTaskStatus.TODO,
          assigneeId: team[t % team.length].id,
        },
      })
    }

    for (let s = 0; s < team.length; s += 1) {
      const student = team[s]
      const inactive = (p === 3 && s === 4) || (p === 8 && s >= 3)
      if (inactive) continue
      const activityCount = 2 + Math.floor(rand() * 4)
      for (let a = 0; a < activityCount; a += 1) {
        await prisma.projectActivity.create({
          data: {
            projectId: project.id,
            userId: student.id,
            type: ProjectActivityType.UPDATE,
            title: pick(ACTIVITY_TITLES),
            description: `${spec.team} ${pick(['기능 구현 진행 상황을 공유했습니다.', '피드백을 반영해 화면을 수정했습니다.', '테스트 결과를 정리했습니다.'])}`,
            createdAt: between(programStart, now),
          },
        })
      }

      const evidenceTotal = s === 4 && p % 4 === 1 ? 0 : 2
      for (let k = 0; k < evidenceTotal; k += 1) {
        const roll = rand()
        const status = roll < 0.6 ? EvidenceStatus.APPROVED : roll < 0.75 ? EvidenceStatus.REJECTED : roll < 0.9 ? EvidenceStatus.SUBMITTED : EvidenceStatus.DRAFT
        const spec2 = pick(EVIDENCE)
        const activityDate = between(programStart, new Date(now.getTime() - 3 * DAY))
        const submittedAt = status === EvidenceStatus.DRAFT ? null : new Date(activityDate.getTime() + DAY)
        const reviewedAt = status === EvidenceStatus.APPROVED || status === EvidenceStatus.REJECTED ? new Date(submittedAt!.getTime() + 2 * DAY) : null
        const evidence = await prisma.projectEvidence.create({
          data: {
            projectId: project.id,
            authorId: student.id,
            title: spec2.title,
            description: `${spec.title} 활동 증빙입니다.`,
            category: spec2.category,
            activityDate,
            status,
            submittedAt,
            reviewedAt,
            reviewedById: reviewedAt ? manager.id : null,
            reviewNote: status === EvidenceStatus.REJECTED ? '활동 내용을 확인할 수 있는 자료를 보완해 주세요.' : null,
          },
        })
        evidenceCount += 1
        if (photoIndex < 12 && status === EvidenceStatus.APPROVED && spec2.category !== EvidenceCategory.MEETING) {
          const png = photoPng(photoIndex + p)
          const key = `${STORAGE_PREFIX}/${evidence.id}.png`
          await storage.put(key, png, 'image/png')
          await prisma.evidenceFile.create({
            data: {
              evidenceId: evidence.id,
              uploaderId: student.id,
              originalName: `activity-${photoIndex + 1}.png`,
              storageKey: key,
              mimeType: 'image/png',
              kind: EvidenceFileKind.IMAGE,
              sizeBytes: png.length,
              sha256: createHash('sha256').update(png).digest('hex'),
              scanStatus: 'clean',
            },
          })
          photoIndex += 1
        }
        if (submittedAt) {
          await prisma.evidenceReview.create({ data: { evidenceId: evidence.id, actorId: student.id, action: EvidenceReviewAction.SUBMITTED, createdAt: submittedAt } })
        }
        if (reviewedAt) {
          await prisma.evidenceReview.create({
            data: {
              evidenceId: evidence.id,
              actorId: manager.id,
              action: status === EvidenceStatus.APPROVED ? EvidenceReviewAction.APPROVED : EvidenceReviewAction.REJECTED,
              createdAt: reviewedAt,
            },
          })
        }
        if (status === EvidenceStatus.APPROVED) {
          await prisma.$transaction((tx) => issueVerifiedRecord(tx, { evidenceId: evidence.id, approverId: manager.id, approvedAt: reviewedAt! }))
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        university: university.id,
        programs: [capstone.id, internship.id],
        students: students.length,
        projects: PROJECTS.length,
        evidence: evidenceCount,
        photos: photoIndex,
        logins: { admin: `admin${DOMAIN}`, managers: [`prof.kim${DOMAIN}`, `prof.lee${DOMAIN}`], recruiter: `recruiter${DOMAIN}`, student: `student01${DOMAIN}` },
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
