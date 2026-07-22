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

// In-memory live score store: matchId → { [gameIdx]: { team1Score, team2Score } }
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

// Keepalive ping every 25 s
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

// ── Game type helpers ──────────────────────────────────────────────────────
function buildGameTypes(matchStyle, matchFormat) {
  switch (matchStyle) {
    case 'single-pair':   return ['doubles'];
    case 'singles-only':  return ['singles'];
    default: {
      const { singles = 0, doubles = 3 } = matchFormat || {};
      return [
        ...Array(singles).fill('singles'),
        ...Array(doubles).fill('doubles'),
      ];
    }
  }
}

function makeEmptyGames(gameTypes) {
  return gameTypes.map(() => ({ team1Score: null, team2Score: null }));
}

// ── Schedule generation ────────────────────────────────────────────────────

/**
 * Round-robin: every team plays every other team exactly once.
 * Uses the "circle method" to group matches into balanced rounds.
 */
function generateRoundRobin(teams, gameTypes) {
  const n = teams.length;
  const matches = [];
  let matchId = 1;

  // For odd n, add a ghost "bye" team
  const list = n % 2 === 0 ? [...teams] : [...teams, null];
  const half = list.length / 2;

  for (let round = 0; round < list.length - 1; round++) {
    for (let i = 0; i < half; i++) {
      const t1 = list[i];
      const t2 = list[list.length - 1 - i];
      if (t1 && t2) {
        matches.push({
          id: matchId++,
          round: round + 1,
          team1Id: t1.id,
          team2Id: t2.id,
          team1Pairs: null,
          team2Pairs: null,
          games: makeEmptyGames(gameTypes),
          gameTypes,
          completed: false,
          type: 'round-robin',
        });
      }
    }
    // Rotate: fix index 0, rotate the rest
    list.splice(1, 0, list.pop());
  }

  return matches;
}

/**
 * Group stage: divide teams into groups, generate round-robin within each group.
 */
function generateGroupStage(teams, numGroups, gameTypes) {
  const groups = Array.from({ length: numGroups }, () => []);
  teams.forEach((t, i) => groups[i % numGroups].push(t));

  const matches = [];
  let matchId = 1;

  groups.forEach((group, gIdx) => {
    // Round-robin within the group using circle method
    const n = group.length;
    if (n < 2) return;
    const list = n % 2 === 0 ? [...group] : [...group, null];
    const half = list.length / 2;

    for (let round = 0; round < list.length - 1; round++) {
      for (let i = 0; i < half; i++) {
        const t1 = list[i];
        const t2 = list[list.length - 1 - i];
        if (t1 && t2) {
          matches.push({
            id: matchId++,
            round: round + 1,
            group: gIdx + 1,
            groupLabel: `Group ${String.fromCharCode(65 + gIdx)}`,
            team1Id: t1.id,
            team2Id: t2.id,
            team1Pairs: null,
            team2Pairs: null,
            games: makeEmptyGames(gameTypes),
            gameTypes,
            completed: false,
            type: 'round-robin',
          });
        }
      }
      list.splice(1, 0, list.pop());
    }
  });

  return matches;
}

// ── Standings ──────────────────────────────────────────────────────────────
function calculateStandings(teams, matches) {
  const standings = teams.map(team => ({
    ...team,
    wins: 0, losses: 0,
    gamesPlayed: 0,
    pointsFor: 0, pointsAgainst: 0, pointDiff: 0,
    matchesPlayed: 0,
  }));

  const rrMatches = matches.filter(m => m.completed && m.type === 'round-robin');

  rrMatches.forEach(match => {
    const team1 = standings.find(t => t.id === match.team1Id);
    const team2 = standings.find(t => t.id === match.team2Id);
    if (!team1 || !team2) return;

    let t1GameWins = 0, t2GameWins = 0;
    match.games.forEach(game => {
      if (game.team1Score !== null && game.team2Score !== null) {
        team1.pointsFor    += game.team1Score;
        team1.pointsAgainst += game.team2Score;
        team2.pointsFor    += game.team2Score;
        team2.pointsAgainst += game.team1Score;
        team1.gamesPlayed++;
        team2.gamesPlayed++;
        if (game.team1Score > game.team2Score) t1GameWins++;
        else t2GameWins++;
      }
    });

    // Match win = winning more sub-games
    if (t1GameWins > t2GameWins) { team1.wins++; team2.losses++; }
    else if (t2GameWins > t1GameWins) { team2.wins++; team1.losses++; }

    team1.matchesPlayed++;
    team2.matchesPlayed++;
  });

  standings.forEach(t => { t.pointDiff = t.pointsFor - t.pointsAgainst; });
  standings.sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : b.pointDiff - a.pointDiff);

  return standings;
}

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/tournament', (req, res) => res.json(readData()));

app.post('/api/tournament/setup', (req, res) => {
  const { teams, tournamentId, tournamentName, matchFormat, matchStyle, stageFormat, numGroups } = req.body;

  if (!teams || teams.length < 2) {
    return res.status(400).json({ error: 'At least 2 teams required' });
  }

  // For team-match style, submatches must be configured
  if ((!matchStyle || matchStyle === 'team') && matchFormat) {
    const total = (matchFormat.singles || 0) + (matchFormat.doubles || 0);
    if (total === 0) {
      return res.status(400).json({ error: 'Match format must have at least 1 singles or doubles sub-match' });
    }
  }

  const gameTypes = buildGameTypes(matchStyle, matchFormat);
  const teamsWithIds = teams.map((t, i) => ({ ...t, id: i + 1 }));

  let matches;
  if (stageFormat === 'group-stage') {
    const groups = Math.max(2, Math.min(parseInt(numGroups) || 2, Math.floor(teamsWithIds.length / 2)));
    matches = generateGroupStage(teamsWithIds, groups, gameTypes);
  } else {
    matches = generateRoundRobin(teamsWithIds, gameTypes);
  }

  const state = {
    tournamentId: tournamentId || null,
    tournamentName: tournamentName || null,
    matchFormat: matchFormat || null,
    matchStyle: matchStyle || 'team',
    stageFormat: stageFormat || 'round-robin',
    numGroups: stageFormat === 'group-stage' ? parseInt(numGroups) || 2 : null,
    teams: teamsWithIds,
    matches,
    phase: 'round-robin',
    winner: null,
  };

  writeData(state);
  res.json(state);
});

app.get('/api/standings', (req, res) => {
  const state = readData();
  res.json(calculateStandings(state.teams, state.matches));
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const state = readData();
  const merged = mergeWithLiveScores(state);
  const standings = calculateStandings(merged.teams || [], merged.matches || []);
  res.write(`data: ${JSON.stringify({ tournament: merged, standings })}\n\n`);

  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.post('/api/matches/:id/live-score', (req, res) => {
  const matchId = parseInt(req.params.id);
  const { gameIdx, team1Score, team2Score } = req.body;
  if (!liveScores.has(matchId)) liveScores.set(matchId, {});
  liveScores.get(matchId)[gameIdx] = { team1Score, team2Score };
  broadcastState(readData());
  res.json({ ok: true });
});

app.post('/api/matches/:id/game/:gameIdx', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const gameIdx = parseInt(req.params.gameIdx);
  const { team1Score, team2Score } = req.body;

  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (gameIdx < 0 || gameIdx >= match.games.length) return res.status(400).json({ error: 'Invalid game index' });

  match.games[gameIdx] = { team1Score, team2Score };

  const matchLive = liveScores.get(matchId);
  if (matchLive) {
    delete matchLive[gameIdx];
    if (Object.keys(matchLive).length === 0) liveScores.delete(matchId);
  }

  writeData(state);
  res.json(state);
});

app.post('/api/matches/:id/pairs/:teamSide', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const { teamSide } = req.params;
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

app.post('/api/matches/:id/finalize', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const allSaved = match.games.every(g => g.team1Score !== null && g.team2Score !== null);
  if (!allSaved) return res.status(400).json({ error: 'All games must be saved before finalizing' });

  match.completed = true;
  liveScores.delete(matchId);
  writeData(state);
  res.json(state);
});

app.delete('/api/matches/:id/game/:gameIdx', (req, res) => {
  const state = readData();
  const matchId = parseInt(req.params.id);
  const gameIdx = parseInt(req.params.gameIdx);

  const match = state.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  match.games[gameIdx] = { team1Score: null, team2Score: null };
  match.completed = false;

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

app.post('/api/tournament/start-finals', (req, res) => {
  const state = readData();
  const rrMatches = state.matches.filter(m => m.type === 'round-robin');
  const allComplete = rrMatches.every(m => m.completed);
  if (!allComplete) {
    return res.status(400).json({ error: 'All round-robin matches must be completed first' });
  }

  const standings = calculateStandings(state.teams, state.matches);
  const top2 = standings.slice(0, 2);
  const gameTypes = buildGameTypes(state.matchStyle, state.matchFormat);

  const finalsMatch = {
    id: 9999,
    team1Id: top2[0].id,
    team2Id: top2[1].id,
    team1Pairs: null,
    team2Pairs: null,
    games: makeEmptyGames(gameTypes),
    gameTypes,
    completed: false,
    type: 'finals',
  };

  state.matches.push(finalsMatch);
  state.phase = 'finals';
  writeData(state);
  res.json(state);
});

app.post('/api/tournament/complete', (req, res) => {
  const state = readData();
  const finalsMatch = state.matches.find(m => m.type === 'finals' && m.completed);
  if (!finalsMatch) return res.status(400).json({ error: 'Finals not completed yet' });

  let t1Wins = 0, t2Wins = 0;
  finalsMatch.games.forEach(g => {
    if (g.team1Score !== null && g.team2Score !== null) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else t2Wins++;
    }
  });

  const winnerId = t1Wins > t2Wins ? finalsMatch.team1Id : finalsMatch.team2Id;
  state.phase = 'completed';
  state.winner = state.teams.find(t => t.id === winnerId);
  writeData(state);
  res.json(state);
});

app.post('/api/tournament/reset', (req, res) => {
  liveScores.clear();
  writeData(getDefaultState());
  res.json({ success: true });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Badminton tournament server running on http://localhost:${PORT}`));
