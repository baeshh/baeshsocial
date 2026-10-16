export const splitTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

export const emptyToNull = (value: string) => value.trim() || null
