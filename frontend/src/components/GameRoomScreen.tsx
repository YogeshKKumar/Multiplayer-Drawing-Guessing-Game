import React from 'react';
import {
  Box,
  Button,
  Chip,
  Container,
  Grid,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import PaletteIcon from '@mui/icons-material/Palette';
import {
  ChatFeedItem,
  DrawStrokePayload,
  FloatingReaction,
  PlayerInfo,
  RoomDetail,
  RoundResultSummary,
} from '../types/game';
import { DrawingCanvas } from './DrawingCanvas';
import { TimerBadge } from './TimerBadge';
import { PlayerScoreboard } from './PlayerScoreboard';
import { GuessPanel } from './GuessPanel';
import { RoundResultModal } from './RoundResultModal';

interface GameRoomScreenProps {
  room: RoomDetail;
  currentPlayer: PlayerInfo;
  wsConnected: boolean;
  soundMuted: boolean;
  secretWord: string | null;
  wordHint: string | null;
  remainingSeconds: number;
  strokes: DrawStrokePayload[];
  feed: ChatFeedItem[];
  floatingReactions: FloatingReaction[];
  roundPoints: Record<string, number>;
  roundResult: RoundResultSummary | null;
  onToggleSound: () => void;
  onEmitStroke: (stroke: DrawStrokePayload) => void;
  onUndoStroke: (strokeId?: string) => void;
  onClearCanvas: () => void;
  onRevealHint: () => void;
  onSubmitGuess: (guessText: string) => void;
  onSendReaction: (emoji: string) => void;
  onLeaveRoom: () => void;
}

export const GameRoomScreen: React.FC<GameRoomScreenProps> = ({
  room,
  currentPlayer,
  wsConnected,
  soundMuted,
  secretWord,
  wordHint,
  remainingSeconds,
  strokes,
  feed,
  floatingReactions,
  roundPoints,
  roundResult,
  onToggleSound,
  onEmitStroke,
  onUndoStroke,
  onClearCanvas,
  onRevealHint,
  onSubmitGuess,
  onSendReaction,
  onLeaveRoom,
}) => {
  const meInRoom =
    room.players.find((p) => p.id === currentPlayer.id) || currentPlayer;
  const isDrawer =
    room.drawer_player_id === currentPlayer.id || Boolean(meInRoom.is_drawer);
  const drawerPlayer = room.players.find((p) => p.id === room.drawer_player_id);
  const drawerName = drawerPlayer?.display_name || 'Drawer';
  const isRoundActive = room.status === 'playing' && roundResult === null;

  return (
    <Container maxWidth="xl" sx={{ py: 2, position: 'relative' }}>
      {/* Floating Live Reactions Overlay */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 40,
          left: 0,
          right: 0,
          pointerEvents: 'none',
          zIndex: 1500,
        }}
      >
        {floatingReactions.map((r) => (
          <Box
            key={r.id}
            sx={{
              position: 'absolute',
              left: `${r.leftPercent}%`,
              bottom: 0,
              animation: 'floatUpFade 2.2s ease-out forwards',
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: '2.4rem', lineHeight: 1 }}>{r.emoji}</Typography>
            <Chip
              label={r.playerName}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.68rem',
                fontWeight: 800,
                bgcolor: 'rgba(15, 23, 42, 0.85)',
                color: '#38bdf8',
              }}
            />
          </Box>
        ))}
      </Box>

      {/* Top Arcade HUD Bar */}
      <Paper
        elevation={8}
        sx={{
          px: 3,
          py: 1.5,
          mb: 2.5,
          borderRadius: 4,
          bgcolor: 'rgba(30, 41, 59, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <PaletteIcon sx={{ color: '#38bdf8', fontSize: 28 }} />
              <Typography
                variant="h5"
                sx={{
                  fontFamily: "'Fredoka', sans-serif",
                  fontWeight: 700,
                  background: 'linear-gradient(90deg, #38bdf8, #a855f7)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                SketchSync
              </Typography>
              <Chip
                label={`CODE: ${room.room_code}`}
                size="small"
                variant="outlined"
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 800,
                  borderColor: 'rgba(56, 189, 248, 0.45)',
                  color: '#38bdf8',
                }}
              />
              <Chip
                icon={wsConnected ? <WifiIcon /> : <WifiOffIcon />}
                label={wsConnected ? 'SYNCED' : 'RECONNECTING'}
                color={wsConnected ? 'success' : 'warning'}
                size="small"
                sx={{ fontWeight: 800 }}
              />
            </Stack>
          </Grid>

          <Grid item xs={12} md={5}>
            <TimerBadge
              remainingSeconds={remainingSeconds}
              totalDurationSeconds={room.round_duration_seconds || 60}
              currentRound={Math.max(1, room.current_round)}
              totalRounds={room.total_rounds}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <Stack
              direction="row"
              spacing={1}
              justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
              alignItems="center"
            >
              <Tooltip title={soundMuted ? 'Unmute Arcade SFX' : 'Mute Arcade SFX'}>
                <IconButton
                  onClick={onToggleSound}
                  color={soundMuted ? 'default' : 'info'}
                  sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}
                >
                  {soundMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                </IconButton>
              </Tooltip>

              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<ExitToAppIcon />}
                onClick={onLeaveRoom}
                sx={{ fontWeight: 800, borderRadius: 2.5 }}
              >
                Leave
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Main 3-Column Game Arena */}
      <Grid container spacing={2.5}>
        {/* Left: Live Scoreboard & Player List */}
        <Grid item xs={12} md={2.8}>
          <PlayerScoreboard
            players={room.players}
            currentPlayerId={currentPlayer.id}
            drawerPlayerId={room.drawer_player_id}
            roundPoints={roundPoints}
          />
        </Grid>

        {/* Center: Studio Drawing Canvas */}
        <Grid item xs={12} md={6.2}>
          <DrawingCanvas
            isDrawer={isDrawer}
            drawerName={drawerName}
            secretWord={secretWord}
            wordHint={wordHint}
            strokes={strokes}
            onEmitStroke={onEmitStroke}
            onUndoStroke={onUndoStroke}
            onClearCanvas={onClearCanvas}
            onRevealHint={onRevealHint}
          />
        </Grid>

        {/* Right: Guess Panel & Activity Feed */}
        <Grid item xs={12} md={3}>
          <GuessPanel
            feed={feed}
            isDrawer={isDrawer}
            hasGuessedCurrentRound={Boolean(meInRoom.has_guessed_current_round)}
            isRoundActive={isRoundActive}
            onSubmitGuess={onSubmitGuess}
            onSendReaction={onSendReaction}
          />
        </Grid>
      </Grid>

      {/* Round Result Intermission Modal */}
      <RoundResultModal open={Boolean(roundResult)} result={roundResult} />
    </Container>
  );
};
