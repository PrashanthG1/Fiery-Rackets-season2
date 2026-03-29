import { NavLink } from 'react-router-dom'
import { useTournament } from '../context/TournamentContext'

const navItems = [
  { to: '/setup',     label: 'Setup',     icon: '⚙️' },
  { to: '/schedule',  label: 'Schedule',  icon: '📋' },
  { to: '/standings', label: 'Standings', icon: '🏆' },
  { to: '/finals',    label: 'Finals',    icon: '🥇' },
]

export default function Navbar() {
  useTournament()

  return (
    <>
      {/* ── Desktop top bar ── */}
      <header className="hidden md:block bg-blue-900 shadow-lg">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            {/* Brand */}
            <div>
              <h1 className="font-black text-white text-xl tracking-tight leading-tight">
                Fiery Rackets
              </h1>
              <span className="text-yellow-400 text-xs font-bold tracking-widest uppercase">Season 2</span>
            </div>

            {/* Nav links */}
            <nav className="flex gap-1">
              {navItems.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-yellow-400 text-blue-900'
                        : 'text-blue-200 hover:bg-yellow-100 hover:text-blue-900'
                    }`
                  }
                >
                  <span>{icon}</span>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* ── Mobile top bar ── */}
      <header className="md:hidden bg-blue-900 shadow-lg">
        <div className="px-4 h-16 flex items-center">
          <div>
            <h1 className="font-black text-white text-base tracking-tight leading-tight">Fiery Rackets</h1>
            <span className="text-yellow-400 text-xs font-bold tracking-widest uppercase">Season 2</span>
          </div>
        </div>
      </header>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-blue-100 z-50 md:hidden shadow-lg">
        <div className="grid grid-cols-4">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 px-1 text-xs font-semibold transition-colors ${
                  isActive ? 'text-blue-900' : 'text-gray-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-xl mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`}>{icon}</span>
                  <span>{label}</span>
                  {isActive && <span className="w-5 h-0.5 rounded-full bg-yellow-400 mt-0.5"/>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
