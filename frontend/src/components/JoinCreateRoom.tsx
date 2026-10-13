import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import BrushIcon from '@mui/icons-material/Brush';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LoginIcon from '@mui/icons-material/Login';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HistoryIcon from '@mui/icons-material/History';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import {
  getGameHistory,
  getLeaderboard,
  getPlayerStats,
} from '../services/api';
import {
  DrawStrokePayload,
  GameHistoryItem,
  LeaderboardEntry,
  PlayerStats,
} from '../types/game';
import { DrawingCanvas } from './DrawingCanvas';

const PRACTICE_WORDS = [
  'SPACESHIP',
  'ELEPHANT',
  'LIGHTHOUSE',
  'GUITAR',
  'VOLCANO',
  'BUTTERFLY',
  'CASTLE',
  'SKATEBOARD',
];

interface JoinCreateRoomProps {
  loading: boolean;
  error: string | null;
  onCreateRoom: (displayName: string, totalRounds: number, roundDuration: number) => void;
  onJoinRoom: (roomCode: string, displayName: string) => void;
}

export const JoinCreateRoom: React.FC<JoinCreateRoomProps> = ({
  loading,
  error,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [totalRounds, setTotalRounds] = useState(3);
  const [roundDuration, setRoundDuration] = useState(60);

  const [activeTab, setActiveTab] = useState(0);
  const [practiceStrokes, setPracticeStrokes] = useState<DrawStrokePayload[]>([]);
  const [practiceWordIdx, setPracticeWordIdx] = useState(0);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<GameHistoryItem[]>([]);
  const [statsQuery, setStatsQuery] = useState('');
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 2) {
      getLeaderboard()
        .then(setLeaderboard)
        .catch(() => {});
    } else if (activeTab === 3) {
      getGameHistory(15)
        .then((res) => setHistory(res.games))
        .catch(() => {});
    }
  }, [activeTab]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    onCreateRoom(displayName.trim(), totalRounds, roundDuration);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !roomCode.trim()) return;
    onJoinRoom(roomCode.trim().toUpperCase(), displayName.trim());
  };

  const handleLookupStats = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statsQuery.trim()) return;
    setStatsError(null);
    setPlayerStats(null);
    try {
      const data = await getPlayerStats(statsQuery.trim());
      setPlayerStats(data);
    } catch {
      setStatsError(`No statistics found for player "${statsQuery.trim()}".`);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Hero Banner */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Stack
          direction="row"
          justifyContent="center"
          alignItems="center"
          spacing={1.5}
          sx={{ mb: 1 }}
        >
          <PaletteIcon sx={{ fontSize: 46, color: '#38bdf8' }} />
          <Typography
            variant="h3"
            sx={{
              fontWeight: 900,
              background: 'linear-gradient(90deg, #38bdf8, #a855f7, #ec4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            SketchSync
          </Typography>
        </Stack>
        <Typography variant="subtitle1" color="text.secondary">
          Real-Time Multiplayer Drawing & Guessing Party Game
        </Typography>
      </Box>

      {/* Navigation Tabs */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            bgcolor: '#1e293b',
            borderRadius: 3,
            p: 0.5,
            border: '1px solid rgba(56, 189, 248, 0.25)',
          }}
        >
          <Tab icon={<PaletteIcon />} iconPosition="start" label="Multiplayer Game" sx={{ fontWeight: 800 }} />
          <Tab icon={<BrushIcon />} iconPosition="start" label="🎨 Free Draw Studio" sx={{ fontWeight: 800 }} />
          <Tab icon={<EmojiEventsIcon />} iconPosition="start" label="Leaderboard" sx={{ fontWeight: 800 }} />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="Game History" sx={{ fontWeight: 800 }} />
          <Tab icon={<QueryStatsIcon />} iconPosition="start" label="Player Stats" sx={{ fontWeight: 800 }} />
        </Tabs>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* TAB 0: Create or Join Room */}
      {activeTab === 0 && (
        <Grid container spacing={3.5}>
          {/* Shared Display Name Card */}
          <Grid item xs={12}>
            <Paper
              elevation={6}
              sx={{
                p: 3,
                borderRadius: 3,
                bgcolor: 'rgba(30, 41, 59, 0.92)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={1}
                sx={{ mb: 1.5 }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  1. Enter Your Artist Display Name
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="info"
                  startIcon={<BrushIcon />}
                  onClick={() => setActiveTab(1)}
                  sx={{ fontWeight: 800, borderRadius: 2 }}
                >
                  Try Free Draw Studio Now
                </Button>
              </Stack>
              <TextField
                fullWidth
                label="Player Display Name"
                placeholder="e.g. Picasso42"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                inputProps={{ maxLength: 32 }}
              />
            </Paper>
          </Grid>

          {/* Create New Room */}
          <Grid item xs={12} md={6}>
            <Paper
              component="form"
              onSubmit={handleCreate}
              elevation={6}
              sx={{
                p: 3.5,
                height: '100%',
                borderRadius: 3,
                bgcolor: 'rgba(30, 41, 59, 0.92)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <AddCircleOutlineIcon sx={{ color: '#38bdf8' }} />
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Create a Game Room
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Create a room to draw with friends or add an AI Practice Bot in the lobby to start
                  drawing immediately!
                </Typography>

                <Stack spacing={2.5} sx={{ mb: 3 }}>
                  <TextField
                    select
                    label="Number of Rounds"
                    value={totalRounds}
                    onChange={(e) => setTotalRounds(Number(e.target.value))}
                    fullWidth
                  >
                    {[2, 3, 4, 5, 6, 8, 10].map((r) => (
                      <MenuItem key={r} value={r}>
                        {r} Rounds
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Round Timer Duration"
                    value={roundDuration}
                    onChange={(e) => setRoundDuration(Number(e.target.value))}
                    fullWidth
                  >
                    {[30, 45, 60, 80, 90, 120].map((sec) => (
                      <MenuItem key={sec} value={sec}>
                        {sec} Seconds
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </Box>

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={loading || !displayName.trim()}
                startIcon={<AddCircleOutlineIcon />}
                sx={{ py: 1.5, fontWeight: 800 }}
              >
                Create Room
              </Button>
            </Paper>
          </Grid>

          {/* Join Existing Room */}
          <Grid item xs={12} md={6}>
            <Paper
              component="form"
              onSubmit={handleJoin}
              elevation={6}
              sx={{
                p: 3.5,
                height: '100%',
                borderRadius: 3,
                bgcolor: 'rgba(30, 41, 59, 0.92)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <LoginIcon sx={{ color: '#a855f7' }} />
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Join Existing Room
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Have a room code from a friend? Enter the 6-character code below to jump into the
                  lobby or reconnect to an active match.
                </Typography>

                <TextField
                  fullWidth
                  label="Room Code"
                  placeholder="e.g. A7K9X2"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  inputProps={{
                    maxLength: 10,
                    style: {
                      textTransform: 'uppercase',
                      letterSpacing: 3,
                      fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                    },
                  }}
                  sx={{ mb: 3 }}
                />
              </Box>

              <Button
                type="submit"
                variant="contained"
                color="secondary"
                size="large"
                fullWidth
                disabled={loading || !displayName.trim() || !roomCode.trim()}
                startIcon={<LoginIcon />}
                sx={{ py: 1.5, fontWeight: 800 }}
              >
                Join Room
              </Button>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* TAB 1: Interactive Free Draw Studio (Test All 8 Drawing Tools Immediately) */}
      {activeTab === 1 && (
        <Box>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={1.5}
            sx={{ mb: 2 }}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#38bdf8' }}>
                🎨 Interactive Free Draw Studio
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Practice with all 8 drawing tools: Pen, Marker, Spray Paint, Line, Rectangle,
                Circle, Flood Fill Bucket, Eraser, 24 Colors, Custom Color Picker, and Undo!
              </Typography>
            </Box>
            <Button
              variant="outlined"
              color="info"
              onClick={() =>
                setPracticeWordIdx((idx) => (idx + 1) % PRACTICE_WORDS.length)
              }
              sx={{ fontWeight: 800, borderRadius: 2 }}
            >
              New Practice Word
            </Button>
          </Stack>

          <DrawingCanvas
            isDrawer={true}
            drawerName={displayName || 'You'}
            secretWord={PRACTICE_WORDS[practiceWordIdx]}
            wordHint={null}
            strokes={practiceStrokes}
            onEmitStroke={(stroke) => setPracticeStrokes((prev) => [...prev, stroke])}
            onUndoStroke={() => {
              setPracticeStrokes((prev) => {
                if (prev.length === 0) return prev;
                const lastId = prev[prev.length - 1].stroke_id;
                if (lastId) {
                  return prev.filter((s) => s.stroke_id !== lastId);
                }
                return prev.slice(0, -1);
              });
            }}
            onClearCanvas={() => setPracticeStrokes([])}
            onRevealHint={() =>
              setPracticeWordIdx((idx) => (idx + 1) % PRACTICE_WORDS.length)
            }
          />
        </Box>
      )}

      {/* TAB 2: Global Leaderboard */}
      {activeTab === 2 && (
        <Paper
          elevation={6}
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: '#1e293b',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
            Top Player Leaderboard
          </Typography>
          {leaderboard.length === 0 ? (
            <Typography color="text.secondary">
              No scores recorded yet. Complete a game to appear on the leaderboard!
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Rank</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Player</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Room Code</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>
                      Score
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leaderboard.map((row) => (
                    <TableRow key={`${row.room_code}-${row.player_id}`}>
                      <TableCell>
                        <Chip
                          label={`#${row.rank}`}
                          size="small"
                          color={row.rank === 1 ? 'warning' : 'default'}
                          sx={{ fontWeight: 800 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{row.display_name}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{row.room_code}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: '#38bdf8' }}>
                        {row.score} pts
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* TAB 3: Completed Game History */}
      {activeTab === 3 && (
        <Paper
          elevation={6}
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: '#1e293b',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
            Completed Game History
          </Typography>
          {history.length === 0 ? (
            <Typography color="text.secondary">
              No completed games recorded in MySQL yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {history.map((g) => (
                <Box
                  key={g.id}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    spacing={1}
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        Room {g.room_code} • {g.player_count} Players • {g.total_rounds} Rounds
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Words: {g.secret_words.join(', ') || 'N/A'}
                      </Typography>
                    </Box>
                    {g.winner_name && (
                      <Chip
                        icon={<EmojiEventsIcon />}
                        label={`Winner: ${g.winner_name} (${g.winner_score} pts)`}
                        color="warning"
                        sx={{ fontWeight: 800 }}
                      />
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      )}

      {/* TAB 4: Player Statistics Lookup */}
      {activeTab === 4 && (
        <Paper
          elevation={6}
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: '#1e293b',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
            Player Statistics Lookup
          </Typography>
          <Box component="form" onSubmit={handleLookupStats} sx={{ mb: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Search by Player Display Name"
                value={statsQuery}
                onChange={(e) => setStatsQuery(e.target.value)}
              />
              <Button
                type="submit"
                variant="contained"
                sx={{ px: 4, fontWeight: 800 }}
              >
                Search
              </Button>
            </Stack>
          </Box>

          {statsError && <Alert severity="warning">{statsError}</Alert>}

          {playerStats && (
            <>
              <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, color: '#38bdf8' }}>
                Stats for {playerStats.display_name}
              </Typography>
              <Grid container spacing={2}>
                {[
                  { label: 'Games Played', value: playerStats.games_played },
                  { label: 'Games Won', value: playerStats.games_won },
                  { label: 'Total Score', value: `${playerStats.total_score} pts` },
                  { label: 'Highest Score', value: `${playerStats.highest_score} pts` },
                  { label: 'Average Score', value: `${playerStats.average_score} pts` },
                  { label: 'Rounds Drawn', value: playerStats.rounds_drawn },
                  { label: 'Correct Guesses', value: `${playerStats.correct_guesses} / ${playerStats.total_guesses}` },
                  { label: 'Guess Accuracy', value: `${playerStats.guess_accuracy_percent}%` },
                ].map((stat) => (
                  <Grid item xs={6} sm={3} key={stat.label}>
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.04)',
                        textAlign: 'center',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {stat.label}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>
                        {stat.value}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </Paper>
      )}
    </Container>
  );
};
