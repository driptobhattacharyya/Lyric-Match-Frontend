import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'
import { LeaderboardSheet, type OwnEntry } from './components/LeaderboardSheet'
import { StatsSheet } from './components/StatsSheet'
import { Toast } from './components/Toast'
import { effectivePacks } from './game/packs'
import { dayKey } from './game/progression'
import { RULES } from './game/rules'
import { API_MODE, type ApiMode } from './game/types'
import { useGame } from './hooks/useGame'
import { useMeta } from './hooks/useMeta'
import { useSettings } from './hooks/useSettings'
import { useToast } from './hooks/useToast'
import { KEYS, readJson, writeJson } from './lib/storage'
import { sfx } from './lib/sound'
import { GameScreen } from './screens/GameScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { StartScreen } from './screens/StartScreen'
import { WarmingScreen } from './screens/WarmingScreen'

type Sheet = null | 'stats' | { kind: 'leaderboard'; mode: ApiMode }

function loadOwnEntry(): OwnEntry | null {
  const raw = readJson(KEYS.lastEntry) as Partial<OwnEntry> | null
  if (!raw || (raw.mode !== 'type' && raw.mode !== 'choice') || typeof raw.name !== 'string') return null
  if (typeof raw.score !== 'number' || typeof raw.rank !== 'number') return null
  return { mode: raw.mode, name: raw.name, score: raw.score, rank: raw.rank }
}

export function App() {
  const { state, actions } = useGame()
  const { settings, update } = useSettings()
  const { meta, status: metaStatus, reload: reloadMeta } = useMeta(state.server)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [own, setOwn] = useState<OwnEntry | null>(loadOwnEntry)
  const { toast, toastKey, show } = useToast()
  const today = dayKey(new Date())
  const { phase } = state

  const screen =
    phase === 'idle'
      ? 'start'
      : phase === 'results'
        ? 'results'
        : phase === 'warming' && state.results.length === 0 && !state.round
          ? 'warming'
          : 'game'

  // Each screen starts at the top (the previous one may have been scrolled).
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  const play = () => {
    sfx.start()
    actions.start(settings.difficulty, effectivePacks(settings.packs, meta), meta?.roundsPerGame ?? RULES.defaultRounds)
  }
  const openLeaderboard = (mode: ApiMode) => setSheet({ kind: 'leaderboard', mode })

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={screen}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {screen === 'start' && (
            <StartScreen
              profile={state.profile}
              today={today}
              server={state.server}
              pinging={state.request?.req.kind === 'health'}
              settings={settings}
              meta={meta}
              metaStatus={metaStatus}
              onSettings={update}
              onReloadMeta={reloadMeta}
              onStats={() => setSheet('stats')}
              onLeaderboard={meta?.leaderboard ? () => openLeaderboard(API_MODE[settings.difficulty]) : null}
              onPlay={play}
              onPing={actions.ping}
            />
          )}
          {screen === 'warming' && <WarmingScreen onCancel={actions.quit} />}
          {screen === 'game' && <GameScreen state={state} actions={actions} meta={meta} />}
          {screen === 'results' && (
            <ResultsScreen
              state={state}
              meta={meta}
              muted={settings.muted}
              playerName={settings.playerName}
              onToggleMute={() => update({ muted: !settings.muted })}
              onPlayAgain={play}
              onHome={actions.quit}
              onLeaderboard={() => openLeaderboard(API_MODE[state.config.difficulty])}
              onNameSaved={(playerName) => update({ playerName })}
              onSubmitted={(name, result) => {
                const entry: OwnEntry = { mode: API_MODE[state.config.difficulty], name, score: result.score, rank: result.rank }
                setOwn(entry)
                writeJson(KEYS.lastEntry, entry)
              }}
              toast={show}
            />
          )}
        </m.div>
      </AnimatePresence>

      <AnimatePresence>
        {sheet === 'stats' && <StatsSheet key="stats" profile={state.profile} today={today} onClose={() => setSheet(null)} />}
        {sheet !== null && sheet !== 'stats' && (
          <LeaderboardSheet key="leaderboard" initialMode={sheet.mode} own={own} onClose={() => setSheet(null)} />
        )}
      </AnimatePresence>

      <Toast message={toast} id={toastKey} />
    </>
  )
}
