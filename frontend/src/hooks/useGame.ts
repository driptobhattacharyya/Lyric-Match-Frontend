import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { initialState, reducer, type Action, type State } from '../game/reducer'
import { dayKey, parseProfile } from '../game/progression'
import { API_MODE, type Difficulty, type HintKind } from '../game/types'
import * as api from '../lib/api'
import { KEYS, readJson, writeJson } from '../lib/storage'

function init(): State {
  return initialState(parseProfile(readJson(KEYS.profile)))
}

/**
 * Owns the game reducer and performs the async work it describes.
 * Every response is dispatched with the `seq` of the request that produced it;
 * the reducer drops anything stale. Effects abort their fetch on cleanup.
 */
export function useGame() {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  const { request, nextRound, difficulty, profile } = state

  // Blocking requests: health, hint, check, reveal.
  useEffect(() => {
    if (!request) return
    const ctrl = new AbortController()
    const { seq, req } = request
    const onFail = (err: unknown) => {
      if (ctrl.signal.aborted) return
      dispatch({ type: 'REQUEST_FAIL', seq, failure: api.toFailure(err) })
    }
    switch (req.kind) {
      case 'health':
        api.health(ctrl.signal).then(() => !ctrl.signal.aborted && dispatch({ type: 'HEALTH_OK', seq, at: Date.now() }), onFail)
        break
      case 'hint':
        api
          .requestHint(req.token, req.hint, req.level, ctrl.signal)
          .then((response) => !ctrl.signal.aborted && dispatch({ type: 'HINT_OK', seq, response, at: Date.now() }), onFail)
        break
      case 'check':
        api
          .checkGuess(req.token, req.guess, ctrl.signal)
          .then((response) => !ctrl.signal.aborted && dispatch({ type: 'CHECK_OK', seq, response, at: Date.now() }), onFail)
        break
      case 'reveal':
        api
          .revealAnswer(req.token, ctrl.signal)
          .then((res) => !ctrl.signal.aborted && dispatch({ type: 'REVEAL_OK', seq, answer: res.answer }), onFail)
        break
    }
    return () => ctrl.abort()
  }, [request])

  // Round fetches (current round or prefetch of the next one).
  useEffect(() => {
    if (!nextRound || nextRound.status !== 'pending') return
    const ctrl = new AbortController()
    const { seq, exclude } = nextRound
    api.createRound(API_MODE[difficulty], exclude, ctrl.signal).then(
      (data) => !ctrl.signal.aborted && dispatch({ type: 'ROUND_OK', seq, data, at: Date.now() }),
      (err: unknown) => !ctrl.signal.aborted && dispatch({ type: 'ROUND_FAIL', seq, failure: api.toFailure(err) }),
    )
    // Aborting after the fetch already resolved (pending -> ready) is a harmless no-op.
    return () => ctrl.abort()
  }, [nextRound, difficulty])

  useEffect(() => {
    writeJson(KEYS.profile, profile)
  }, [profile])

  const send = useCallback((a: Action) => dispatch(a), [])
  const actions = useMemo(
    () => ({
      start: (d: Difficulty) => send({ type: 'START', difficulty: d, at: Date.now() }),
      hint: (hint: HintKind) => send({ type: 'HINT', hint, at: Date.now() }),
      submit: (guess: string) => send({ type: 'SUBMIT', guess, at: Date.now() }),
      giveUp: () => send({ type: 'GIVE_UP', at: Date.now() }),
      timeUp: (roundId: number) => send({ type: 'TIME_UP', roundId, at: Date.now() }),
      next: () => send({ type: 'CONTINUE', at: Date.now(), today: dayKey(new Date()) }),
      retry: () => send({ type: 'RETRY', at: Date.now() }),
      quit: () => send({ type: 'QUIT' }),
      ping: () => send({ type: 'PING' }),
    }),
    [send],
  )

  return { state, actions }
}

export type GameActions = ReturnType<typeof useGame>['actions']
