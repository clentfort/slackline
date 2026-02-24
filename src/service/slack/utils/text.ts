export function normalize(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim()
}

export function parseUnixSeconds(value: string | null | undefined): number | undefined {
  const numeric = Number.parseFloat((value ?? '').trim())
  return Number.isFinite(numeric) ? numeric : undefined
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
