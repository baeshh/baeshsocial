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

export type ContentLike = {
  id: string
  userId: string
  createdAt: string
  user?: Pick<AuthUser, 'id' | 'name' | 'avatarUrl'>
}

export type PostLike = ContentLike

export type PostComment = {
  id: string
  postId: string
  authorId: string
  parentId?: string | null
  content: string
  createdAt: string
  updatedAt: string
  author: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
  likes: ContentLike[]
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
