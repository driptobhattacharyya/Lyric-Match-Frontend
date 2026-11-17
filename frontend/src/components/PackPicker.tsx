import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import { effectivePacks, languageState, songCount, toggleLanguage, togglePack } from '../game/packs'
import type { Meta } from '../game/types'
import type { MetaStatus } from '../hooks/useMeta'
import { Icon } from './Icon'

interface Props {
  meta: Meta | null
  status: MetaStatus
  selected: string[]
  onChange: (packs: string[]) => void
  onReload: () => void
}

/** Language tabs + multi-select pack chips. An empty selection means "All packs". */
export function PackPicker({ meta, status, selected, onChange, onReload }: Props) {
  const sel = effectivePacks(selected, meta)
  const languages = meta?.languages ?? []
  const firstWithSelection = languages.find((l) => l.packs.some((p) => sel.includes(p.id)))?.id
  const [tab, setTab] = useState<string | null>(null)
  const activeId = tab ?? firstWithSelection ?? languages[0]?.id
  const active = languages.find((l) => l.id === activeId) ?? languages[0]
  const all = sel.length === 0
  const songs = songCount(sel, meta)

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="packs-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="packs-title" className="flex items-center gap-2 font-display text-lg font-bold">
          <Icon name="disc" size={20} className="text-grape" /> Song packs
        </h2>
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={all}
          className={`chip ${all ? 'chip-on' : ''}`}
          disabled={!meta}
        >
          {all && <Icon name="check" size={16} strokeWidth={3} />} All packs
        </button>
      </div>

      {!meta ? (
        <div className="space-y-3" role="status" aria-live="polite">
          <div className="flex gap-2" aria-hidden="true">
            <div className="skeleton h-11 w-24 rounded-full" />
            <div className="skeleton h-11 w-24 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-2" aria-hidden="true">
            <div className="skeleton h-11 w-36 rounded-full" />
            <div className="skeleton h-11 w-28 rounded-full" />
            <div className="skeleton h-11 w-32 rounded-full" />
          </div>
          <p className="text-sm text-mist">
            {status === 'error' ? (
              <>
                Couldn’t load the packs. You can still play with all songs.{' '}
                <button type="button" onClick={onReload} className="min-h-11 cursor-pointer font-semibold text-cloud underline underline-offset-4">
                  Try again
                </button>
              </>
            ) : (
              'Loading packs… you can play with all songs right away.'
            )}
          </p>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Language" className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {languages.map((l) => {
              const on = l.id === active?.id
              const state = languageState(sel, l)
              return (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  id={`tab-${l.id}`}
                  aria-selected={on}
                  aria-controls="pack-panel"
                  onClick={() => setTab(l.id)}
                  className={`relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 font-display font-semibold transition ${
                    on ? 'bg-cloud text-ink' : 'bg-plum text-mist hover:text-cloud'
                  }`}
                >
                  <Icon name="globe" size={18} /> {l.name}
                  {!all && state !== 'none' && (
                    <>
                      <span className={`size-2 rounded-full ${on ? 'bg-pop' : 'bg-aqua'}`} aria-hidden="true" />
                      <span className="sr-only">(has selected packs)</span>
                    </>
                  )}
                </button>
              )
            })}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {active && (
              <m.div
                key={active.id}
                id="pack-panel"
                role="tabpanel"
                aria-labelledby={`tab-${active.id}`}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
                className="flex flex-wrap gap-2"
              >
                {active.packs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange(toggleLanguage(sel, active, meta))}
                    aria-pressed={!all && languageState(sel, active) === 'all'}
                    className={`chip ${!all && languageState(sel, active) === 'all' ? 'chip-on' : ''}`}
                  >
                    {!all && languageState(sel, active) === 'all' && <Icon name="check" size={16} strokeWidth={3} />}
                    All {active.name}
                    <span className="chip-count">{active.packs.reduce((n, p) => n + p.count, 0)}</span>
                  </button>
                )}
                {active.packs.map((p) => {
                  const on = sel.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onChange(togglePack(sel, p.id, meta))}
                      aria-pressed={on}
                      className={`chip ${on ? 'chip-on' : ''}`}
                    >
                      {on && <Icon name="check" size={16} strokeWidth={3} />}
                      {p.name}
                      <span className="chip-count">{p.count}</span>
                    </button>
                  )
                })}
              </m.div>
            )}
          </AnimatePresence>

          <p className="mt-3 text-sm text-mist" aria-live="polite">
            {all ? `Every pack · ${songs.toLocaleString('en-US')} songs` : `${sel.length} ${sel.length === 1 ? 'pack' : 'packs'} · ${songs.toLocaleString('en-US')} songs`}
          </p>
        </>
      )}
    </section>
  )
}
