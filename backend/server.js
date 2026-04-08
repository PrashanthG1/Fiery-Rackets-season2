const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'tournament.json');

// ── SSE client registry ──────────────────────────────────────────────────────
const clients = new Set();

// In-memory live score store: matchId (number) → { [gameIdx]: { team1Score, team2Score } }
// Not persisted — tracks what the organizer is actively typing between saves.
const liveScores = new Map();

function mergeWithLiveScores(state) {
  if (liveScores.size === 0) return state;
  return {
    ...state,
    matches: (state.matches || []).map(m => {
      const live = liveScores.get(m.id);
      if (!live || Object.keys(live).length === 0) return m;
      return {
        ...m,
        games: m.games.map((g, i) =>
          live[i] ? { ...g, liveScore: live[i] } : g
        ),
      };
    }),
  };
}

function broadcastState(state) {
  if (clients.size === 0) return;
  const merged = mergeWithLiveScores(state);
  const standings = calculateStandings(merged.teams || [], merged.matches || []);
  const msg = `data: ${JSON.stringify({ tournament: merged, standings })}\n\n`;
  clients.forEach(client => {
    try { client.write(msg); } catch { clients.delete(client); }
  });
}

// Keepalive ping every 25 s to prevent proxy/browser from closing idle connections
setInterval(() => {
  clients.forEach(client => {
    try { client.write(': ping\n\n'); } catch { clients.delete(client); }
  });
}, 25000);

function readData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return getDefaultState();
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  broadcastState(data);
}

function getDefaultState() {
  return { teams: [], matches: [], phase: 'setup', winner: null };
}

function buildGameTypes(matchFormat) {
  const { singles = 0, doubles = 3 } = matchFormat || {};
  return [
    ...Array(singles).fill('singles'),
    ...Array(doubles).fill('doubles'),
  ];
}

function makeEmptyGames(gameTypes) {
  return gameTypes.map(() => ({ team1Score: null, team2Score: null }));
}

// Fixed tournament schedule — 5 rounds × 3 matches each
const FIXED_SCHEDULE = [
  { round: 1, team1: 'Banana Boys',   team2: 'Iron Clads'    },
  { round: 1, team1: 'Juggernauts',   team2: 'Bengal Tigers' },
  { round: 1, team1: 'Titans',        team2: 'Mavericks'     },
  { round: 2, team1: 'Banana Boys',   team2: 'Bengal Tigers' },
  { round: 2, team1: 'Iron Clads',    team2: 'Mavericks'     },
  { round: 2, team1: 'Juggernauts',   team2: 'Titans'        },
  { round: 3, team1: 'Banana Boys',   team2: 'Mavericks'     },
  { round: 3, team1: 'Bengal Tigers', team2: 'Titans'        },
  { round: 3, team1: 'Iron Clads',    team2: 'Juggernauts'   },
  { round: 4, team1: 'Banana Boys',   team2: 'Titans'        },
  { round: 4, team1: 'Mavericks',     team2: 'Juggernauts'   },
  { round: 4, team1: 'Bengal Tigers', team2: 'Iron Clads'    },
  { round: 5, team1: 'Banana Boys',   team2: 'Juggernauts'   },
  { round: 5, team1: 'Titans',        team2: 'Iron Clads'    },
  { round: 5, team1: 'Mavericks',     team2: 'Bengal Tigers' },
];

function generateFixedSchedule(teams, matchFormat) {
  const gameTypes = buildGameTypes(matchFormat);
  return FIXED_SCHEDULE.map((entry, idx) => {
    const team1 = teams.find(t => t.name === entry.team1);
    const team2 = teams.find(t => t.name === entry.team2);
    return {
      id: idx + 1,
      round: entry.round,
      team1Id: team1?.id,
      team2Id: team2?.id,
      team1Pairs: null,
      team2Pairs: null,
      games: makeEmptyGames(gameTypes),
      gameTypes,
      completed: false,
      type: 'round-robin'
    };
  });
}

function calculateStandings(teams, matches) {
  const standings = teams.map(team => ({
    ...team,
    wins: 0,
    losses: 0,
    gamesPlayed: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
    matchesPlayed: 0
  }));

  const rrMatches = matches.filter(m => m.completed && m.type === 'round-robin');

  rrMatches.forEach(match => {
    const team1 = standings.find(t => t.id === match.team1Id);
    const team2 = standings.find(t => t.id === match.team2Id);
    if (!team1 || !team2) return;

    match.games.forEach(game => {
      if (game.team1Score !== null && game.team2Score !== null) {
        team1.pointsFor += game.team1Score;
        team1.pointsAgainst += game.team2Score;
        team2.pointsFor += game.team2Score;
        team2.pointsAgainst += game.team1Score;
        team1.gamesPlayed++;
        team2.gamesPlayed++;

        if (game.team1Score > game.team2Score) {
          team1.wins++;
          team2.losses++;
        } else {
          team2.wins++;
          team1.losses++;
        }
      }
    });

    team1.matchesPlayed++;
    team2.matchesPlayed++;
  });

  standings.forEach(t => {
    t.pointDiff = t.pointsFor - t.pointsAgainst;
  });

  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointDiff - a.pointDiff;
  });

  return standings;
}

// GET full tournament state
app.get('/api/tournament', (req, res) => {
  res.json(readData());
});

// POST setup tournament with teams
app.post('/api/tournament/setup', (req, res) => {
  const { teams, tournamentId, tournamentName, matchFormat } = req.body;
  if (!teams || teams.length < 2) {
    return res.status(400).json({ error: 'At least 2 teams required' });
  }

  if (!matchFormat || (matchFormat.singles + matchFormat.doubles) === 0) {
    return res.status(400).json({ error: 'Match format must have at least 1 singles or doubles sub-match' });
  }
  const fmt = matchFormat;

  const teamsWithIds = teams.map((t, i) => ({ ...t, id: i + 1 }));
  const state = {
    tournamentId: tournamentId || null,
    tournamentName: tournamentName || null,
    matchFormat: fmt,
    teams: teamsWithIds,
    matches: generateFixedSchedule(teamsWithIds, fmt),
    phase: 'round-robin',
    winner: null
  };
  writeData(state);
  res.json(state);
});

// GET standings
app.get('/api/standings', (req, res) => {
  const state = readData();
  const standings = calculateStandings(state.teams, state.matches);
  res.json(standings);
});

// GET SSE stream — clients subscribe here for real-time pushes
app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Send current state (merged with any in-flight live scores) immediately on connect
  const state = readData();
  const merged = mergeWithLiveScores(state);
  const standings = calculateStandings(merged.teams || [], merged.matches || []);
  res.write(`data: ${JSON.stringify({ tournament: merged, standings })}\n\n`);

  clients.add(res);
  req.on('close', () => clients.delete(res));
});

// POST live score — accumulate typing updates in memory and broadcast (no disk write)
app.post('/api/matches/:id/live-score', (req, res) => {
  const matchId = parseInt(req.params.id);
  const { gameIdx, team1Score, team2Score } = req.body;

  // Accumulate — keeps all games' live scores alive across separate sub-match updates
  if (!liveScores.has(matchId)) liveScores.set(matchId, {});
  liveScores.get(matchId)[gameIdx] = { team1Score, team2Score };

  broadcastState(readData()); // broadcastState merges liveScores before sending
  res.json({ ok: true });
});

// POST save a single game within a match (never auto-completes)
app.post('/api/matches/:id/game/:gameIdx', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const gameIdx = parseInt(req.params.gameIdx);
  const { team1Score, team2Score } = req.body;

  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (gameIdx < 0 || gameIdx >= match.games.length) return res.status(400).json({ error: 'Invalid game index' });

  match.games[gameIdx] = { team1Score, team2Score };

  // Game is now persisted — remove its live entry so the saved score shows, not the live indicator
  const matchLive = liveScores.get(matchId);
  if (matchLive) {
    delete matchLive[gameIdx];
    if (Object.keys(matchLive).length === 0) liveScores.delete(matchId);
  }

  writeData(state); // broadcastState inside will merge remaining live scores for other games
  res.json(state);
});

// POST submit player pairs for one team in a match
app.post('/api/matches/:id/pairs/:teamSide', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const { teamSide } = req.params; // 'team1' or 'team2'
  const { pairs } = req.body;

  if (!['team1', 'team2'].includes(teamSide)) {
    return res.status(400).json({ error: 'teamSide must be team1 or team2' });
  }
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!Array.isArray(pairs) || pairs.length !== match.games.length) {
    return res.status(400).json({ error: `Must provide exactly ${match.games.length} pairs` });
  }

  match[`${teamSide}Pairs`] = pairs;
  writeData(state);
  res.json(state);
});

// DELETE clear pairs for one team in a match
app.delete('/api/matches/:id/pairs/:teamSide', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const { teamSide } = req.params;

  if (!['team1', 'team2'].includes(teamSide)) {
    return res.status(400).json({ error: 'teamSide must be team1 or team2' });
  }
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  match[`${teamSide}Pairs`] = null;
  writeData(state);
  res.json(state);
});

// POST finalize a match (marks it completed after user reviews all scores)
app.post('/api/matches/:id/finalize', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);

  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const allSaved = match.games.every(g => g.team1Score !== null && g.team2Score !== null);
  if (!allSaved) return res.status(400).json({ error: 'All 3 games must be saved before finalizing' });

  match.completed = true;
  liveScores.delete(matchId); // match is done — no more live scores needed
  writeData(state);
  res.json(state);
});

// DELETE reset a single game within a match
app.delete('/api/matches/:id/game/:gameIdx', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const gameIdx = parseInt(req.params.gameIdx);

  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  match.games[gameIdx] = { team1Score: null, team2Score: null };
  match.completed = false;

  // Clear live score for this game — it's reset so nothing to show
  const matchLiveReset = liveScores.get(matchId);
  if (matchLiveReset) {
    delete matchLiveReset[gameIdx];
    if (Object.keys(matchLiveReset).length === 0) liveScores.delete(matchId);
  }

  if (match.type === 'finals') {
    state.winner = null;
    state.phase = 'finals';
  }

  writeData(state);
  res.json(state);
});

// POST start finals (creates finals match with top 2 teams)
app.post('/api/tournament/start-finals', (req, res) => {
  const state = readData();

  const rrMatches = state.matches.filter(m => m.type === 'round-robin');
  const allComplete = rrMatches.every(m => m.completed);
  if (!allComplete) {
    return res.status(400).json({ error: 'All round-robin matches must be completed first' });
  }

  const standings = calculateStandings(state.teams, state.matches);
  const top2 = standings.slice(0, 2);

  const finalsGameTypes = buildGameTypes(state.matchFormat);
  const finalsMatch = {
    id: 9999,
    team1Id: top2[0].id,
    team2Id: top2[1].id,
    team1Pairs: null,
    team2Pairs: null,
    games: makeEmptyGames(finalsGameTypes),
    gameTypes: finalsGameTypes,
    completed: false,
    type: 'finals'
  };

  state.matches.push(finalsMatch);
  state.phase = 'finals';
  writeData(state);
  res.json(state);
});

// POST complete tournament (after finals scored)
app.post('/api/tournament/complete', (req, res) => {
  const state = readData();
  const finalsMatch = state.matches.find(m => m.type === 'finals' && m.completed);
  if (!finalsMatch) return res.status(400).json({ error: 'Finals not completed yet' });

  let team1Wins = 0, team2Wins = 0;
  finalsMatch.games.forEach(g => {
    if (g.team1Score !== null && g.team2Score !== null) {
      if (g.team1Score > g.team2Score) team1Wins++;
      else team2Wins++;
    }
  });

  const winnerId = team1Wins > team2Wins ? finalsMatch.team1Id : finalsMatch.team2Id;
  const winner = state.teams.find(t => t.id === winnerId);

  state.phase = 'completed';
  state.winner = winner;
  writeData(state);
  res.json(state);
});

// POST reset tournament
app.post('/api/tournament/reset', (req, res) => {
  liveScores.clear(); // wipe all in-memory live scores
  writeData(getDefaultState());
  res.json({ success: true });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Badminton tournament server running on http://localhost:${PORT}`));
