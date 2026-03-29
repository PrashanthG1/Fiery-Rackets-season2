import { useNavigate } from 'react-router-dom'
import { useTournament } from '../context/TournamentContext'

const MEDAL = ['🥇', '🥈', '🥉']

export default function StandingsPage() {
  const { tournament, standings, loading } = useTournament()
  const navigate = useNavigate()

  if (loading) return <LoadingSpinner />

  if (!tournament || tournament.phase === 'setup' || !standings.length) {
    return (
      <div className="card text-center py-10">
        <p className="text-4xl mb-3">🏆</p>
        <p className="text-gray-500">No standings yet. Start the tournament first.</p>
        <button onClick={() => navigate('/setup')} className="btn-primary mt-4">
          Go to Setup
        </button>
      </div>
    )
  }

  const rrMatches = tournament.matches.filter(m => m.type === 'round-robin')
  const totalMatches = rrMatches.length
  const completedMatches = rrMatches.filter(m => m.completed).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card text-center py-4">
        <h1 className="text-xl font-bold text-gray-900">Standings</h1>
        <p className="text-sm text-gray-500 mt-1">
          {completedMatches} / {totalMatches} round-robin matches played
        </p>
      </div>

      {/* Top 2 highlight */}
      {completedMatches > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {standings.slice(0, 2).map((team, i) => (
            <div key={team.id} className={`card text-center border-2 ${i === 0 ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'}`}>
              <div className="text-2xl mb-1">{i === 0 ? '🥇' : '🥈'}</div>
              <p className="font-bold text-sm">{team.name}</p>
              <p className="text-2xl font-black text-blue-800">{team.wins}</p>
              <p className="text-xs text-gray-500">wins</p>
              <p className={`text-sm font-semibold mt-1 ${team.pointDiff >= 0 ? 'text-blue-700' : 'text-red-500'}`}>
                {team.pointDiff > 0 ? '+' : ''}{team.pointDiff} pts
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Full standings table */}
      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h2 className="font-semibold text-sm text-gray-700">Full Standings</h2>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-12 text-xs text-gray-400 font-medium uppercase tracking-wide px-4 py-2 border-b border-gray-100">
          <div className="col-span-1">#</div>
          <div className="col-span-5">Team</div>
          <div className="col-span-1 text-center">MP</div>
          <div className="col-span-1 text-center">W</div>
          <div className="col-span-1 text-center">L</div>
          <div className="col-span-3 text-center">Pt Diff</div>
        </div>

        {/* Rows */}
        {standings.map((team, idx) => (
          <div key={team.id}>
            <div className={`grid grid-cols-12 px-4 py-3 items-center border-b border-gray-50 last:border-0 ${
              idx < 2 ? 'bg-blue-50' : ''
            }`}>
              <div className="col-span-1 font-bold text-sm">
                {MEDAL[idx] ?? <span className="text-gray-400">{idx + 1}</span>}
              </div>
              <div className="col-span-5">
                <p className="font-semibold text-sm text-gray-900">{team.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {team.players?.slice(0, 3).map(p => p.name.split(' ')[0]).join(', ')}…
                </p>
              </div>
              <div className="col-span-1 text-center text-sm text-gray-600">{team.matchesPlayed}</div>
              <div className="col-span-1 text-center text-sm font-bold text-blue-800">{team.wins}</div>
              <div className="col-span-1 text-center text-sm text-red-500">{team.losses}</div>
              <div className={`col-span-3 text-center text-sm font-semibold ${
                team.pointDiff > 0 ? 'text-blue-700' : team.pointDiff < 0 ? 'text-red-500' : 'text-gray-400'
              }`}>
                {team.pointDiff > 0 ? '+' : ''}{team.pointDiff}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="card py-3 text-xs text-gray-400 space-y-1">
        <ul className="space-y-0.5">
          <li><span className="font-semibold text-gray-600">MP</span> = Matches Played</li>
          <li><span className="font-semibold text-gray-600">W</span> = Number of Wins</li>
          <li><span className="font-semibold text-gray-600">L</span> = Number of Losses</li>
          <li><span className="font-semibold text-gray-600">Pt Diff</span> = Point Difference</li>
        </ul>
        <p className="pt-1 text-gray-500">Rankings are determined by wins. Point difference is used only as a tiebreaker when two teams have the same number of wins — the team with the higher point difference is ranked above.</p>
      </div>

      {/* Team rosters */}
      <div className="card">
        <h3 className="font-semibold text-sm text-gray-700 mb-3">Team Rosters</h3>
        <div className="space-y-3">
          {tournament.teams.map((team, i) => (
            <div key={team.id} className="bg-gray-50 rounded-lg p-3">
              <p className="font-bold text-sm text-blue-800 mb-1">{team.name}</p>
              <div className="grid grid-cols-2 gap-1">
                {team.players.map((p, pi) => (
                  <p key={pi} className="text-xs text-gray-600">• {p.name}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
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
