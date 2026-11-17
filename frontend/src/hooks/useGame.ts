import { useEffect, useMemo, useReducer } from 'react'
import { initialState, reducer, type State } from '../game/reducer'
import { dayKey, parseProfile } from '../game/progression'
import type { Difficulty, HintKind } from '../game/types'
import * as api from '../lib/api'
import { KEYS, readJson, writeJson } from '../lib/storage'

function init(): State {
  return initialState(parseProfile(readJson(KEYS.profile)))
}

/**
 * Owns the game reducer and performs the one request it describes at a time.
 * Every response is dispatched with the `seq` of the request that produced it;
 * the reducer drops anything stale. The effect aborts its fetch on cleanup.
 */
export function useGame() {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  const { request, profile } = state

  useEffect(() => {
    if (!request) return
    const ctrl = new AbortController()
    const { signal } = ctrl
    const { seq, req } = request
    const onFail = (err: unknown) => {
      if (!signal.aborted) dispatch({ type: 'REQUEST_FAIL', seq, failure: api.toFailure(err) })
    }
    switch (req.kind) {
      case 'health':
        api.health(signal).then(() => !signal.aborted && dispatch({ type: 'HEALTH_OK', seq }), onFail)
        break
      case 'round':
        api
          .createRound(req.mode, req.packs, req.exclude, signal)
          .then((data) => !signal.aborted && dispatch({ type: 'ROUND_OK', seq, data, at: Date.now() }), onFail)
        break
      case 'hint':
        api
          .requestHint(req.token, req.hint, req.level, signal)
          .then((response) => !signal.aborted && dispatch({ type: 'HINT_OK', seq, response, at: Date.now() }), onFail)
        break
      case 'check':
        api
          .checkGuess(req.token, req.guess, signal)
          .then((response) => !signal.aborted && dispatch({ type: 'CHECK_OK', seq, response, at: Date.now() }), onFail)
        break
      case 'reveal':
        api.revealAnswer(req.token, signal).then((response) => !signal.aborted && dispatch({ type: 'REVEAL_OK', seq, response }), onFail)
        break
    }
    return () => ctrl.abort()
  }, [request])

  useEffect(() => {
    writeJson(KEYS.profile, profile)
  }, [profile])

  const actions = useMemo(
    () => ({
      start: (difficulty: Difficulty, packs: string[], totalRounds: number) =>
        dispatch({ type: 'START', difficulty, packs, totalRounds, at: Date.now() }),
      hint: (hint: HintKind) => dispatch({ type: 'HINT', hint, at: Date.now() }),
      submit: (guess: string) => dispatch({ type: 'SUBMIT', guess, at: Date.now() }),
      skip: () => dispatch({ type: 'SKIP', at: Date.now() }),
      timeUp: (roundId: number) => dispatch({ type: 'TIME_UP', roundId, at: Date.now() }),
      next: () => dispatch({ type: 'CONTINUE', today: dayKey(new Date()) }),
      retry: () => dispatch({ type: 'RETRY' }),
      quit: () => dispatch({ type: 'QUIT' }),
      ping: () => dispatch({ type: 'PING' }),
    }),
    [],
  )

  return { state, actions }
}

export type GameActions = ReturnType<typeof useGame>['actions']
