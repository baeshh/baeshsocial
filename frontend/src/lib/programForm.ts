import type { Program, ProgramStatus } from '../types/program'
import { toDateInput } from './programs'

export type ProgramFormValue = {
  title: string
  term: string
  description: string
  status: ProgramStatus
  startDate: string
  endDate: string
  managerUserIds: string[]
}

export const emptyProgramForm = (): ProgramFormValue => ({
  title: '',
  term: '',
  description: '',
  status: 'active',
  startDate: '',
  endDate: '',
  managerUserIds: [],
})

export function programToForm(program: Program): ProgramFormValue {
  return {
    title: program.title,
    term: program.term ?? '',
    description: program.description ?? '',
    status: program.status,
    startDate: toDateInput(program.startDate),
    endDate: toDateInput(program.endDate),
    managerUserIds: program.managers.map((manager) => manager.id),
  }
}

export function toProgramPayload(value: ProgramFormValue) {
  return {
    title: value.title.trim(),
    term: value.term.trim() || null,
    description: value.description.trim() || null,
    status: value.status,
    startDate: value.startDate || null,
    endDate: value.endDate || null,
  }
}
