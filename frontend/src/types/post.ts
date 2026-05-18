import type { AuthUser } from './auth'

export type PostVisibility = 'PUBLIC' | 'CONNECTIONS' | 'PRIVATE'

export type PostProject = {
  id: string
  title: string
  slug: string
  description: string | null
  status: string
  progress: number
  skills: string[]
}

export type PostLike = {
  id: string
  userId: string
  createdAt: string
}

export type PostComment = {
  id: string
  postId: string
  authorId: string
  content: string
  createdAt: string
  updatedAt: string
  author: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
}

export type PostCore = {
  id: string
  authorId: string
  content: string
  linkedProjectId: string | null
  repostOfId?: string | null
  visibility: PostVisibility
  createdAt: string
  updatedAt: string
  mediaUrls?: string[]
  author: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
  linkedProject: PostProject | null
  likes: PostLike[]
  comments: PostComment[]
}

export type Post = PostCore & {
  repostOf?: PostCore | null
}
