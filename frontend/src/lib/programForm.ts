import type { DeliveryMode, Program, ProgramPolicy, ProgramStatus, ProgramVisibility, RecruitmentMode } from '../types/program'
import { fromDateTimeInput, toDateInput, toDateTimeInput } from './programs'

export type ProgramFormValue = {
  title: string
  term: string
  description: string
  status: ProgramStatus
  startDate: string
  endDate: string
  managerUserIds: string[]
  policy: ProgramPolicy
  visibility: ProgramVisibility
  recruitmentMode: RecruitmentMode
  targetAudience: string
  capacity: string
  applyStartAt: string
  applyEndAt: string
  announceAt: string
  selectionProcess: string
  deliveryMode: DeliveryMode | ''
  location: string
}

export const defaultProgramPolicy = (): ProgramPolicy => ({
  allowStudentProjects: false,
  requireProjectApproval: true,
  allowStudentTeams: false,
  allowPublicProjects: false,
  allowMultipleProjects: false,
  recordDisclosure: 'summary',
})

export const emptyProgramForm = (): ProgramFormValue => ({
  title: '',
  term: '',
  description: '',
  status: 'active',
  startDate: '',
  endDate: '',
  managerUserIds: [],
  policy: defaultProgramPolicy(),
  visibility: 'organization',
  recruitmentMode: 'selected',
  targetAudience: '',
  capacity: '',
  applyStartAt: '',
  applyEndAt: '',
  announceAt: '',
  selectionProcess: '',
  deliveryMode: '',
  location: '',
})

export function programToForm(program: Program): ProgramFormValue {
  const recruitment = program.recruitment
  return {
    title: program.title,
    term: program.term ?? '',
    description: program.description ?? '',
    status: program.status,
    startDate: toDateInput(program.startDate),
    endDate: toDateInput(program.endDate),
    managerUserIds: program.managers.map((manager) => manager.id),
    policy: program.policy ?? defaultProgramPolicy(),
    visibility: program.visibility,
    recruitmentMode: recruitment.mode,
    targetAudience: recruitment.targetAudience ?? '',
    capacity: recruitment.capacity ? String(recruitment.capacity) : '',
    applyStartAt: toDateTimeInput(recruitment.applyStartAt),
    applyEndAt: toDateTimeInput(recruitment.applyEndAt),
    announceAt: toDateTimeInput(recruitment.announceAt),
    selectionProcess: recruitment.selectionProcess ?? '',
    deliveryMode: recruitment.deliveryMode ?? '',
    location: recruitment.location ?? '',
  }
}

export function toProgramPayload(value: ProgramFormValue) {
  const recruiting = value.recruitmentMode === 'recruiting'
  return {
    title: value.title.trim(),
    term: value.term.trim() || null,
    description: value.description.trim() || null,
    status: value.status,
    startDate: value.startDate || null,
    endDate: value.endDate || null,
    ...value.policy,
    visibility: value.visibility,
    recruitmentMode: value.recruitmentMode,
    targetAudience: value.targetAudience.trim() || null,
    capacity: value.capacity ? Number(value.capacity) : null,
    applyStartAt: recruiting ? fromDateTimeInput(value.applyStartAt) : null,
    applyEndAt: recruiting ? fromDateTimeInput(value.applyEndAt) : null,
    announceAt: recruiting ? fromDateTimeInput(value.announceAt) : null,
    selectionProcess: recruiting ? value.selectionProcess.trim() || null : null,
    deliveryMode: value.deliveryMode || null,
    location: value.location.trim() || null,
  }
}
