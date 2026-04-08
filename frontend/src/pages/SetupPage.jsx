import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTournament } from '../context/TournamentContext'
import ConfirmDialog from '../components/ConfirmDialog'

const NUM_TEAMS = 6
const PLAYERS_PER_TEAM = 6

const PREFILLED_TEAMS = [
  {
    name: 'Banana Boys',
    players: [
      { name: 'Subash' },
      { name: 'Mohan' },
      { name: 'Naveen B' },
      { name: 'Satya' },
      { name: 'Sai Teja Goud Pirangi' },
      { name: 'Satyabhargav Puli' },
    ]
  },
  {
    name: 'Juggernauts',
    players: [
      { name: 'Prashanth' },
      { name: 'Tulasi Chittiraju' },
      { name: 'Karthik Lucky' },
      { name: 'Venkata Prasanth' },
      { name: 'Tri Nguyen' },
      { name: 'N. Sai Kumar Nandipati' },
    ]
  },
  {
    name: 'Titans',
    players: [
      { name: 'Surya' },
      { name: 'Sai Teja' },
      { name: 'Yugadeep Bandaru' },
      { name: 'Kavish Tankariya' },
      { name: 'Adi Narayana Manga' },
      { name: 'Karthik Vadde' },
    ]
  },
  {
    name: 'Mavericks',
    players: [
      { name: 'Ankur' },
      { name: 'Mahendra' },
      { name: 'Wei Jia' },
      { name: 'Nishit Grover' },
      { name: 'Varad Parte' },
      { name: 'Ashish Jaiswal' },
    ]
  },
  {
    name: 'Bengal Tigers',
    players: [
      { name: 'Kalyan' },
      { name: 'Rudra Pandya' },
      { name: 'Jackson Pitz' },
      { name: 'Sanath' },
      { name: 'Rizvi Shaik' },
      { name: 'Bhanu Prasad Vakkapatla' },
    ]
  },
  {
    name: 'Iron Clads',
    players: [
      { name: 'Jashwanth' },
      { name: 'Ganesh' },
      { name: 'Tarun Niluroutu' },
      { name: 'Rajeev Tripathi' },
      { name: 'Surya Pakanati' },
      { name: 'Prajwal' },
    ]
  },
]

function defaultTeams() {
  return PREFILLED_TEAMS.map(t => ({
    name: t.name,
    players: t.players.map(p => ({ name: p.name }))
  }))
}

export default function SetupPage() {
  const { tournament, refresh } = useTournament()
  const navigate = useNavigate()
  const [teams, setTeams] = useState(defaultTeams)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState([])

  const isActive = tournament?.phase && tournament.phase !== 'setup'
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetCodeError, setResetCodeError] = useState('')

  const setTeamName = (ti, val) => {
    setTeams(prev => prev.map((t, i) => i === ti ? { ...t, name: val } : t))
  }

  const setPlayerName = (ti, pi, val) => {
    setTeams(prev => prev.map((t, i) => i === ti
      ? { ...t, players: t.players.map((p, j) => j === pi ? { name: val } : p) }
      : t
    ))
  }

  const validate = () => {
    const errs = []
    teams.forEach((team, ti) => {
      if (!team.name.trim()) errs.push(`Team ${ti + 1}: name is required`)
      team.players.forEach((player, pi) => {
        if (!player.name.trim()) errs.push(`Team ${ti + 1}, Player ${pi + 1}: name is required`)
      })
    })
    const teamNames = teams.map(t => t.name.trim().toLowerCase()).filter(Boolean)
    if (new Set(teamNames).size !== teamNames.length) errs.push('Team names must be unique')
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)
    try {
      const payload = teams.map(t => ({
        name: t.name.trim(),
        players: t.players.map(p => ({ name: p.name.trim() }))
      }))
      await fetch('/api/tournament/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams: payload, matchFormat: { singles: 0, doubles: 3 } })
      })
      await refresh()
      navigate('/schedule')
    } catch {
      setErrors(['Failed to start tournament. Is the backend running?'])
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetAttempt = () => {
    if (resetCode !== 'greatvalue') {
      setResetCodeError('Incorrect code. Please try again.')
      return
    }
    setResetCodeError('')
    setShowResetConfirm(false)
    handleReset()
  }

  const handleReset = async () => {
    await fetch('/api/tournament/reset', { method: 'POST' })
    await refresh()
    setTeams(defaultTeams())
    setResetCode('')
  }

  if (isActive) {
    return (
      <div className="space-y-4">
        {showResetConfirm && (
          <ConfirmDialog
            title="Reset Tournament?"
            message="All match scores, player pairs, and progress will be permanently lost. This cannot be undone."
            confirmLabel="Yes, Reset Everything"
            confirmClass="btn-danger"
            onConfirm={handleResetAttempt}
            onCancel={() => { setShowResetConfirm(false); setResetCode(''); setResetCodeError('') }}
            extraContent={
              <div className="mt-3">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Enter reset code to confirm</label>
                <input
                  type="text"
                  value={resetCode}
                  onChange={e => { setResetCode(e.target.value); setResetCodeError('') }}
                  placeholder="Enter code…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  autoFocus
                />
                {resetCodeError && <p className="text-red-600 text-xs mt-1">{resetCodeError}</p>}
              </div>
            }
          />
        )}
        <div className="card text-center py-8">
          <div className="text-5xl mb-3">🏸</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Tournament in Progress</h2>
          <p className="text-gray-500 mb-6 text-sm">
            Phase: <span className="font-semibold capitalize text-blue-800">{tournament.phase.replace('-', ' ')}</span>
          </p>
          <div className="space-y-2 text-left max-w-xs mx-auto mb-6">
            {tournament.teams.map((team, i) => (
              <div key={team.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                <span className="w-6 h-6 rounded-xl bg-blue-800 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <div>
                  <p className="font-semibold text-sm">{team.name}</p>
                  <p className="text-xs text-gray-400">{team.players.map(p => p.name).join(', ')}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowResetConfirm(true)} className="btn-danger">
            Reset Tournament
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center py-4">
        <div className="text-5xl mb-2">🏸</div>
        <h1 className="text-2xl font-bold text-gray-900">Setup Tournament</h1>
        <p className="text-gray-500 text-sm mt-1">{NUM_TEAMS} teams · {PLAYERS_PER_TEAM} players each</p>
      </div>

      {/* Team forms */}
      {teams.map((team, ti) => (
        <div key={ti} className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-blue-800 text-white font-bold text-sm flex items-center justify-center">
              {ti + 1}
            </div>
            <input
              type="text"
              placeholder={`Team ${ti + 1} Name`}
              value={team.name}
              onChange={e => setTeamName(ti, e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {team.players.map((player, pi) => (
              <input
                key={pi}
                type="text"
                placeholder={pi === 0 ? 'Captain' : `Player ${pi + 1}`}
                value={player.name}
                onChange={e => setPlayerName(ti, pi, e.target.value)}
                className={`border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  pi === 0 ? 'border-blue-300 bg-blue-50 font-semibold' : 'border-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-700 text-sm font-semibold mb-1">Please fix the following:</p>
          <ul className="text-red-600 text-sm space-y-0.5">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn-primary w-full py-3 text-base"
      >
        {submitting ? 'Starting Tournament…' : '🚀 Start Tournament'}
      </button>
    </div>
  )
}
