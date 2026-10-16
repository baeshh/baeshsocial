export type NotificationType =
  | 'SYSTEM'
  | 'PROJECT'
  | 'OPPORTUNITY'
  | 'MESSAGE'
  | 'AI'
  | 'POST_LIKE'
  | 'POST_COMMENT'
  | 'COMMENT_REPLY'
  | 'FOLLOW'
  | 'PROJECT_INVITE'

export type NotificationActor = {
  id: string
  name: string
  avatarUrl: string | null
}

export type AppNotification = {
  id: string
  userId: string
  actorId: string | null
  title: string
  body: string
  type: NotificationType
  read: boolean
  link: string | null
  /** Sent by BAESH (platform admin or scheduled notice); rendered with the BAESH logo. */
  fromPlatform: boolean
  createdAt: string
  actor: NotificationActor | null
}
