import React from 'react';
import {
  Avatar,
  Box,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import BrushIcon from '@mui/icons-material/Brush';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import StarIcon from '@mui/icons-material/Star';
import { PlayerInfo } from '../types/game';

interface PlayerScoreboardProps {
  players: PlayerInfo[];
  currentPlayerId: number;
  drawerPlayerId?: number | null;
  roundPoints?: Record<string, number>;
}

export const PlayerScoreboard: React.FC<PlayerScoreboardProps> = ({
  players,
  currentPlayerId,
  drawerPlayerId,
  roundPoints = {},
}) => {
  const activePlayers = players
    .filter((p) => !p.left_at)
    .sort((a, b) => b.score - a.score || a.id - b.id);

  return (
    <Paper
      elevation={4}
      sx={{
        p: 2,
        borderRadius: 3,
        bgcolor: '#1e293b',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <EmojiEventsIcon sx={{ color: '#facc15' }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          Live Scoreboard ({activePlayers.length})
        </Typography>
      </Stack>

      <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {activePlayers.map((player, index) => {
          const isYou = player.id === currentPlayerId;
          const isDrawer = player.id === drawerPlayerId || player.is_drawer;
          const gained = roundPoints[String(player.id)] || 0;

          return (
            <ListItem
              key={player.id}
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 2,
                bgcolor: isYou
                  ? 'rgba(56, 189, 248, 0.14)'
                  : 'rgba(255, 255, 255, 0.03)',
                border: isDrawer
                  ? '1px solid rgba(56, 189, 248, 0.5)'
                  : isYou
                  ? '1px solid rgba(56, 189, 248, 0.3)'
                  : '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <ListItemAvatar sx={{ minWidth: 42 }}>
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    bgcolor:
                      index === 0
                        ? '#eab308'
                        : index === 1
                        ? '#94a3b8'
                        : index === 2
                        ? '#b45309'
                        : '#334155',
                    color: index === 0 ? '#0f172a' : '#f8fafc',
                  }}
                >
                  #{index + 1}
                </Avatar>
              </ListItemAvatar>

              <ListItemText
                primary={
                  <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: isYou ? 800 : 600, color: '#f8fafc' }}
                    >
                      {player.display_name}
                      {isYou ? ' (You)' : ''}
                    </Typography>
                    {player.is_host && (
                      <StarIcon sx={{ fontSize: 15, color: '#facc15' }} titleAccess="Room Host" />
                    )}
                    {!player.is_connected && (
                      <Chip
                        icon={<WifiOffIcon />}
                        label="Offline"
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.68rem' }}
                      />
                    )}
                  </Stack>
                }
                secondary={
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.4 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: '#38bdf8' }}
                    >
                      {player.score} pts
                    </Typography>
                    {gained > 0 && (
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 700, color: '#4ade80' }}
                      >
                        (+{gained})
                      </Typography>
                    )}
                  </Stack>
                }
              />

              <Box>
                {isDrawer && (
                  <Chip
                    icon={<BrushIcon />}
                    label="Drawing"
                    size="small"
                    color="info"
                    sx={{ fontWeight: 700 }}
                  />
                )}
                {!isDrawer && player.has_guessed_current_round && (
                  <Chip
                    icon={<CheckCircleIcon />}
                    label="Guessed!"
                    size="small"
                    color="success"
                    sx={{ fontWeight: 700 }}
                  />
                )}
              </Box>
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );
};
