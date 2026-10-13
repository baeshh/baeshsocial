import { apiRequest, withQuery } from '../lib/api'
import type { Post } from '../types/post'

export type PostPage = { posts: Post[]; nextCursor: string | null }
type PageParams = { cursor?: string | null; limit?: number }

export type PostPayload = {
  content?: string
  linkedProjectId?: string | null
  visibility?: 'public' | 'connections' | 'private'
  repostOfId?: string | null
  mediaUrls?: string[]
}

export function getPosts(token: string, params: PageParams = {}) {
  return apiRequest<PostPage>(withQuery('/posts', { limit: params.limit ?? 20, cursor: params.cursor }), { token })
}

export function getRecommendedPosts(token: string, limit = 8) {
  return apiRequest<{ posts: Post[] }>(`/posts/recommended?limit=${limit}`, { token })
}

export function getMyRepostedSourceIds(token: string) {
  return apiRequest<{ postIds: string[] }>('/posts/me/reposts', { token })
}

export function getPostsByUser(token: string, userId: string, params: PageParams = {}) {
  return apiRequest<PostPage>(
    withQuery(`/posts/by-user/${userId}`, { limit: params.limit ?? 10, cursor: params.cursor }),
    { token },
  )
}

export function getMyPosts(token: string, params: PageParams = {}) {
  return apiRequest<PostPage>(withQuery('/posts/me', { limit: params.limit ?? 10, cursor: params.cursor }), { token })
}

export function getPost(token: string, postId: string) {
  return apiRequest<{ post: Post }>(`/posts/${postId}`, { token })
}

export function getPublicPost(postId: string) {
  return apiRequest<{ post: Post }>(`/posts/public/${postId}`)
}

export function getPublicPostsByUser(userId: string, params: PageParams = {}) {
  return apiRequest<PostPage>(
    withQuery(`/posts/public/by-user/${userId}`, { limit: params.limit ?? 10, cursor: params.cursor }),
  )
}

export function createPost(token: string, payload: PostPayload) {
  return apiRequest<{ post: Post }>('/posts', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updatePost(token: string, postId: string, payload: Partial<PostPayload>) {
  return apiRequest<{ post: Post }>(`/posts/${postId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function deletePost(token: string, postId: string) {
  return apiRequest<void>(`/posts/${postId}`, {
    method: 'DELETE',
    token,
  })
}

export function likePost(token: string, postId: string) {
  return apiRequest(`/posts/${postId}/like`, {
    method: 'POST',
    token,
  })
}

export function unlikePost(token: string, postId: string) {
  return apiRequest<void>(`/posts/${postId}/like`, {
    method: 'DELETE',
    token,
  })
}

export function addComment(token: string, postId: string, content: string, parentId?: string) {
  return apiRequest(`/posts/${postId}/comments`, {
    method: 'POST',
    token,
    body: JSON.stringify(parentId ? { content, parentId } : { content }),
  })
}

export function likeComment(token: string, postId: string, commentId: string) {
  return apiRequest(`/posts/${postId}/comments/${commentId}/like`, {
    method: 'POST',
    token,
  })
}

export function unlikeComment(token: string, postId: string, commentId: string) {
  return apiRequest<void>(`/posts/${postId}/comments/${commentId}/like`, {
    method: 'DELETE',
    token,
  })
}

export function deleteComment(token: string, postId: string, commentId: string) {
  return apiRequest<void>(`/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    token,
  })
}
