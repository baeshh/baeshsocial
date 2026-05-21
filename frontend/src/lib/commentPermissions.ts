/** 게시물 작성자 또는 댓글·답글 작성자만 삭제 가능 */
export function canDeleteComment(
  userId: string | undefined,
  postAuthorId: string,
  commentAuthorId: string,
) {
  if (!userId) {
    return false
  }
  return userId === commentAuthorId || userId === postAuthorId
}
