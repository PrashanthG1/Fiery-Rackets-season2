import { useState, useEffect } from 'react'
import { useTournament } from '../context/TournamentContext'
import ConfirmDialog from './ConfirmDialog'
import PairSetupModal from './PairSetupModal'

function initGameState(games) {
  return games.map(g => ({
    team1Score: g.team1Score ?? '',
    team2Score: g.team2Score ?? '',
    saved: g.team1Score !== null && g.team2Score !== null
  }))
}

function getMatchResult(gameStates) {
  let t1 = 0, t2 = 0
  gameStates.forEach(g => {
    if (g.saved) {
      if (g.team1Score > g.team2Score) t1++
      else t2++
    }
  })
  return { team1Wins: t1, team2Wins: t2 }
}

export default function MatchCard({ match, team1, team2, matchNumber, isFinals = false }) {
  const { refresh } = useTournament()
  const [gameStates, setGameStates] = useState(() => initGameState(match.games))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dialog, setDialog] = useState(null)
  // dialog = { type: 'save'|'reset'|'finalize', gameIdx?, title, message }
  const [pairModal, setPairModal] = useState(null)
  // pairModal = { teamSide: 'team1'|'team2' }

  // Sync from server only for games that are saved on the backend.
  // Games not yet saved on the server keep their local input values untouched.
  useEffect(() => {
    setGameStates(prev => prev.map((localGame, i) => {
      const serverGame = match.games[i]
      const serverSaved = serverGame.team1Score !== null && serverGame.team2Score !== null
      if (serverSaved) {
        return { team1Score: serverGame.team1Score, team2Score: serverGame.team2Score, saved: true }
      }
      // Not saved on server — preserve whatever the user has typed
      return { ...localGame, saved: false }
    }))
  }, [match.id, match.completed, match.games.map(g => `${g.team1Score}-${g.team2Score}`).join('|')])

  const setScore = (gameIdx, field, val) => {
    const num = val === '' ? '' : parseInt(val)
    if (val !== '' && (isNaN(num) || num < 0 || num > 99)) return
    setGameStates(prev => prev.map((g, i) =>
      i === gameIdx ? { ...g, [field]: val === '' ? '' : num } : g
    ))
    setErr('')
  }

  const adjustScore = (gameIdx, field, delta) => {
    setGameStates(prev => prev.map((g, i) => {
      if (i !== gameIdx) return g
      const current = g[field] === '' ? 0 : g[field]
      return { ...g, [field]: Math.max(0, Math.min(99, current + delta)) }
    }))
    setErr('')
  }

  const validateGame = (gameIdx) => {
    const { team1Score, team2Score } = gameStates[gameIdx]
    if (team1Score === '' || team2Score === '') return 'Both scores are required'
    if (team1Score === team2Score) return 'Scores cannot be tied — there must be a winner'
    return null
  }

  // ── Save game ──
  const requestSave = (gameIdx) => {
    const validErr = validateGame(gameIdx)
    if (validErr) { setErr(`Game ${gameIdx + 1}: ${validErr}`); return }
    setErr('')
    const { team1Score, team2Score } = gameStates[gameIdx]
    setDialog({
      type: 'save', gameIdx,
      title: `Save Game ${gameIdx + 1}?`,
      message: `Confirm score — ${team1?.name}: ${team1Score}  vs  ${team2?.name}: ${team2Score}`
    })
  }

  const confirmSave = async () => {
    const { gameIdx } = dialog
    setDialog(null)
    setBusy(true)
    try {
      const { team1Score, team2Score } = gameStates[gameIdx]
      await fetch(`/api/matches/${match.id}/game/${gameIdx}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team1Score, team2Score })
      })
      setGameStates(prev => prev.map((g, i) => i === gameIdx ? { ...g, saved: true } : g))
      await refresh()
    } catch {
      setErr('Failed to save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── Reset game ──
  const requestReset = (gameIdx) => {
    setDialog({
      type: 'reset', gameIdx,
      title: `Reset Game ${gameIdx + 1}?`,
      message: `This will clear the saved score for Game ${gameIdx + 1} and reopen it for editing.${match.completed ? ' The match will also be un-finalized.' : ''}`
    })
  }

  const confirmReset = async () => {
    const { gameIdx } = dialog
    setDialog(null)
    setBusy(true)
    try {
      await fetch(`/api/matches/${match.id}/game/${gameIdx}`, { method: 'DELETE' })
      setGameStates(prev => prev.map((g, i) =>
        i === gameIdx ? { team1Score: '', team2Score: '', saved: false } : g
      ))
      await refresh()
    } catch {
      setErr('Failed to reset. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── Finalize match ──
  const requestFinalize = () => {
    const { team1Wins, team2Wins } = getMatchResult(gameStates)
    const winner = team1Wins > team2Wins ? team1?.name : team2?.name
    setDialog({
      type: 'finalize',
      title: 'Finalize Match Scores?',
      message: `Final result: ${team1?.name} ${team1Wins} – ${team2Wins} ${team2?.name}. Winner: ${winner}. Once finalized, scores count toward standings.`
    })
  }

  const confirmFinalize = async () => {
    setDialog(null)
    setBusy(true)
    try {
      await fetch(`/api/matches/${match.id}/finalize`, { method: 'POST' })
      await refresh()
    } catch {
      setErr('Failed to finalize. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = () => {
    if (dialog.type === 'save') confirmSave()
    else if (dialog.type === 'reset') confirmReset()
    else if (dialog.type === 'finalize') confirmFinalize()
    else if (dialog.type === 'resetPairs') confirmResetPairs()
  }

  // ── Reset pairs for one team ──
  const requestResetPairs = (teamSide) => {
    const teamName = teamSide === 'team1' ? team1?.name : team2?.name
    setDialog({
      type: 'resetPairs', teamSide,
      title: `Reset ${teamName}'s Pairs?`,
      message: `This will clear all 3 game pairings for ${teamName} so they can be re-entered.`
    })
  }

  const confirmResetPairs = async () => {
    const { teamSide } = dialog
    setDialog(null)
    setBusy(true)
    try {
      await fetch(`/api/matches/${match.id}/pairs/${teamSide}`, { method: 'DELETE' })
      await refresh()
    } catch {
      setErr('Failed to reset pairs.')
    } finally {
      setBusy(false)
    }
  }

  const allGamesSaved = gameStates.every(g => g.saved)
  const { team1Wins, team2Wins } = getMatchResult(gameStates)
  const savedCount = gameStates.filter(g => g.saved).length

  const t1Pairs = match.team1Pairs
  const t2Pairs = match.team2Pairs
  const bothPairsSet = t1Pairs && t2Pairs

  return (
    <>
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={
            dialog.type === 'save' ? 'Yes, Save' :
            dialog.type === 'reset' ? 'Yes, Reset' :
            dialog.type === 'finalize' ? 'Yes, Finalize' :
            'Yes, Reset Pairs'
          }
          confirmClass={dialog.type === 'reset' || dialog.type === 'resetPairs' ? 'btn-danger' : 'btn-primary'}
          onConfirm={handleConfirm}
          onCancel={() => setDialog(null)}
        />
      )}

      {pairModal && (
        <PairSetupModal
          match={match}
          team={pairModal.teamSide === 'team1' ? team1 : team2}
          teamSide={pairModal.teamSide}
          onClose={() => setPairModal(null)}
          onSaved={async () => { setPairModal(null); await refresh() }}
        />
      )}

      <div className={`card ${isFinals ? 'border-2 border-yellow-400' : ''} ${busy ? 'opacity-60 pointer-events-none' : ''}`}>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {isFinals ? '🥇 FINALS' : `Match ${matchNumber}`}
          </span>
          {match.completed ? (
            <span className="badge-done">✓ Finalized</span>
          ) : allGamesSaved ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Ready to Finalize
            </span>
          ) : (
            <span className="badge-pending">{savedCount}/3 saved</span>
          )}
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1 text-center">
            <p className={`font-bold text-base md:text-lg ${allGamesSaved && team1Wins > team2Wins ? 'text-blue-800' : 'text-gray-800'}`}>
              {team1?.name}
            </p>
            {allGamesSaved && <p className="text-2xl font-black text-blue-800">{team1Wins}</p>}
          </div>
          <div className="px-4">
            <span className="text-gray-400 font-bold text-lg">VS</span>
          </div>
          <div className="flex-1 text-center">
            <p className={`font-bold text-base md:text-lg ${allGamesSaved && team2Wins > team1Wins ? 'text-blue-800' : 'text-gray-800'}`}>
              {team2?.name}
            </p>
            {allGamesSaved && <p className="text-2xl font-black text-blue-800">{team2Wins}</p>}
          </div>
        </div>

        {/* Winner banner (only when finalized) */}
        {match.completed && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg py-1.5 px-3 text-center text-sm font-semibold text-blue-800 mb-3">
            🏆 {team1Wins > team2Wins ? team1?.name : team2?.name} wins {Math.max(team1Wins, team2Wins)}–{Math.min(team1Wins, team2Wins)}
          </div>
        )}

        {/* ── Player Pairs Section ── */}
        <div className="border border-gray-200 rounded-xl mb-4 overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 flex items-center justify-between border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🎯 Player Pairs</span>
            {bothPairsSet && <span className="text-xs text-green-600 font-medium">Both teams set ✓</span>}
          </div>

          <div className="grid grid-cols-2 divide-x divide-gray-200">
            {[
              { side: 'team1', team: team1, ownPairs: t1Pairs, otherPairs: t2Pairs },
              { side: 'team2', team: team2, ownPairs: t2Pairs, otherPairs: t1Pairs }
            ].map(({ side, team, ownPairs, otherPairs }) => (
              <div key={side} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700 truncate">{team?.name}</p>
                  {!match.completed && (
                    ownPairs ? (
                      <button
                        onClick={() => requestResetPairs(side)}
                        className="text-xs text-red-400 hover:text-red-600 ml-1 shrink-0"
                        title="Reset pairs"
                      >✕</button>
                    ) : (
                      <button
                        onClick={() => setPairModal({ teamSide: side })}
                        className="text-xs text-blue-700 hover:text-blue-900 font-medium ml-1 shrink-0"
                      >+ Enter</button>
                    )
                  )}
                </div>

                {!ownPairs ? (
                  /* Not submitted yet */
                  <button
                    onClick={() => setPairModal({ teamSide: side })}
                    className="w-full text-xs border-2 border-dashed border-gray-200 hover:border-blue-300 text-gray-400 hover:text-blue-700 rounded-lg py-3 transition-colors"
                  >
                    Tap to enter pairs
                  </button>
                ) : bothPairsSet ? (
                  /* Both submitted — reveal pairs */
                  <div className="space-y-1">
                    {ownPairs.map((p, i) => (
                      <div key={i} className="text-xs text-gray-600 bg-white border border-gray-100 rounded px-2 py-1">
                        <span className="text-gray-400">G{i + 1}: </span>
                        <span className="font-medium">{p.player1} & {p.player2}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* This team submitted but other team hasn't — hide names */
                  <div className="space-y-1">
                    {ownPairs.map((_, i) => (
                      <div key={i} className="text-xs bg-gray-100 border border-gray-200 rounded px-2 py-1 flex items-center gap-1">
                        <span className="text-gray-400">G{i + 1}: </span>
                        <span className="text-gray-400">🔒 Locked — waiting for {otherPairs ? '' : 'other team'}</span>
                      </div>
                    ))}
                    <p className="text-xs text-amber-600 font-medium mt-1">
                      ✓ Submitted · hidden until both teams lock in
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Game Scoring ── */}
        {/* Column headers */}
        <div className="grid grid-cols-3 text-xs text-gray-400 font-medium text-center px-1 mb-1">
          <span className="text-left truncate">{team1?.name?.split(' ')[0]}</span>
          <span>Score</span>
          <span className="text-right truncate">{team2?.name?.split(' ')[0]}</span>
        </div>

        <div className="space-y-2">
          {gameStates.map((game, i) => {
            const t1pair = t1Pairs?.[i]
            const t2pair = t2Pairs?.[i]
            return (
              <div key={i} className={`rounded-lg border transition-colors ${
                game.saved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
              }`}>
                {/* Pair names row (shown when both pairs set) */}
                {bothPairsSet && (
                  <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-dashed border-gray-200">
                    <span className="text-xs text-blue-800 font-medium truncate max-w-[38%]">
                      {t1pair?.player1} & {t1pair?.player2}
                    </span>
                    <span className="text-xs text-gray-300 mx-1">vs</span>
                    <span className="text-xs text-blue-800 font-medium truncate max-w-[38%] text-right">
                      {t2pair?.player1} & {t2pair?.player2}
                    </span>
                  </div>
                )}

                {/* Score row */}
                <div className="flex items-center gap-2 px-3 py-2">
                  {game.saved ? (
                    <>
                      <div className={`w-14 text-center text-xl font-black ${game.team1Score > game.team2Score ? 'text-blue-800' : 'text-gray-400'}`}>
                        {game.team1Score}
                      </div>
                      <div className="flex-1 text-center">
                        <span className="text-xs font-medium text-gray-500">Game {i + 1}</span>
                        <span className="ml-1 text-green-500 text-xs">✓</span>
                      </div>
                      <div className={`w-14 text-center text-xl font-black ${game.team2Score > game.team1Score ? 'text-blue-800' : 'text-gray-400'}`}>
                        {game.team2Score}
                      </div>
                    </>
                  ) : !bothPairsSet ? (
                    <div className="flex-1 text-center py-2">
                      <span className="text-xs text-amber-600 font-medium">🔒 Lock both teams' pairs to enter scores</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => adjustScore(i, 'team1Score', -1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-red-100 text-gray-600 hover:text-red-600 font-bold text-base transition-colors">−</button>
                        <input
                          type="number" min="0" max="99"
                          className="score-input"
                          placeholder="0"
                          value={game.team1Score}
                          onChange={e => setScore(i, 'team1Score', e.target.value)}
                        />
                        <button type="button" onClick={() => adjustScore(i, 'team1Score', 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-green-100 text-gray-600 hover:text-green-600 font-bold text-base transition-colors">+</button>
                      </div>
                      <div className="flex-1 text-center text-xs font-medium text-gray-500 shrink-0">
                        Game {i + 1}
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => adjustScore(i, 'team2Score', -1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-red-100 text-gray-600 hover:text-red-600 font-bold text-base transition-colors">−</button>
                        <input
                          type="number" min="0" max="99"
                          className="score-input"
                          placeholder="0"
                          value={game.team2Score}
                          onChange={e => setScore(i, 'team2Score', e.target.value)}
                        />
                        <button type="button" onClick={() => adjustScore(i, 'team2Score', 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-green-100 text-gray-600 hover:text-green-600 font-bold text-base transition-colors">+</button>
                      </div>
                    </>
                  )}
                </div>

                {/* Per-game action */}
                <div className="px-3 pb-2 flex justify-end">
                  {game.saved ? (
                    <button
                      onClick={() => requestReset(i)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium border border-red-200 hover:border-red-400 rounded px-2 py-0.5 transition-colors"
                    >
                      Reset Game {i + 1}
                    </button>
                  ) : bothPairsSet ? (
                    <button
                      onClick={() => requestSave(i)}
                      className="text-xs text-blue-800 hover:text-blue-900 font-medium border border-blue-200 hover:border-blue-500 bg-white rounded px-2 py-0.5 transition-colors"
                    >
                      Save Game {i + 1}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {/* Error */}
        {err && <p className="text-red-500 text-xs mt-2">{err}</p>}

        {/* Finalize button */}
        {allGamesSaved && !match.completed && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2 text-center">
              All 3 games saved. Review scores above, then finalize to lock in results.
            </p>
            <button onClick={requestFinalize} className="btn-primary w-full py-2.5">
              ✅ Finalize Match Scores
            </button>
          </div>
        )}
      </div>
    </>
  )
}
