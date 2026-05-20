import { GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ClickableProfileAvatar } from './ProfileAvatarLightbox'
import { EmbeddedPostPreview } from '../posts/EmbeddedPostPreview'
import { PostMediaGrid } from '../posts/PostMediaGrid'
import type { Post } from '../../types/post'
import type { ProfilePayload } from '../../types/profile'

type PublicProfileViewProps = {
  data: ProfilePayload
  posts: Post[]
}

export function PublicProfileView({ data, posts }: PublicProfileViewProps) {
  const { profile, projects, stats } = data

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-sm">
        <div
          className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 bg-cover bg-center px-5 pb-16 pt-5 sm:px-6"
          style={
            profile.user.coverUrl ? { backgroundImage: `url(${profile.user.coverUrl})` } : undefined
          }
        >
          <div className="absolute inset-0 bg-slate-900/45" aria-hidden />
          {profile.headline ? (
            <span className="relative inline-block rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm">
              {profile.headline}
            </span>
          ) : null}
        </div>

        <div className="relative px-5 pb-6 sm:px-6">
          <div className="-mt-14">
            <ClickableProfileAvatar
              className="ring-4 ring-white"
              name={profile.user.name}
              size="xl"
              src={profile.user.avatarUrl}
            />
          </div>

          <div className="mt-5">
            <h1 className="text-2xl font-bold text-ink-strong">{profile.user.name}</h1>
            {profile.bio ? (
              <p className="mt-2 max-w-2xl leading-relaxed text-ink-body">{profile.bio}</p>
            ) : null}
            {(profile.company || profile.location) && (
              <p className="mt-2 text-sm font-medium text-ink-muted">
                {[profile.company, profile.location].filter(Boolean).join(' · ')}
              </p>
            )}
            {profile.school ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-ink-muted">
                <GraduationCap className="text-brand-600" size={18} />
                {profile.school}
              </p>
            ) : null}

            {profile.skills.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span
                    className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-100"
                    key={skill}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-6 text-sm text-ink-muted">
              <span>
                <span className="text-base font-bold text-ink-strong">{stats.followerCount}</span> 팔로워
              </span>
              <span>
                <span className="text-base font-bold text-ink-strong">{stats.postCount}</span> 게시물
              </span>
              <span>
                <span className="text-base font-bold text-ink-strong">{projects.length}</span> 공개 프로젝트
              </span>
            </div>
          </div>
        </div>
      </div>

      {projects.length > 0 ? (
        <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink-strong">공개 프로젝트</h2>
          <ul className="mt-4 space-y-3">
            {projects.map((project) => (
              <li className="rounded-xl border border-surface-border bg-surface-muted/30 p-4" key={project.id}>
                <p className="font-semibold text-ink-strong">{project.title}</p>
                {project.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{project.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {posts.length > 0 ? (
        <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink-strong">공개 게시물</h2>
          <div className="mt-4 space-y-4">
            {posts.map((post) => (
              <article className="rounded-xl border border-surface-border p-4" key={post.id}>
                {post.repostOf ? (
                  <div className="mb-3">
                    <EmbeddedPostPreview post={post.repostOf} profileLinks={false} />
                  </div>
                ) : null}
                {post.content.trim() ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{post.content}</p>
                ) : null}
                <PostMediaGrid urls={post.mediaUrls ?? []} />
                <Link
                  className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
                  to={`/p/${post.id}`}
                >
                  게시물 보기 →
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
