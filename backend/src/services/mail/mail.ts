import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { env } from '../../config/env.js'

export type MailMessage = { to: string; subject: string; text: string }

let client: SESv2Client | null = null

/**
 * `log` (default) never sends: invite links are returned to the admin who shares them.
 * `ses` sends through Amazon SES with the instance role's credentials.
 */
export async function sendMail(message: MailMessage): Promise<'sent' | 'logged'> {
  if (env.MAIL_DRIVER === 'log') {
    console.info(`[mail:log] to=${message.to.replace(/(.).+(@.+)/, '$1***$2')} subject=${message.subject}`)
    return 'logged'
  }
  client ??= new SESv2Client({ region: env.SES_REGION })
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: env.MAIL_FROM,
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
        },
      },
    }),
  )
  return 'sent'
}
