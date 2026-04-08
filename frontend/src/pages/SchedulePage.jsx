import { useNavigate } from 'react-router-dom'
import { useTournament } from '../context/TournamentContext'
import MatchCard from '../components/MatchCard'

export default function SchedulePage() {
  const { tournament, refresh, loading } = useTournament()
  const navigate = useNavigate()

  if (loading) return <LoadingSpinner />

  if (!tournament || tournament.phase === 'setup') {
    return (
      <div className="card text-center py-10">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-gray-500">No tournament set up yet.</p>
        <button onClick={() => navigate('/setup')} className="btn-primary mt-4">
          Go to Setup
        </button>
      </div>
    )
  }

  const rrMatches = tournament.matches.filter(m => m.type === 'round-robin')
  const completed = rrMatches.filter(m => m.completed)
  const allDone = completed.length === rrMatches.length

  const getTeam = (id) => tournament.teams.find(t => t.id === id)

  // Group by round number
  const roundGroups = {}
  rrMatches.forEach(match => {
    const r = match.round ?? 1
    if (!roundGroups[r]) roundGroups[r] = []
    roundGroups[r].push(match)
  })
  const sortedRounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b)

  const handleStartFinals = async () => {
    await fetch('/api/tournament/start-finals', { method: 'POST' })
    await refresh()
    navigate('/finals')
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="card py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Round Robin Progress</span>
          <span className="text-sm font-bold text-blue-800">{completed.length} / {rrMatches.length}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-700 h-2.5 rounded-full transition-all duration-500"
            style={{ width: rrMatches.length ? `${(completed.length / rrMatches.length) * 100}%` : '0%' }}
          />
        </div>
        {allDone && tournament.phase === 'round-robin' && (
          <div className="mt-3 text-center">
            <p className="text-sm text-blue-800 font-semibold mb-2">🎉 All round-robin matches complete!</p>
            <button onClick={handleStartFinals} className="btn-primary w-full">
              🏆 Proceed to Finals
            </button>
          </div>
        )}
        {(tournament.phase === 'finals' || tournament.phase === 'completed') && (
          <div className="mt-3 text-center">
            <button onClick={() => navigate('/finals')} className="btn-primary w-full">
              🥇 View Finals
            </button>
          </div>
        )}
      </div>

      {/* Rounds */}
      {sortedRounds.map(roundNum => {
        const roundMatches = roundGroups[roundNum]
        const roundDone = roundMatches.every(m => m.completed)
        const roundStarted = roundMatches.some(m => m.completed)

        return (
          <section key={roundNum}>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-base font-bold text-gray-700">Round {roundNum}</h2>
              {roundDone ? (
                <span className="badge-done">✓ Complete</span>
              ) : roundStarted ? (
                <span className="badge-pending">In Progress</span>
              ) : null}
            </div>
            <div className="space-y-3">
              {roundMatches.map((match, i) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  team1={getTeam(match.team1Id)}
                  team2={getTeam(match.team2Id)}
                  matchNumber={i + 1}
                  round={roundNum}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
