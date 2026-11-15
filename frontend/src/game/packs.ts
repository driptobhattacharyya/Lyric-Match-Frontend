import type { Language, Meta } from './types'

/** Pure helpers for the song-pack picker. An empty selection means "All packs". */

export function allPackIds(meta: Meta | null): string[] {
  return meta ? meta.languages.flatMap((l) => l.packs.map((p) => p.id)) : []
}

/**
 * Pack ids to send to POST /api/rounds: unknown ids are dropped (the server
 * rejects them) and a selection covering every pack collapses to `[]`.
 * Without meta the stored selection is passed through unchanged.
 */
export function effectivePacks(selected: readonly string[], meta: Meta | null): string[] {
  if (!meta) return [...selected]
  const known = new Set(allPackIds(meta))
  const kept = [...new Set(selected)].filter((id) => known.has(id))
  return kept.length === known.size ? [] : kept
}

export function togglePack(selected: readonly string[], id: string, meta: Meta | null): string[] {
  const current = effectivePacks(selected, meta)
  const next = current.includes(id) ? current.filter((p) => p !== id) : [...current, id]
  return effectivePacks(next, meta)
}

/** Select or clear every pack of one language. */
export function toggleLanguage(selected: readonly string[], lang: Language, meta: Meta | null): string[] {
  const current = effectivePacks(selected, meta)
  const ids = lang.packs.map((p) => p.id)
  const allOn = ids.every((id) => current.includes(id))
  const next = allOn ? current.filter((p) => !ids.includes(p)) : [...new Set([...current, ...ids])]
  return effectivePacks(next, meta)
}

export function languageState(selected: readonly string[], lang: Language): 'all' | 'some' | 'none' {
  if (selected.length === 0) return 'all'
  const on = lang.packs.filter((p) => selected.includes(p.id)).length
  return on === 0 ? 'none' : on === lang.packs.length ? 'all' : 'some'
}

/** Number of songs a selection draws from. */
export function songCount(selected: readonly string[], meta: Meta | null): number {
  if (!meta) return 0
  const eff = effectivePacks(selected, meta)
  return meta.languages
    .flatMap((l) => l.packs)
    .filter((p) => eff.length === 0 || eff.includes(p.id))
    .reduce((n, p) => n + p.count, 0)
}

export function packName(meta: Meta | null, id: string): string | null {
  for (const l of meta?.languages ?? []) {
    const p = l.packs.find((x) => x.id === id)
    if (p) return p.name
  }
  return null
}
