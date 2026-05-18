import { apiRequest } from '../lib/api'
import type { Post } from '../types/post'

export type PostPayload = {
  content?: string
  linkedProjectId?: string | null
  visibility?: 'public' | 'connections' | 'private'
  repostOfId?: string | null
  mediaUrls?: string[]
}

export function getPosts(token: string) {
  return apiRequest<{ posts: Post[] }>('/posts', { token })
}

export function getRecommendedPosts(token: string, limit = 8) {
  return apiRequest<{ posts: Post[] }>(`/posts/recommended?limit=${limit}`, { token })
}

export function getPostsByUser(token: string, userId: string) {
  return apiRequest<{ posts: Post[] }>(`/posts/by-user/${userId}`, { token })
}

export function getMyPosts(token: string) {
  return apiRequest<{ posts: Post[] }>('/posts/me', { token })
}

export function getPost(token: string, postId: string) {
  return apiRequest<{ post: Post }>(`/posts/${postId}`, { token })
}

export function getPublicPost(postId: string) {
  return apiRequest<{ post: Post }>(`/posts/public/${postId}`)
}

export function getPublicPostsByUser(userId: string) {
  return apiRequest<{ posts: Post[] }>(`/posts/public/by-user/${userId}`)
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

export function addComment(token: string, postId: string, content: string) {
  return apiRequest(`/posts/${postId}/comments`, {
    method: 'POST',
    token,
    body: JSON.stringify({ content }),
  })
}
