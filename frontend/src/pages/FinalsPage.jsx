import { useNavigate } from 'react-router-dom'
import { useTournament } from '../context/TournamentContext'
import MatchCard from '../components/MatchCard'

export default function FinalsPage() {
  const { tournament, standings, loading, refresh } = useTournament()
  const navigate = useNavigate()

  if (loading) return <LoadingSpinner />

  if (!tournament || tournament.phase === 'setup' || tournament.phase === 'round-robin') {
    return (
      <div className="card text-center py-10">
        <p className="text-4xl mb-3">🥇</p>
        <p className="text-gray-500 mb-2">Finals haven't started yet.</p>
        <p className="text-xs text-gray-400">Complete all round-robin matches first.</p>
        <button onClick={() => navigate('/schedule')} className="btn-primary mt-4">
          Go to Schedule
        </button>
      </div>
    )
  }

  const finalsMatch = tournament.matches.find(m => m.type === 'finals')
  const getTeam = (id) => tournament.teams.find(t => t.id === id)

  const team1 = finalsMatch ? getTeam(finalsMatch.team1Id) : null
  const team2 = finalsMatch ? getTeam(finalsMatch.team2Id) : null

  // Calculate finalist seedings
  const top2 = standings.slice(0, 2)

  const handleComplete = async () => {
    await fetch('/api/tournament/complete', { method: 'POST' })
    await refresh()
  }

  const getWinner = () => {
    if (!finalsMatch?.completed) return null
    let t1 = 0, t2 = 0
    finalsMatch.games.forEach(g => {
      if (g.team1Score !== null && g.team2Score !== null) {
        if (g.team1Score > g.team2Score) t1++
        else t2++
      }
    })
    return t1 > t2 ? team1 : team2
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card text-center py-5 bg-gradient-to-br from-yellow-50 to-blue-50 border-yellow-200">
        <div className="text-4xl mb-2">🏆</div>
        <h1 className="text-2xl font-black text-gray-900">Finals</h1>
        <p className="text-sm text-gray-500 mt-1">The top 2 teams battle for the championship</p>
      </div>

      {/* Finalist info */}
      <div className="grid grid-cols-2 gap-3">
        {top2.map((team, i) => {
          const standing = standings.find(s => s.id === team.id)
          return (
            <div key={team.id} className={`card text-center border-2 ${i === 0 ? 'border-yellow-400' : 'border-gray-300'}`}>
              <div className="text-xl mb-1">{i === 0 ? '🥇 Seed 1' : '🥈 Seed 2'}</div>
              <p className="font-bold text-sm">{team.name}</p>
              <p className="text-xs text-gray-500 mt-1">{standing?.wins ?? 0}W – {standing?.losses ?? 0}L</p>
              <p className={`text-xs font-semibold ${(standing?.pointDiff ?? 0) >= 0 ? 'text-blue-700' : 'text-red-500'}`}>
                {(standing?.pointDiff ?? 0) > 0 ? '+' : ''}{standing?.pointDiff ?? 0} pt diff
              </p>
            </div>
          )
        })}
      </div>

      {/* Finals match */}
      {finalsMatch && (
        <MatchCard
          match={finalsMatch}
          team1={team1}
          team2={team2}
          isFinals={true}
        />
      )}

      {/* Declare winner button */}
      {finalsMatch?.completed && tournament.phase === 'finals' && (
        <button onClick={handleComplete} className="btn-primary w-full py-3 text-base">
          🏆 Declare Champion
        </button>
      )}

      {/* Champion announcement */}
      {tournament.phase === 'completed' && tournament.winner && (
        <ChampionBanner winner={tournament.winner} />
      )}

      {/* Round Robin summary */}
      <div className="card">
        <h3 className="font-semibold text-sm text-gray-700 mb-3">Round Robin Final Standings</h3>
        <div className="space-y-2">
          {standings.map((team, idx) => (
            <div key={team.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${idx < 2 ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <span className="text-sm font-bold w-5 text-center text-gray-500">{idx + 1}</span>
              <div className="flex-1">
                <p className="font-semibold text-sm">{team.name}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-sm text-blue-800">{team.wins}W</p>
                <p className={`text-xs ${team.pointDiff >= 0 ? 'text-blue-700' : 'text-red-500'}`}>
                  {team.pointDiff > 0 ? '+' : ''}{team.pointDiff}
                </p>
              </div>
              {idx < 2 && <span className="text-green-600 text-xs font-bold">Finals ✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChampionBanner({ winner }) {
  return (
    <div className="card bg-gradient-to-br from-yellow-400 to-yellow-500 border-0 text-center py-8">
      <div className="text-6xl mb-3 animate-bounce">🏆</div>
      <p className="text-yellow-900 font-bold text-sm uppercase tracking-widest mb-1">Champion</p>
      <h2 className="text-3xl font-black text-white drop-shadow mb-1">{winner.name}</h2>
      <p className="text-yellow-900 text-sm font-medium">
        {winner.players?.map(p => p.name).join(' · ')}
      </p>
      <div className="mt-4 text-4xl">🎉🏸🎉</div>
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
