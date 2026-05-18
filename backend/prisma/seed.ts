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

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/baesh_v2?schema=public',
})

const prisma = new PrismaClient({ adapter })

const demoPassword = 'password123'

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
  },
]

async function main() {
  const password = await bcrypt.hash(demoPassword, 12)

  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: user.id,
        email: user.email,
        password,
        name: user.name,
        role: user.role,
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
        password,
        name: user.name,
        role: user.role,
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
    },
    update: {
      title: 'BAESH Career Data Prototype',
      description: '프로젝트 이력을 구조화하고 AI 분석으로 연결하는 포트폴리오 샘플입니다.',
      url: 'https://baesh.dev',
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

  console.log('Seed complete.')
  console.log(`Demo password: ${demoPassword}`)
  for (const user of demoUsers) {
    console.log(`${user.email} / ${demoPassword}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
