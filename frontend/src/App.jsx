import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TournamentProvider } from './context/TournamentContext'
import Navbar from './components/Navbar'
import SetupPage from './pages/SetupPage'
import SchedulePage from './pages/SchedulePage'
import StandingsPage from './pages/StandingsPage'
import FinalsPage from './pages/FinalsPage'

export default function App() {
  return (
    <TournamentProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-6">
          <Navbar />
          <main className="max-w-4xl mx-auto px-4 py-6">
            <Routes>
              <Route path="/" element={<Navigate to="/setup" replace />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/standings" element={<StandingsPage />} />
              <Route path="/finals" element={<FinalsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </TournamentProvider>
  )
}
