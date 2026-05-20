import { Router } from 'express'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import {
  buildProfileDescription,
  buildProfileTitle,
  escapeHtml,
  getSiteOrigin,
} from './seo.utils.js'

export const seoRouter = Router()

const siteOrigin = getSiteOrigin(env.FRONTEND_URL)

async function loadSeoProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      updatedAt: true,
      profile: {
        select: {
          headline: true,
          bio: true,
          school: true,
          company: true,
          location: true,
          skills: true,
          updatedAt: true,
        },
      },
    },
  })

  if (!user) {
    return null
  }

  return user
}

seoRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain; charset=utf-8')
  res.send(
    `User-agent: *
Allow: /u/
Disallow: /p/
Disallow: /network
Disallow: /profile
Disallow: /auth
Disallow: /api/

Sitemap: ${siteOrigin}/sitemap.xml
`,
  )
})

seoRouter.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { profile: { isNot: null } },
      select: {
        id: true,
        updatedAt: true,
        profile: { select: { updatedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const urls = users
      .map((user) => {
        const lastmod = (user.profile?.updatedAt ?? user.updatedAt).toISOString().slice(0, 10)
        return `  <url>
    <loc>${siteOrigin}/u/${escapeHtml(user.id)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
      })
      .join('\n')

    res.type('application/xml; charset=utf-8')
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`,
    )
  } catch (error) {
    next(error)
  }
})

seoRouter.get('/u/:userId', async (req, res, next) => {
  try {
    const userId = String(req.params.userId)
    const user = await loadSeoProfile(userId)

    if (!user) {
      res.status(404).type('text/html; charset=utf-8').send(
        `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>프로필 없음 · BAESH</title></head>
<body><p>프로필을 찾을 수 없습니다.</p><a href="${siteOrigin}">BAESH 홈</a></body></html>`,
      )
      return
    }

    const profile = user.profile
    const headline = profile?.headline ?? null
    const bio = profile?.bio ?? null
    const school = profile?.school ?? null
    const company = profile?.company ?? null
    const location = profile?.location ?? null
    const skills = profile?.skills ?? []

    const title = buildProfileTitle(user.name)
    const description = buildProfileDescription({
      name: user.name,
      headline,
      bio,
      school,
      company,
      location,
      skills,
    })
    const canonical = `${siteOrigin}/u/${user.id}`
    const ogImage = user.avatarUrl ?? `${siteOrigin}/baesh-logo.png`

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: user.name,
      description,
      url: canonical,
      ...(user.avatarUrl ? { image: user.avatarUrl } : {}),
      ...(company ? { worksFor: { '@type': 'Organization', name: company } } : {}),
      ...(school ? { alumniOf: { '@type': 'EducationalOrganization', name: school } } : {}),
      ...(location ? { address: location } : {}),
      ...(skills.length > 0 ? { knowsAbout: skills } : {}),
    }

    const skillTags =
      skills.length > 0
        ? `<div class="skills">${skills
            .map((skill) => `<span class="skill">${escapeHtml(skill)}</span>`)
            .join('')}</div>`
        : ''

    const metaLine = [company, location]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(escapeHtml)
      .join(' · ')

    res.type('text/html; charset=utf-8').send(
      `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="BAESH" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Pretendard", system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; line-height: 1.6; }
    main { max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem; padding: 1.5rem; box-shadow: 0 1px 3px rgb(15 23 42 / 0.06); }
    h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
    .headline { display: inline-block; margin-bottom: 0.75rem; padding: 0.35rem 0.85rem; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 0.875rem; font-weight: 600; }
    .meta { color: #64748b; font-size: 0.9rem; margin: 0.5rem 0; }
    .bio { margin: 1rem 0 0; white-space: pre-wrap; }
    .school { color: #64748b; font-size: 0.9rem; margin-top: 0.75rem; }
    .skills { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
    .skill { padding: 0.25rem 0.75rem; border-radius: 999px; background: #f5f3ff; color: #5b21b6; font-size: 0.75rem; font-weight: 600; }
    .cta { margin-top: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .cta a { display: inline-block; padding: 0.65rem 1.25rem; border-radius: 999px; font-weight: 600; font-size: 0.875rem; text-decoration: none; }
    .primary { background: #4f46e5; color: #fff; }
    .ghost { border: 1px solid #cbd5e1; color: #334155; background: #fff; }
    footer { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #94a3b8; }
  </style>
</head>
<body>
  <main>
    <article class="card">
      ${headline ? `<span class="headline">${escapeHtml(headline)}</span>` : ''}
      <h1>${escapeHtml(user.name)}</h1>
      ${metaLine ? `<p class="meta">${metaLine}</p>` : ''}
      ${bio ? `<p class="bio">${escapeHtml(bio)}</p>` : ''}
      ${school ? `<p class="school">${escapeHtml(school)}</p>` : ''}
      ${skillTags}
      <div class="cta">
        <a class="primary" href="${escapeHtml(siteOrigin)}/auth/register">BAESH 가입하기</a>
        <a class="ghost" href="${escapeHtml(siteOrigin)}/auth/login">로그인</a>
      </div>
    </article>
    <footer>BAESH — AI 기반 프로젝트 커리어 데이터 인프라</footer>
  </main>
</body>
</html>`,
    )
  } catch (error) {
    next(error)
  }
})
