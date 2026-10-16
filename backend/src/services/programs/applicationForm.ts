import type { ApplicationFieldType, Prisma, ProgramApplicationField } from '@prisma/client'
import { HttpError } from '../../utils/httpError.js'

export type ApplicationFieldInput = {
  id?: string
  type: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'url' | 'file' | 'consent'
  label: string
  description?: string | null
  required: boolean
  options: string[]
}

export const MAX_FILES_PER_FIELD = 3

const TEXT_LIMITS: Partial<Record<ApplicationFieldType, number>> = { SHORT_TEXT: 200, LONG_TEXT: 4000, URL: 500 }

export function activeFieldsWhere(programId: string): Prisma.ProgramApplicationFieldWhereInput {
  return { programId, archivedAt: null }
}

/**
 * Replaces a program's form with `fields` (in order). Fields that already hold answers or files are
 * archived rather than deleted, and a type change on such a field archives it and creates a new one,
 * so submitted applications keep their original questions.
 */
export async function replaceApplicationFields(tx: Prisma.TransactionClient, programId: string, fields: ApplicationFieldInput[]) {
  const existing = await tx.programApplicationField.findMany({
    where: activeFieldsWhere(programId),
    include: { _count: { select: { answers: true, files: true } } },
  })
  const byId = new Map(existing.map((field) => [field.id, field]))
  const kept = new Set<string>()
  const now = new Date()

  for (const [position, field] of fields.entries()) {
    const type = field.type.toUpperCase() as ApplicationFieldType
    const data = { position, type, label: field.label, description: field.description ?? null, required: field.required, options: field.options }
    const current = field.id ? byId.get(field.id) : undefined
    const used = current ? current._count.answers + current._count.files > 0 : false
    if (current && !(used && current.type !== type)) {
      kept.add(current.id)
      await tx.programApplicationField.update({ where: { id: current.id }, data })
      continue
    }
    await tx.programApplicationField.create({ data: { ...data, programId } })
  }

  for (const field of existing) {
    if (kept.has(field.id)) continue
    if (field._count.answers + field._count.files > 0) {
      await tx.programApplicationField.update({ where: { id: field.id }, data: { archivedAt: now } })
    } else {
      await tx.programApplicationField.delete({ where: { id: field.id } })
    }
  }
}

type AnswerValue = string | string[] | boolean

/**
 * Normalises raw answers against the active fields. Unknown keys and FILE fields (uploaded separately)
 * are ignored. With `requireComplete`, required questions must be answered.
 */
export function normaliseAnswers(
  fields: ProgramApplicationField[],
  raw: Record<string, unknown>,
  options: { requireComplete: boolean; fileCounts: Map<string, number> },
) {
  const answers: { field: ProgramApplicationField; value: AnswerValue }[] = []
  const missing: string[] = []

  for (const field of fields) {
    const input = raw[field.id]
    if (field.type === 'FILE') {
      if (options.requireComplete && field.required && !(options.fileCounts.get(field.id) ?? 0)) missing.push(field.label)
      continue
    }
    let value: AnswerValue | null = null
    switch (field.type) {
      case 'SHORT_TEXT':
      case 'LONG_TEXT':
      case 'URL': {
        if (input !== undefined && input !== null && typeof input !== 'string') throw new HttpError(400, `'${field.label}' 답변 형식이 올바르지 않습니다.`)
        const text = (input ?? '').trim()
        if (text.length > TEXT_LIMITS[field.type]!) throw new HttpError(400, `'${field.label}' 답변은 ${TEXT_LIMITS[field.type]}자 이내로 입력해 주세요.`)
        if (text && field.type === 'URL' && !/^https?:\/\/\S+$/i.test(text)) throw new HttpError(400, `'${field.label}'에는 http(s):// 로 시작하는 링크를 입력해 주세요.`)
        value = text || null
        break
      }
      case 'SINGLE_CHOICE': {
        if (input !== undefined && input !== null && input !== '' && (typeof input !== 'string' || !field.options.includes(input))) {
          throw new HttpError(400, `'${field.label}'의 선택지를 다시 골라 주세요.`)
        }
        value = (input as string | null | undefined) || null
        break
      }
      case 'MULTI_CHOICE': {
        const list = input === undefined || input === null ? [] : input
        if (!Array.isArray(list) || list.some((item) => typeof item !== 'string' || !field.options.includes(item))) {
          throw new HttpError(400, `'${field.label}'의 선택지를 다시 골라 주세요.`)
        }
        value = list.length ? [...new Set(list as string[])] : null
        break
      }
      case 'CONSENT': {
        if (input !== undefined && input !== null && typeof input !== 'boolean') throw new HttpError(400, `'${field.label}' 답변 형식이 올바르지 않습니다.`)
        value = input === true ? true : null
        break
      }
    }
    if (value === null) {
      if (options.requireComplete && field.required) missing.push(field.label)
      continue
    }
    answers.push({ field, value })
  }

  if (missing.length) throw new HttpError(400, `필수 항목을 입력해 주세요: ${missing.join(', ')}`)
  return answers
}
