import 'dotenv/config'
import {
  OpportunityType,
  PrismaClient,
  ProjectActivityType,
  ProjectStatus,
  ProjectVisibility,
  UserRole,
} from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import {
  avatarUrl,
  buildPersonas,
  coverUrl,
  getCommentContent,
  getPostContent,
} from './seedPeopleData.js'
import { seedFounderResume } from './seedFounderResume.js'

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/baesh_v2?schema=public',
})

const prisma = new PrismaClient({ adapter })

const demoPassword = process.env.SEED_DEMO_PASSWORD || 'password123'
// Privileged demo accounts (company/institution/admin) keep their role only when explicitly enabled
// for local development; otherwise they are seeded as USER with an unguessable password.
const allowPrivilegedDemoAccounts =
  process.env.SEED_PRIVILEGED_DEMO_ACCOUNTS === 'true' && process.env.NODE_ENV !== 'production'
const TARGET_USER_COUNT = 96

const demoUsers = [
  {
    id: 'seed-user-demo',
    email: 'demo@baesh.dev',
    name: 'Demo User',
    role: UserRole.USER,
    headline: 'AI Product Engineer',
    school: 'BAESH University',
    company: 'BAESH Labs',
    location: 'Seoul',
    skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    interests: ['AI SaaS', 'Career Data', 'Product Engineering'],
    avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
    coverUrl: 'https://picsum.photos/seed/baesh-demo/1200/400',
  },
  {
    id: 'seed-user-company',
    email: 'company@baesh.dev',
    name: 'BAESH Company',
    role: UserRole.COMPANY,
    headline: 'Talent Acquisition Team',
    school: null,
    company: 'BAESH Partners',
    location: 'Seoul',
    skills: ['Talent Search', 'Hiring', 'AI Matching'],
    interests: ['Verified Talent', 'Technical Recruiting'],
    avatarUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
    coverUrl: 'https://picsum.photos/seed/baesh-company/1200/400',
  },
  {
    id: 'seed-user-institution',
    email: 'institution@baesh.dev',
    name: 'BAESH Institution',
    role: UserRole.INSTITUTION,
    headline: 'Program Operator',
    school: 'BAESH Innovation School',
    company: null,
    location: 'Seoul',
    skills: ['Program Management', 'KPI Tracking', 'Education'],
    interests: ['Hackathon', 'Student Projects', 'Outcome Reports'],
    avatarUrl: 'https://randomuser.me/api/portraits/men/11.jpg',
    coverUrl: 'https://picsum.photos/seed/baesh-institution/1200/400',
  },
  {
    id: 'seed-user-admin',
    email: 'admin@baesh.dev',
    name: 'BAESH Admin',
    role: UserRole.ADMIN,
    headline: 'Platform Administrator',
    school: null,
    company: 'BAESH',
    location: 'Seoul',
    skills: ['Operations', 'Platform Governance', 'Data Quality'],
    interests: ['Admin Workflow', 'Opportunity Management'],
    avatarUrl: 'https://randomuser.me/api/portraits/men/75.jpg',
    coverUrl: 'https://picsum.photos/seed/baesh-admin/1200/400',
  },
]

async function seedCommunityPeople(password: string) {
  await prisma.project.deleteMany({
    where: {
      OR: [
        { id: { in: ['seed-project-career-bridge', 'seed-project-hackathon-archive'] } },
        { owner: { email: { endsWith: '@seed.baesh.dev' } } },
      ],
    },
  })

  await prisma.post.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'seed-cpost-' } },
        { author: { email: { endsWith: '@seed.baesh.dev' } } },
      ],
    },
  })

  await prisma.user.deleteMany({
    where: { email: { endsWith: '@seed.baesh.dev' } },
  })

  const currentCount = await prisma.user.count()
  const needed = Math.max(0, TARGET_USER_COUNT - currentCount)
  if (needed === 0) {
    console.log(`Already at ${TARGET_USER_COUNT} users — skipping community seed.`)
    return [] as string[]
  }

  const personas = buildPersonas(needed)
  const createdUserIds: string[] = []

  for (const [index, persona] of personas.entries()) {
    const id = `seed-person-${persona.key}`
    const email = `${persona.key}@seed.baesh.dev`
    const user = await prisma.user.create({
      data: {
        id,
        email,
        password,
        name: persona.name,
        role: UserRole.USER,
        avatarUrl: persona.locale === 'uk' ? avatarUrl(persona) : null,
        coverUrl: persona.locale === 'uk' ? coverUrl(persona.key) : null,
        createdAt: new Date(Date.now() - (needed - index) * 36e5 * 7),
        profile: {
          create: {
            headline: persona.headline,
            bio: persona.bio,
            school: persona.school,
            company: persona.company,
            location: persona.location,
            skills: persona.skills,
            interests: persona.interests,
            socialLinks: {
              website: persona.locale === 'uk' ? 'https://baesh.dev' : 'https://baesh.dev/kr',
              github: `https://github.com/baesh-${persona.key}`,
            },
            trustScore: 45 + ((index * 7) % 50),
            verified: index % 3 !== 2,
            careers: persona.career
              ? {
                  create: {
                    id: `seed-career-${persona.key}`,
                    company: persona.career.company,
                    position: persona.career.position,
                    description: persona.career.description,
                    startDate: new Date('2023-03-01'),
                    endDate: index % 5 === 0 ? null : new Date('2025-08-01'),
                  },
                }
              : undefined,
            awards: persona.award
              ? {
                  create: {
                    id: `seed-award-${persona.key}`,
                    title: persona.award.title,
                    issuer: persona.award.issuer,
                    description: persona.award.description,
                    awardedAt: new Date('2025-06-15'),
                  },
                }
              : undefined,
            portfolios:
              index % 2 === 0
                ? {
                    create: {
                      id: `seed-portfolio-${persona.key}`,
                      title:
                        persona.locale === 'uk'
                          ? `${persona.name.split(' ')[0]}'s Product Lab`
                          : `${persona.name} 프로젝트 랩`,
                      description:
                        persona.locale === 'uk'
                          ? 'Selected builds archived from hackathons and coursework.'
                          : '해커톤·수업·사이드 프로젝트에서 남긴 대표 산출물 모음.',
                      url: 'https://baesh.dev',
                      imageUrl: null,
                    },
                  }
                : undefined,
          },
        },
      },
    })
    createdUserIds.push(user.id)
  }

  const postIds: string[] = []
  // 한국 게시물이 피드 상단(최신순)에 오도록 별도 카운터로 createdAt 부여
  let krPostSeq = 0
  let ukPostSeq = 0
  for (const [index, persona] of personas.entries()) {
    const authorId = `seed-person-${persona.key}`
    // 한국 유저는 게시물을 더 많이 (3~5개), 영국은 1~3개
    const postCount = persona.locale === 'kr' ? 3 + (index % 3) : 1 + (index % 3)
    for (let p = 0; p < postCount; p++) {
      const postId = `seed-cpost-${persona.key}-${p}`
      // KR: 방금~수일 전 / UK: 그보다 오래된 구간 → 타임라인 진입 시 한글 글이 먼저
      const hoursAgo =
        persona.locale === 'kr'
          ? krPostSeq++ * 1.5 + (p % 3) * 0.2
          : 400 + ukPostSeq++ * 3 + p
      await prisma.post.create({
        data: {
          id: postId,
          authorId,
          content: getPostContent(persona, p),
          mediaUrls: [],
          visibility: 'PUBLIC',
          createdAt: new Date(Date.now() - hoursAgo * 36e5),
        },
      })
      postIds.push(postId)
    }
  }

  for (let i = 0; i < createdUserIds.length; i++) {
    const followerId = createdUserIds[i]!
    for (const offset of [1, 3, 7, 12]) {
      const followingId = createdUserIds[(i + offset) % createdUserIds.length]!
      if (followerId === followingId) {
        continue
      }
      await prisma.userFollow.upsert({
        where: {
          followerId_followingId: { followerId, followingId },
        },
        create: { followerId, followingId },
        update: {},
      })
    }
  }

  const personaById = new Map(personas.map((p) => [`seed-person-${p.key}`, p]))

  for (const [i, postId] of postIds.entries()) {
    const likerA = createdUserIds[(i + 2) % createdUserIds.length]!
    const likerB = createdUserIds[(i + 5) % createdUserIds.length]!
    const authorOfPost = (await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    }))!
    for (const userId of [likerA, likerB]) {
      if (userId === authorOfPost.authorId) {
        continue
      }
      await prisma.postLike.upsert({
        where: { postId_userId: { postId, userId } },
        create: { id: `seed-clike-${postId}-${userId.slice(-6)}`, postId, userId },
        update: {},
      })
    }
    if (i % 2 === 0) {
      const commenterId = createdUserIds[(i + 4) % createdUserIds.length]!
      const commenter = personaById.get(commenterId)
      if (!commenter) {
        continue
      }
      await prisma.comment.create({
        data: {
          id: `seed-ccomment-${postId}`,
          postId,
          authorId: commenterId,
          content: getCommentContent(commenter, i),
        },
      })
    }
  }

  const krOwners = createdUserIds.filter((id) => personaById.get(id)?.locale === 'kr')
  const ukOwners = createdUserIds.filter((id) => personaById.get(id)?.locale === 'uk')
  const ownerKr = krOwners[0] ?? createdUserIds[0]!
  const ownerUk = ukOwners[0] ?? createdUserIds[1]!
  const memberKr = krOwners[1] ?? krOwners[0] ?? createdUserIds[0]!
  const memberUk = ukOwners[1] ?? ukOwners[0] ?? createdUserIds[1]!

  await prisma.project.upsert({
    where: { slug: 'seoul-london-career-bridge' },
    create: {
      id: 'seed-project-career-bridge',
      title: 'Seoul–London Career Bridge',
      slug: 'seoul-london-career-bridge',
      description:
        'A joint lab where Seoul and London builders peer-review project histories and turn them into career proof.',
      objective: 'Keep cross-border collaboration records as verified portfolio evidence.',
      ownerId: ownerUk,
      status: ProjectStatus.ACTIVE,
      progress: 48,
      visibility: ProjectVisibility.PUBLIC,
      skills: ['React', 'Product', 'Community'],
      members: {
        create: [
          { userId: ownerUk, role: 'Owner', contribution: 'Programme design and London operations' },
          { userId: memberKr, role: 'Designer', contribution: 'Workshop UX and Seoul facilitation' },
        ],
      },
      activities: {
        create: [
          {
            userId: ownerUk,
            type: ProjectActivityType.MILESTONE,
            title: 'Kickoff workshop',
            description: 'Joint Seoul–London kickoff. Sprint goals locked.',
          },
        ],
      },
    },
    update: {
      title: 'Seoul–London Career Bridge',
      status: ProjectStatus.ACTIVE,
      progress: 48,
    },
  })

  await prisma.project.upsert({
    where: { slug: 'verified-hackathon-archive' },
    create: {
      id: 'seed-project-hackathon-archive',
      title: '검증형 해커톤 아카이브',
      slug: 'verified-hackathon-archive',
      description: '해커톤 산출물이 사라지지 않도록 역할·커밋·데모를 한곳에 아카이빙합니다.',
      ownerId: ownerKr,
      status: ProjectStatus.ACTIVE,
      progress: 71,
      visibility: ProjectVisibility.PUBLIC,
      skills: ['TypeScript', 'PostgreSQL', 'DevRel'],
      members: {
        create: [
          { userId: ownerKr, role: 'Owner', contribution: '아카이브 스키마와 수집 파이프라인' },
          { userId: memberUk, role: 'Engineer', contribution: 'Demo embeds and timeline UI' },
        ],
      },
    },
    update: {
      title: '검증형 해커톤 아카이브',
      progress: 71,
    },
  })

  console.log(`Community seed: created ${createdUserIds.length} people (@seed.baesh.dev)`)
  return createdUserIds
}

async function main() {
  const password = await bcrypt.hash(demoPassword, 12)
  const lockedPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12)

  for (const user of demoUsers) {
    const locked = user.role !== UserRole.USER && !allowPrivilegedDemoAccounts
    const role = locked ? UserRole.USER : user.role
    const userPassword = locked ? lockedPassword : password

    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: user.id,
        email: user.email,
        password: userPassword,
        name: user.name,
        role,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        profile: {
          create: {
            headline: user.headline,
            bio: `${user.name} 계정은 BAESH 개발 테스트를 위한 seed 계정입니다.`,
            school: user.school,
            company: user.company,
            location: user.location,
            skills: user.skills,
            interests: user.interests,
            socialLinks: {
              website: 'https://baesh.dev',
            },
            trustScore: user.role === UserRole.USER ? 72 : 64,
            verified: user.role === UserRole.USER,
          },
        },
      },
      update: {
        password: userPassword,
        name: user.name,
        role,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        profile: {
          upsert: {
            create: {
              headline: user.headline,
              bio: `${user.name} 계정은 BAESH 개발 테스트를 위한 seed 계정입니다.`,
              school: user.school,
              company: user.company,
              location: user.location,
              skills: user.skills,
              interests: user.interests,
              socialLinks: {
                website: 'https://baesh.dev',
              },
              trustScore: user.role === UserRole.USER ? 72 : 64,
              verified: user.role === UserRole.USER,
            },
            update: {
              headline: user.headline,
              bio: `${user.name} 계정은 BAESH 개발 테스트를 위한 seed 계정입니다.`,
              school: user.school,
              company: user.company,
              location: user.location,
              skills: user.skills,
              interests: user.interests,
              socialLinks: {
                website: 'https://baesh.dev',
              },
              trustScore: user.role === UserRole.USER ? 72 : 64,
              verified: user.role === UserRole.USER,
            },
          },
        },
      },
    })
  }

  const demoProfile = await prisma.profile.findUniqueOrThrow({
    where: { userId: 'seed-user-demo' },
  })

  await prisma.certificate.upsert({
    where: { id: 'seed-cert-product-ai' },
    create: {
      id: 'seed-cert-product-ai',
      profileId: demoProfile.id,
      title: 'AI Product Builder Program',
      issuer: 'BAESH Innovation School',
      verified: true,
    },
    update: {
      title: 'AI Product Builder Program',
      issuer: 'BAESH Innovation School',
      verified: true,
    },
  })

  await prisma.career.upsert({
    where: { id: 'seed-career-baesh-labs' },
    create: {
      id: 'seed-career-baesh-labs',
      profileId: demoProfile.id,
      company: 'BAESH Labs',
      position: 'Product Engineer Intern',
      description: 'AI 기반 프로젝트 커리어 데이터 플랫폼의 초기 제품 구조를 설계했습니다.',
    },
    update: {
      company: 'BAESH Labs',
      position: 'Product Engineer Intern',
      description: 'AI 기반 프로젝트 커리어 데이터 플랫폼의 초기 제품 구조를 설계했습니다.',
    },
  })

  await prisma.award.upsert({
    where: { id: 'seed-award-hackathon' },
    create: {
      id: 'seed-award-hackathon',
      profileId: demoProfile.id,
      title: 'Career Data Hackathon Finalist',
      issuer: 'BAESH',
      description: '프로젝트 경험을 검증 가능한 커리어 데이터로 전환하는 프로토타입을 발표했습니다.',
    },
    update: {
      title: 'Career Data Hackathon Finalist',
      issuer: 'BAESH',
      description: '프로젝트 경험을 검증 가능한 커리어 데이터로 전환하는 프로토타입을 발표했습니다.',
    },
  })

  await prisma.portfolio.upsert({
    where: { id: 'seed-portfolio-baesh' },
    create: {
      id: 'seed-portfolio-baesh',
      profileId: demoProfile.id,
      title: 'BAESH Career Data Prototype',
      description: '프로젝트 이력을 구조화하고 AI 분석으로 연결하는 포트폴리오 샘플입니다.',
      url: 'https://baesh.dev',
      imageUrl: null,
    },
    update: {
      title: 'BAESH Career Data Prototype',
      description: '프로젝트 이력을 구조화하고 AI 분석으로 연결하는 포트폴리오 샘플입니다.',
      url: 'https://baesh.dev',
      imageUrl: null,
    },
  })

  await prisma.project.upsert({
    where: { slug: 'baesh-career-data-os' },
    create: {
      id: 'seed-project-baesh-career-data-os',
      title: 'BAESH Career Data OS',
      slug: 'baesh-career-data-os',
      description: '프로젝트 경험을 커리어 데이터로 구조화하는 AI SaaS 플랫폼입니다.',
      objective: '개인의 프로젝트 활동을 검증 가능한 커리어 자산으로 전환합니다.',
      readme:
        'BAESH Career Data OS는 프로필, 프로젝트, 산출물, 활동 기록을 하나의 데이터 그래프로 연결합니다.',
      ownerId: 'seed-user-demo',
      status: ProjectStatus.ACTIVE,
      progress: 62,
      visibility: ProjectVisibility.PUBLIC,
      skills: ['React', 'TypeScript', 'Express', 'Prisma', 'PostgreSQL'],
      members: {
        create: [
          {
            id: 'seed-member-demo-owner',
            userId: 'seed-user-demo',
            role: 'Owner',
            contribution: '제품 구조 설계와 풀스택 구현을 담당했습니다.',
          },
        ],
      },
      tasks: {
        create: [
          {
            id: 'seed-task-profile',
            title: 'Profile API and page',
            description: '프로필 조회, 수정, 커리어 기록 저장 흐름을 구현합니다.',
            status: 'DONE',
          },
          {
            id: 'seed-task-projects',
            title: 'Projects workspace',
            description: '프로젝트 목록, 상세, 태스크, 활동, 파일 영역을 연결합니다.',
            status: 'IN_PROGRESS',
          },
        ],
      },
      activities: {
        create: [
          {
            id: 'seed-activity-created',
            userId: 'seed-user-demo',
            type: ProjectActivityType.MILESTONE,
            title: 'Seed project created',
            description: '테스트용 대표 프로젝트가 생성되었습니다.',
          },
        ],
      },
      files: {
        create: [
          {
            id: 'seed-file-product-brief',
            name: 'Product brief',
            url: 'https://baesh.dev/product-brief',
            fileType: 'link',
            uploadedBy: 'seed-user-demo',
          },
        ],
      },
    },
    update: {
      title: 'BAESH Career Data OS',
      description: '프로젝트 경험을 커리어 데이터로 구조화하는 AI SaaS 플랫폼입니다.',
      objective: '개인의 프로젝트 활동을 검증 가능한 커리어 자산으로 전환합니다.',
      readme:
        'BAESH Career Data OS는 프로필, 프로젝트, 산출물, 활동 기록을 하나의 데이터 그래프로 연결합니다.',
      status: ProjectStatus.ACTIVE,
      progress: 62,
      visibility: ProjectVisibility.PUBLIC,
      skills: ['React', 'TypeScript', 'Express', 'Prisma', 'PostgreSQL'],
    },
  })

  await prisma.post.upsert({
    where: { id: 'seed-post-project-update' },
    create: {
      id: 'seed-post-project-update',
      authorId: 'seed-user-demo',
      linkedProjectId: 'seed-project-baesh-career-data-os',
      content:
        'BAESH Career Data OS의 Profile과 Projects 워크스페이스를 연결했습니다. 다음 목표는 Network 피드와 Opportunities 매칭입니다. #React #Prisma #CareerData',
      mediaUrls: [],
      visibility: 'PUBLIC',
      comments: {
        create: [
          {
            id: 'seed-comment-company',
            authorId: 'seed-user-company',
            content: '프로젝트 기반 기여도 확인 흐름이 기업 인재 검증에 유용해 보입니다.',
          },
        ],
      },
      likes: {
        create: [
          {
            id: 'seed-like-company',
            userId: 'seed-user-company',
          },
          {
            id: 'seed-like-institution',
            userId: 'seed-user-institution',
          },
        ],
      },
    },
    update: {
      linkedProjectId: 'seed-project-baesh-career-data-os',
      content:
        'BAESH Career Data OS의 Profile과 Projects 워크스페이스를 연결했습니다. 다음 목표는 Network 피드와 Opportunities 매칭입니다. #React #Prisma #CareerData',
      mediaUrls: [],
      visibility: 'PUBLIC',
    },
  })

  await prisma.opportunity.upsert({
    where: { id: 'seed-opportunity-product-engineer' },
    create: {
      id: 'seed-opportunity-product-engineer',
      title: 'AI Product Engineer Internship',
      type: OpportunityType.INTERNSHIP,
      organization: 'BAESH Partners',
      description:
        'React, TypeScript, Node.js 기반으로 AI SaaS 제품을 함께 만드는 인턴십입니다. 프로젝트 이력과 산출물 중심으로 평가합니다.',
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      location: 'Seoul',
      isRemote: false,
      applyUrl: 'https://baesh.dev/apply/product-engineer',
      createdBy: 'seed-user-admin',
    },
    update: {
      title: 'AI Product Engineer Internship',
      type: OpportunityType.INTERNSHIP,
      organization: 'BAESH Partners',
      description:
        'React, TypeScript, Node.js 기반으로 AI SaaS 제품을 함께 만드는 인턴십입니다. 프로젝트 이력과 산출물 중심으로 평가합니다.',
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      location: 'Seoul',
      isRemote: false,
      applyUrl: 'https://baesh.dev/apply/product-engineer',
      createdBy: 'seed-user-admin',
    },
  })

  await prisma.opportunity.upsert({
    where: { id: 'seed-opportunity-career-hackathon' },
    create: {
      id: 'seed-opportunity-career-hackathon',
      title: 'Career Data Hackathon',
      type: OpportunityType.HACKATHON,
      organization: 'BAESH Innovation School',
      description:
        '프로젝트 경험을 커리어 데이터로 전환하는 아이디어와 프로토타입을 만드는 해커톤입니다.',
      skills: ['AI', 'Product Design', 'React'],
      location: 'Online',
      isRemote: true,
      applyUrl: 'https://baesh.dev/hackathon',
      createdBy: 'seed-user-admin',
    },
    update: {
      title: 'Career Data Hackathon',
      type: OpportunityType.HACKATHON,
      organization: 'BAESH Innovation School',
      description:
        '프로젝트 경험을 커리어 데이터로 전환하는 아이디어와 프로토타입을 만드는 해커톤입니다.',
      skills: ['AI', 'Product Design', 'React'],
      location: 'Online',
      isRemote: true,
      applyUrl: 'https://baesh.dev/hackathon',
      createdBy: 'seed-user-admin',
    },
  })

  await prisma.opportunity.upsert({
    where: { id: 'seed-opportunity-founder-program' },
    create: {
      id: 'seed-opportunity-founder-program',
      title: 'Student Founder Launch Program',
      type: OpportunityType.STARTUP_PROGRAM,
      organization: 'BAESH Ventures',
      description:
        '프로젝트 기반 포트폴리오와 초기 사용자 검증 경험을 가진 예비 창업자를 위한 6주 프로그램입니다.',
      skills: ['Startup', 'User Research', 'Product Strategy'],
      location: 'Seoul',
      isRemote: false,
      applyUrl: 'https://baesh.dev/programs/founder',
      createdBy: 'seed-user-admin',
    },
    update: {
      title: 'Student Founder Launch Program',
      type: OpportunityType.STARTUP_PROGRAM,
      organization: 'BAESH Ventures',
      description:
        '프로젝트 기반 포트폴리오와 초기 사용자 검증 경험을 가진 예비 창업자를 위한 6주 프로그램입니다.',
      skills: ['Startup', 'User Research', 'Product Strategy'],
      location: 'Seoul',
      isRemote: false,
      applyUrl: 'https://baesh.dev/programs/founder',
      createdBy: 'seed-user-admin',
    },
  })

  await seedCommunityPeople(password)
  await seedFounderResume(prisma)

  const totalUsers = await prisma.user.count()
  const totalPosts = await prisma.post.count()

  console.log('Seed complete.')
  console.log(`Users: ${totalUsers} (target ${TARGET_USER_COUNT}) · Posts: ${totalPosts}`)
  for (const user of demoUsers) {
    if (user.role !== UserRole.USER && !allowPrivilegedDemoAccounts) {
      console.log(`${user.email} / (locked: seeded as USER, set SEED_PRIVILEGED_DEMO_ACCOUNTS=true locally to enable)`)
    } else {
      console.log(`${user.email} / ${demoPassword} (${user.role})`)
    }
  }
  console.log('Community logins: p001@seed.baesh.dev … / password123')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
