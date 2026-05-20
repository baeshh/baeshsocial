import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { EmptyState } from '../common/EmptyState'
import { Modal } from '../common/Modal'
import type { ContentLike } from '../../types/post'

type PostLikesModalProps = {
  open: boolean
  likes: ContentLike[]
  onClose: () => void
  title?: string
}

export function PostLikesModal({ open, likes, onClose, title = '좋아요' }: PostLikesModalProps) {
  const subject = title === '댓글 좋아요' ? '이 댓글' : '이 게시물'
  return (
    <Modal
      description={`${likes.length}명이 ${subject}에 좋아요를 눌렀습니다.`}
      onClose={onClose}
      open={open}
      title={title}
    >
      {likes.length === 0 ? (
        <EmptyState description="첫 번째 좋아요를 남겨 보세요." title="아직 좋아요가 없습니다" />
      ) : (
        <ul className="max-h-[min(60vh,24rem)] space-y-2 overflow-y-auto">
          {likes.map((like) => {
            const person = like.user
            if (!person) {
              return null
            }
            return (
              <li key={like.id}>
                <Link
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-muted"
                  onClick={onClose}
                  to={`/profile/${person.id}`}
                >
                  <Avatar name={person.name} size="sm" src={person.avatarUrl} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-strong">{person.name}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
