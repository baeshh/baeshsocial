import type { PostComment } from '../types/post'

export type CommentTreeNode = PostComment & {
  replies: CommentTreeNode[]
}

export function buildCommentTree(comments: PostComment[]): CommentTreeNode[] {
  const byId = new Map<string, CommentTreeNode>()
  const roots: CommentTreeNode[] = []

  for (const comment of comments) {
    byId.set(comment.id, { ...comment, replies: [] })
  }

  for (const comment of comments) {
    const node = byId.get(comment.id)
    if (!node) {
      continue
    }
    if (comment.parentId) {
      const parent = byId.get(comment.parentId)
      if (parent) {
        parent.replies.push(node)
      } else {
        roots.push(node)
      }
    } else {
      roots.push(node)
    }
  }

  return roots
}

export function topLevelComments(comments: PostComment[]): PostComment[] {
  return comments.filter((comment) => !comment.parentId)
}
