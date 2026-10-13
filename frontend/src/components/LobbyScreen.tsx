import React, { useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import PeopleIcon from '@mui/icons-material/People';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StarIcon from '@mui/icons-material/Star';
import BrushIcon from '@mui/icons-material/Brush';
import { PlayerInfo, RoomDetail } from '../types/game';

interface LobbyScreenProps {
  room: RoomDetail;
  currentPlayer: PlayerInfo;
  onToggleReady: (isReady: boolean) => void;
  onAddBot: () => Promise<void>;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  currentPlayer,
  onToggleReady,
  onAddBot,
  onStartGame,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const [addingBot, setAddingBot] = useState(false);

  const activePlayers = room.players.filter((p) => !p.left_at);
  const connectedPlayers = activePlayers.filter((p) => p.is_connected);
  const minPlayers = room.min_players || 2;
  const canStartGame = connectedPlayers.length >= minPlayers;

  const meInRoom =
    activePlayers.find((p) => p.id === currentPlayer.id) || currentPlayer;

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(room.room_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuickBotAndStart = async () => {
    setAddingBot(true);
    try {
      await onAddBot();
      setTimeout(() => {
        onStartGame();
      }, 250);
    } finally {
      setAddingBot(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 5 }}>
      <Paper
        elevation={10}
        sx={{
          p: { xs: 3, md: 4 },
          borderRadius: 4,
          bgcolor: 'rgba(30, 41, 59, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
        }}
      >
        {/* Header & Room Code */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Box>
            <Chip
              label="WAITING IN LOBBY"
              color="info"
              size="small"
              sx={{ fontWeight: 800, mb: 1 }}
            />
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#f8fafc' }}>
              Game Lobby
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {room.total_rounds} Rounds • {room.round_duration_seconds}s per round • Minimum{' '}
              {minPlayers} players
            </Typography>
          </Box>

          {/* Room Code Badge */}
          <Paper
            variant="outlined"
            sx={{
              px: 2.5,
              py: 1.2,
              borderRadius: 3,
              bgcolor: 'rgba(15, 23, 42, 0.75)',
              borderColor: 'rgba(56, 189, 248, 0.45)',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                ROOM CODE
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 900,
                  letterSpacing: 3,
                  color: '#38bdf8',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {room.room_code}
              </Typography>
            </Box>
            <Tooltip title={copied ? 'Copied!' : 'Copy Room Code'}>
              <IconButton onClick={handleCopyRoomCode} color="info">
                <ContentCopyIcon />
              </IconButton>
            </Tooltip>
          </Paper>
        </Stack>

        <Divider sx={{ my: 2.5, borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* Player Count Header */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap={1}
          sx={{ mb: 2 }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <PeopleIcon sx={{ color: '#38bdf8' }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Players in Room ({activePlayers.length})
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              disabled={addingBot}
              startIcon={<SmartToyIcon />}
              onClick={async () => {
                setAddingBot(true);
                try {
                  await onAddBot();
                } finally {
                  setAddingBot(false);
                }
              }}
              sx={{ fontWeight: 800, borderRadius: 2 }}
            >
              + Add Practice Bot
            </Button>

            <Chip
              label={`${activePlayers.filter((p) => p.is_ready).length} / ${activePlayers.length} Ready`}
              color="success"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>
        </Stack>

        {!canStartGame && (
          <Alert
            severity="info"
            sx={{ mb: 2.5, borderRadius: 2.5, alignItems: 'center' }}
            action={
              <Button
                color="info"
                variant="contained"
                size="small"
                disabled={addingBot}
                startIcon={<BrushIcon />}
                onClick={handleQuickBotAndStart}
                sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}
              >
                Start Solo w/ Bot & Draw Now
              </Button>
            }
          >
            Share code <strong>{room.room_code}</strong> in another browser tab to play with
            friends, or click <strong>"Start Solo w/ Bot & Draw Now"</strong> to launch the drawing
            canvas immediately!
          </Alert>
        )}

        {/* Player List */}
        <List sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, mb: 3 }}>
          {activePlayers.map((player) => {
            const isMe = player.id === currentPlayer.id;
            const isHost = player.id === room.host_player_id || player.is_host;
            return (
              <ListItem
                key={player.id}
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: 2.5,
                  bgcolor: isMe
                    ? 'rgba(56, 189, 248, 0.12)'
                    : 'rgba(255, 255, 255, 0.04)',
                  border: isMe
                    ? '1px solid rgba(56, 189, 248, 0.4)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <ListItemAvatar>
                  <Avatar
                    sx={{
                      bgcolor: isHost ? '#eab308' : '#38bdf8',
                      color: '#0f172a',
                      fontWeight: 900,
                    }}
                  >
                    {player.display_name.slice(0, 2).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>

                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {player.display_name} {isMe ? '(You)' : ''}
                      </Typography>
                      {isHost && (
                        <Chip
                          icon={<StarIcon />}
                          label="Host"
                          size="small"
                          color="warning"
                          sx={{ fontWeight: 700, height: 22 }}
                        />
                      )}
                    </Stack>
                  }
                  secondary={
                    player.is_connected ? 'Connected & synced' : 'Reconnecting...'
                  }
                />

                <Chip
                  icon={
                    player.is_ready ? (
                      <CheckCircleIcon />
                    ) : (
                      <RadioButtonUncheckedIcon />
                    )
                  }
                  label={player.is_ready ? 'Ready' : 'Not Ready'}
                  color={player.is_ready ? 'success' : 'default'}
                  variant={player.is_ready ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 700 }}
                />
              </ListItem>
            );
          })}
        </List>

        {/* Lobby Controls: Ready Toggle, Start Game, Leave Room */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Button
            variant="outlined"
            color="error"
            startIcon={<ExitToAppIcon />}
            onClick={onLeaveRoom}
            sx={{ fontWeight: 700 }}
          >
            Leave Room
          </Button>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant={meInRoom.is_ready ? 'outlined' : 'contained'}
              color={meInRoom.is_ready ? 'warning' : 'success'}
              startIcon={<CheckCircleIcon />}
              onClick={() => onToggleReady(!meInRoom.is_ready)}
              sx={{ fontWeight: 800, px: 3 }}
            >
              {meInRoom.is_ready ? 'Mark Unready' : 'Ready Up'}
            </Button>

            <Button
              variant="contained"
              color="primary"
              size="large"
              disabled={!canStartGame}
              startIcon={<PlayArrowIcon />}
              onClick={onStartGame}
              sx={{ fontWeight: 800, px: 4 }}
            >
              Start Game & Draw
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
};
