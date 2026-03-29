const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'tournament.json');

function readData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return getDefaultState();
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getDefaultState() {
  return { teams: [], matches: [], phase: 'setup', winner: null };
}

function generateRoundRobinSchedule(teams) {
  // Build all unordered pairs
  const pairs = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push({ team1Id: teams[i].id, team2Id: teams[j].id });
    }
  }

  // Order matches so no team plays in back-to-back slots.
  // Uses backtracking (only explores conflict-free moves) so it is
  // guaranteed to find a perfect schedule whenever one exists.
  // Falls back to a greedy heuristic only if backtracking yields nothing.

  function tryBacktrack(remaining, scheduled) {
    if (remaining.length === 0) return scheduled;
    const pos = scheduled.length;
    const justPlayed = pos > 0
      ? new Set([scheduled[pos - 1].team1Id, scheduled[pos - 1].team2Id])
      : new Set();

    // Only try matches that don't conflict with the previous slot
    const valid = remaining.filter(
      m => !justPlayed.has(m.team1Id) && !justPlayed.has(m.team2Id)
    );

    // Sort: prefer matches whose teams have been resting longest — finds
    // solutions faster and produces a more spread-out schedule.
    const lastAt = {};
    scheduled.forEach((m, i) => { lastAt[m.team1Id] = i; lastAt[m.team2Id] = i; });
    valid.sort((a, b) => {
      const restA = Math.min(pos - (lastAt[a.team1Id] ?? -999), pos - (lastAt[a.team2Id] ?? -999));
      const restB = Math.min(pos - (lastAt[b.team1Id] ?? -999), pos - (lastAt[b.team2Id] ?? -999));
      return restB - restA; // descending: longest rest first
    });

    for (const m of valid) {
      const next = remaining.filter(r => r !== m);
      const result = tryBacktrack(next, [...scheduled, m]);
      if (result) return result;
    }
    return null; // dead end — caller will backtrack
  }

  // Greedy fallback (used only if a perfect schedule doesn't exist)
  function greedyFallback(pool) {
    const rem = [...pool];
    const out = [];
    const lastAt = {};
    while (rem.length > 0) {
      const pos = out.length;
      const justPlayed = out.length > 0
        ? new Set([out[pos - 1].team1Id, out[pos - 1].team2Id])
        : new Set();
      const candidates = rem.filter(m => !justPlayed.has(m.team1Id) && !justPlayed.has(m.team2Id));
      const pool2 = candidates.length > 0 ? candidates : rem;
      const chosen = pool2.reduce((best, m) => {
        const rM = Math.min(pos - (lastAt[m.team1Id] ?? -999), pos - (lastAt[m.team2Id] ?? -999));
        const rB = Math.min(pos - (lastAt[best.team1Id] ?? -999), pos - (lastAt[best.team2Id] ?? -999));
        return rM > rB ? m : best;
      });
      rem.splice(rem.indexOf(chosen), 1);
      out.push(chosen);
      lastAt[chosen.team1Id] = pos;
      lastAt[chosen.team2Id] = pos;
    }
    return out;
  }

  const ordered = tryBacktrack(pairs, []) ?? greedyFallback(pairs);

  // Attach match metadata
  return ordered.map((p, idx) => ({
    id: idx + 1,
    team1Id: p.team1Id,
    team2Id: p.team2Id,
    team1Pairs: null,
    team2Pairs: null,
    games: [
      { team1Score: null, team2Score: null },
      { team1Score: null, team2Score: null },
      { team1Score: null, team2Score: null }
    ],
    completed: false,
    type: 'round-robin'
  }));
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
  const { teams } = req.body;
  if (!teams || teams.length < 2) {
    return res.status(400).json({ error: 'At least 2 teams required' });
  }

  const teamsWithIds = teams.map((t, i) => ({ ...t, id: i + 1 }));
  const state = {
    teams: teamsWithIds,
    matches: generateRoundRobinSchedule(teamsWithIds),
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

// POST save a single game within a match (never auto-completes)
app.post('/api/matches/:id/game/:gameIdx', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const gameIdx = parseInt(req.params.gameIdx);
  const { team1Score, team2Score } = req.body;

  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (gameIdx < 0 || gameIdx > 2) return res.status(400).json({ error: 'Invalid game index' });

  match.games[gameIdx] = { team1Score, team2Score };
  // Never auto-complete — user must explicitly finalize

  writeData(state);
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
  if (!Array.isArray(pairs) || pairs.length !== 3) {
    return res.status(400).json({ error: 'Must provide exactly 3 pairs' });
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

  const finalsMatch = {
    id: 9999,
    team1Id: top2[0].id,
    team2Id: top2[1].id,
    team1Pairs: null,
    team2Pairs: null,
    games: [
      { team1Score: null, team2Score: null },
      { team1Score: null, team2Score: null },
      { team1Score: null, team2Score: null }
    ],
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
  writeData(getDefaultState());
  res.json({ success: true });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Badminton tournament server running on http://localhost:${PORT}`));
