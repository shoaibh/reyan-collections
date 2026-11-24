import type { NotifyEvent } from '@/lib/notifications/templates'

export type EmailMessage = {
  to: string
  subject: string
  html: string
  tag: NotifyEvent
  orderNumber?: string
}

export interface EmailClient {
  send(msg: EmailMessage): Promise<void>
}
