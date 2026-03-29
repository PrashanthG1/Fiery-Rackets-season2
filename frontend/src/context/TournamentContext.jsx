import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const TournamentContext = createContext(null)

export function TournamentProvider({ children }) {
  const [tournament, setTournament] = useState(null)
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchTournament = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.all([
        fetch('/api/tournament'),
        fetch('/api/standings')
      ])
      const tData = await tRes.json()
      const sData = await sRes.json()
      setTournament(tData)
      setStandings(sData)
      setError(null)
    } catch (err) {
      setError('Failed to connect to server. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTournament()
  }, [fetchTournament])

  const refresh = () => fetchTournament()

  return (
    <TournamentContext.Provider value={{ tournament, standings, loading, error, refresh }}>
      {children}
    </TournamentContext.Provider>
  )
}

export function useTournament() {
  const ctx = useContext(TournamentContext)
  if (!ctx) throw new Error('useTournament must be used within TournamentProvider')
  return ctx
}
