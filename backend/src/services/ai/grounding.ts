/**
 * Grounding rules shared by every AI feature: each generated claim must cite source refs that
 * were actually sent to the model, and every number it states must appear in those sources.
 */

export type SourceKind = 'project' | 'evidence' | 'activity' | 'task' | 'link' | 'fact' | 'program' | 'profile'

export type Source = {
  ref: string
  kind: SourceKind
  label: string
  text: string
  /** True only for institution-approved evidence (trusted verified records). */
  verified: boolean
  projectId?: string
  url?: string
}

export type SourceSet = Map<string, Source>

export type GroundingIssue = {
  path: string
  text: string
  reason: 'no_source' | 'unknown_source' | 'unsupported_number' | 'empty'
  detail?: string
}

export type Claim = { text: string; sourceRefs: string[] }
export type GroundedClaim = { text: string; sourceRefs: string[]; verified: boolean }

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g

export function numbersIn(text: string) {
  return (text.match(NUMBER_PATTERN) ?? [])
    .map((token) => Number.parseFloat(token.replace(/,/g, '')))
    .filter((value) => Number.isFinite(value))
}

export function numberSet(texts: string[]) {
  return new Set(texts.flatMap(numbersIn))
}

export function sourceSet(sources: Source[]): SourceSet {
  return new Map(sources.map((source) => [source.ref, source]))
}

/** Compact, model-facing view of the sources (ids are opaque refs, never database ids). */
export function sourcesForPrompt(sources: SourceSet) {
  return [...sources.values()].map((source) => ({
    ref: source.ref,
    kind: source.kind,
    label: source.label,
    text: source.text,
    verified: source.verified,
  }))
}

function unsupportedNumbers(text: string, allowed: Set<number>) {
  return numbersIn(text).filter((value) => !allowed.has(value))
}

export function groundClaims(
  claims: Claim[],
  sources: SourceSet,
  path: string,
  options: { globalNumbers?: Set<number> } = {},
) {
  const kept: GroundedClaim[] = []
  const issues: GroundingIssue[] = []
  claims.forEach((claim, index) => {
    const text = claim.text.trim()
    const at = `${path}[${index}]`
    if (!text) {
      issues.push({ path: at, text, reason: 'empty' })
      return
    }
    const refs = [...new Set(claim.sourceRefs)].filter((ref) => sources.has(ref))
    if (claim.sourceRefs.length > 0 && refs.length < claim.sourceRefs.length) {
      const unknown = claim.sourceRefs.filter((ref) => !sources.has(ref))
      issues.push({ path: at, text, reason: 'unknown_source', detail: unknown.join(', ') })
    }
    if (refs.length === 0) {
      issues.push({ path: at, text, reason: 'no_source' })
      return
    }
    const allowed = numberSet(refs.map((ref) => `${sources.get(ref)!.label} ${sources.get(ref)!.text}`))
    for (const value of options.globalNumbers ?? []) allowed.add(value)
    const unsupported = unsupportedNumbers(text, allowed)
    if (unsupported.length > 0) {
      issues.push({ path: at, text, reason: 'unsupported_number', detail: unsupported.join(', ') })
      return
    }
    kept.push({ text, sourceRefs: refs, verified: refs.some((ref) => sources.get(ref)!.verified) })
  })
  return { kept, issues }
}

/** Free-form paragraphs have no refs, so any number must exist somewhere in the provided data. */
export function checkFreeText(text: string, path: string, allowed: Set<number>): GroundingIssue | null {
  const unsupported = unsupportedNumbers(text, allowed)
  return unsupported.length ? { path, text, reason: 'unsupported_number', detail: unsupported.join(', ') } : null
}

export function truncate(text: string | null | undefined, max: number) {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** Strips direct identifiers before any text is sent to an external model. */
export function scrubPii(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[이메일]')
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[전화번호]')
    .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[주민번호]')
}
