import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

export default function PairSetupModal({ match, team, teamSide, onClose, onSaved }) {
  const existing = match[`${teamSide}Pairs`]
  const [pairs, setPairs] = useState(
    existing ?? [
      { player1: '', player2: '' },
      { player1: '', player2: '' },
      { player1: '', player2: '' }
    ]
  )
  const [errors, setErrors] = useState([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  const setPlayer = (gameIdx, slot, val) => {
    setPairs(prev => prev.map((p, i) => i === gameIdx ? { ...p, [slot]: val } : p))
    setErrors([])
  }

  // All players committed to OTHER games (not the current game being configured)
  const playersUsedElsewhere = (currentGameIdx) => {
    const used = new Set()
    pairs.forEach((p, i) => {
      if (i === currentGameIdx) return
      if (p.player1) used.add(p.player1)
      if (p.player2) used.add(p.player2)
    })
    return used
  }

  const validate = () => {
    const errs = []
    pairs.forEach((p, i) => {
      if (!p.player1) errs.push(`Game ${i + 1}: select Player 1`)
      if (!p.player2) errs.push(`Game ${i + 1}: select Player 2`)
      if (p.player1 && p.player2 && p.player1 === p.player2)
        errs.push(`Game ${i + 1}: both players must be different`)
    })
    return errs
  }

  const handleSubmit = () => {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setErrors([])
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    setShowConfirm(false)
    setSaving(true)
    try {
      await fetch(`/api/matches/${match.id}/pairs/${teamSide}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs })
      })
      onSaved()
      onClose()
    } catch {
      setErrors(['Failed to save pairs. Please try again.'])
    } finally {
      setSaving(false)
    }
  }

  const players = team?.players ?? []

  return (
    <>
      {showConfirm && (
        <ConfirmDialog
          title={`Confirm ${team?.name}'s Pairs?`}
          message="Once submitted, these pairings will be hidden until the other team also submits. Make sure you've confirmed with the team."
          confirmLabel="Yes, Submit Pairs"
          confirmClass="btn-primary"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center px-0 sm:px-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Player Pairs Entry</p>
              <h3 className="font-bold text-gray-900 text-lg">{team?.name}</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
              🔒 Each player can only play in <strong>one</strong> sub-match. Selected players are automatically removed from other game dropdowns.
            </div>

            {[0, 1, 2].map(i => {
              const usedElsewhere = playersUsedElsewhere(i)
              const otherSlot = { player1: 'player2', player2: 'player1' }

              return (
                <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Game {i + 1} — Doubles Pair
                  </p>
                  <div className="space-y-2">
                    {(['player1', 'player2']).map((slot, si) => (
                      <div key={slot} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-16 shrink-0">
                          {si === 0 ? 'Player 1' : 'Player 2'}
                        </span>
                        <select
                          value={pairs[i][slot]}
                          onChange={e => setPlayer(i, slot, e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">— Select player —</option>
                          {players.map(p => {
                            const sameGameOther = pairs[i][otherSlot[slot]]
                            const disabledSameGame = p.name === sameGameOther
                            const disabledOtherGame = usedElsewhere.has(p.name)
                            return (
                              <option
                                key={p.name}
                                value={p.name}
                                disabled={disabledSameGame || disabledOtherGame}
                              >
                                {p.name}
                                {disabledOtherGame ? ' (already in another game)' : ''}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    ))}
                  </div>
                  {pairs[i].player1 && pairs[i].player2 && pairs[i].player1 !== pairs[i].player2 && (
                    <p className="text-xs text-blue-700 font-medium mt-2">
                      ✓ {pairs[i].player1} & {pairs[i].player2}
                    </p>
                  )}
                </div>
              )
            })}

            {errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                {errors.map((e, i) => (
                  <p key={i} className="text-red-600 text-sm">• {e}</p>
                ))}
              </div>
            )}

            <div className="flex gap-3 pb-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSubmit} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Submit Pairs'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
