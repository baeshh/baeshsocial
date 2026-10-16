import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { draftToFieldPayload, toProgramPayload, validateDraftFields, type DraftField, type ProgramFormValue } from '../lib/programForm'
import { takesApplications } from '../lib/programs'
import {
  createProgram,
  getApplicationForm,
  saveApplicationForm,
  updateProgram,
  type ApplicationFieldPayload,
  type ProgramPayload,
} from '../services/programService'
import { useAuthStore } from '../stores/authStore'
import type { ApplicationField, Program } from '../types/program'

/** Serialized server state of a draft: program settings and (for recruiting modes) the application form. */
export type DraftSnapshot = { payload: string; fields: string | null }

export type AutosaveStatus = 'idle' | 'waiting' | 'saving' | 'saved' | 'error'

const MIN_TITLE_LENGTH = 2

function draftPayload(form: ProgramFormValue, canAssignManagers: boolean): ProgramPayload {
  return { ...toProgramPayload(form), ...(canAssignManagers ? { managerUserIds: form.managerUserIds } : {}) }
}

function fieldPayload(form: ProgramFormValue): ApplicationFieldPayload[] | null {
  if (!takesApplications(form.recruitmentMode) || validateDraftFields(form.applicationFields)) return null
  return draftToFieldPayload(form.applicationFields)
}

export function snapshotOf(form: ProgramFormValue, canAssignManagers: boolean): DraftSnapshot {
  const fields = fieldPayload(form)
  return { payload: JSON.stringify(draftPayload(form, canAssignManagers)), fields: fields ? JSON.stringify(fields) : null }
}

/**
 * Keeps a program draft in sync with the server: creates it once the title is usable, then PATCHes settings and PUTs the
 * application form after a pause in typing. Form contents never touch localStorage — the server draft is the only copy,
 * so it survives reloads and other devices without leaving personal data in the browser.
 */
export function useProgramAutosave({
  orgId,
  programId,
  form,
  setForm,
  canAssignManagers,
  initialSnapshot,
  onCreated,
  enabled = true,
  delayMs = 1200,
}: {
  orgId: string
  programId: string | null
  form: ProgramFormValue
  setForm: Dispatch<SetStateAction<ProgramFormValue>>
  canAssignManagers: boolean
  initialSnapshot: DraftSnapshot | null
  onCreated: (program: Program) => void
  enabled?: boolean
  delayMs?: number
}) {
  const token = useAuthStore((state) => state.token)
  const [saved, setSaved] = useState<DraftSnapshot | null>(initialSnapshot)
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved' | 'error'>(initialSnapshot ? 'saved' : 'idle')
  const [error, setError] = useState<{ message: string; key: string } | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const stopped = useRef(false)

  const latest = useRef({ form, programId, saved, canAssignManagers, onCreated })
  useEffect(() => {
    latest.current = { form, programId, saved, canAssignManagers, onCreated }
  })
  const running = useRef<Promise<boolean> | null>(null)
  const again = useRef(false)

  const snapshot = snapshotOf(form, canAssignManagers)
  const titleReady = form.title.trim().length >= MIN_TITLE_LENGTH
  const fieldsProblem = takesApplications(form.recruitmentMode) ? validateDraftFields(form.applicationFields) : null
  const dirty = programId
    ? snapshot.payload !== saved?.payload || (snapshot.fields !== null && snapshot.fields !== saved?.fields)
    : titleReady

  /** Writes server-assigned field ids back by draft key so the next save updates rows instead of recreating them. */
  const adoptFieldIds = useCallback(
    (sent: DraftField[], stored: ApplicationField[]) => {
      if (stored.length !== sent.length) return null
      const idByKey = new Map(sent.map((field, index) => [field.key, stored[index].id]))
      setForm((prev) => ({
        ...prev,
        applicationFields: prev.applicationFields.map((field) => (!field.id && idByKey.has(field.key) ? { ...field, id: idByKey.get(field.key) } : field)),
      }))
      return JSON.stringify(draftToFieldPayload(sent.map((field, index) => ({ ...field, id: stored[index].id }))))
    },
    [setForm],
  )

  const commit = (next: DraftSnapshot) => {
    latest.current.saved = next
    setSaved(next)
  }

  const saveOnce = async (): Promise<'saved' | 'skipped'> => {
    const { form: current, programId: id, canAssignManagers: assign, onCreated: created } = latest.current
    if (!token) return 'skipped'
    const snap = snapshotOf(current, assign)
    if (!id) {
      if (current.title.trim().length < MIN_TITLE_LENGTH) return 'skipped'
      const fields = fieldPayload(current)
      const { program } = await createProgram(token, orgId, {
        ...draftPayload(current, assign),
        publish: false,
        managerUserIds: assign ? current.managerUserIds : [],
        ...(fields ? { applicationFields: fields } : {}),
      })
      latest.current.programId = program.id
      let fieldsKey: string | null = null
      if (fields) {
        const stored = await getApplicationForm(token, program.id)
        fieldsKey = adoptFieldIds(current.applicationFields, stored.fields)
      }
      commit({ payload: snap.payload, fields: fieldsKey })
      created(program)
      return 'saved'
    }
    const base = latest.current.saved ?? { payload: '', fields: null }
    if (snap.payload !== base.payload) {
      await updateProgram(token, id, draftPayload(current, assign))
      commit({ ...base, payload: snap.payload })
    }
    if (snap.fields !== null && snap.fields !== latest.current.saved?.fields) {
      const stored = await saveApplicationForm(token, id, JSON.parse(snap.fields) as ApplicationFieldPayload[])
      commit({ payload: latest.current.saved?.payload ?? snap.payload, fields: adoptFieldIds(current.applicationFields, stored.fields) })
    }
    return 'saved'
  }

  const saveRef = useRef(saveOnce)
  useEffect(() => {
    saveRef.current = saveOnce
  })

  /** Saves now (or joins the save in flight). Resolves false when the server rejected the draft. */
  const flush = useCallback((): Promise<boolean> => {
    if (stopped.current) return Promise.resolve(true)
    if (running.current) {
      again.current = true
      return running.current
    }
    setPhase('saving')
    const task = (async () => {
      try {
        let result: 'saved' | 'skipped' = 'skipped'
        do {
          again.current = false
          result = (await saveRef.current()) === 'saved' ? 'saved' : result
        } while (again.current)
        setError(null)
        if (result === 'saved') setSavedAt(new Date())
        setPhase(latest.current.programId ? 'saved' : 'idle')
        return true
      } catch (err) {
        const { form: current, canAssignManagers: assign } = latest.current
        const snap = snapshotOf(current, assign)
        setError({ message: (err as Error).message, key: `${snap.payload}|${snap.fields ?? ''}` })
        setPhase('error')
        return false
      } finally {
        running.current = null
      }
    })()
    running.current = task
    return task
  }, [])

  // A rejected save waits for the next edit (which may fix it) instead of retrying the same payload in a loop.
  const changeKey = `${snapshot.payload}|${snapshot.fields ?? ''}`
  const blockedByError = phase === 'error' && error?.key === changeKey
  useEffect(() => {
    if (!enabled || !dirty || blockedByError) return
    const timer = window.setTimeout(() => void flush(), delayMs)
    return () => window.clearTimeout(timer)
  }, [changeKey, dirty, enabled, flush, delayMs, blockedByError])

  // Leaving the page (or backgrounding a phone browser) saves whatever is pending instead of waiting for the timer.
  const pending = enabled && (dirty || phase === 'saving')
  useEffect(() => {
    if (!enabled) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      void flush()
    }
  }, [enabled, flush])

  const status: AutosaveStatus = phase === 'saving' ? 'saving' : blockedByError ? 'error' : dirty ? 'waiting' : phase === 'error' ? 'idle' : phase

  return {
    status,
    error: blockedByError ? (error?.message ?? null) : null,
    savedAt,
    dirty,
    pending,
    /** Recruiting forms with an unfinished question are kept locally until the question is complete. */
    fieldsProblem,
    titleReady,
    flush,
    retry: () => void flush(),
    /** Stops all further saves, e.g. before the draft is deleted. */
    stop: () => {
      stopped.current = true
    },
  }
}
