import React from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HomeIcon from '@mui/icons-material/Home';
import { PlayerInfo, RoundPublicInfo } from '../types/game';

interface FinalLeaderboardProps {
  roomCode: string;
  players: PlayerInfo[];
  winner?: PlayerInfo | null;
  rounds: RoundPublicInfo[];
  currentPlayerId: number;
  onBackToHome: () => void;
}

export const FinalLeaderboard: React.FC<FinalLeaderboardProps> = ({
  roomCode,
  players,
  winner,
  rounds,
  currentPlayerId,
  onBackToHome,
}) => {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.id - b.id);
  const topWinner = winner || sorted[0] || null;

  return (
    <Container maxWidth="md" sx={{ py: 5 }}>
      <Paper
        elevation={8}
        sx={{
          p: { xs: 3, md: 5 },
          borderRadius: 4,
          bgcolor: '#1e293b',
          border: '1px solid rgba(250, 204, 21, 0.35)',
          textAlign: 'center',
        }}
      >
        <EmojiEventsIcon sx={{ fontSize: 68, color: '#facc15', mb: 1 }} />
        <Typography variant="h3" sx={{ fontWeight: 900, color: '#f8fafc', mb: 0.5 }}>
          Game Complete!
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
          Room Code: <strong>{roomCode}</strong>
        </Typography>

        {topWinner && (
          <Box
            sx={{
              p: 3,
              mb: 4,
              borderRadius: 3,
              background:
                'linear-gradient(135deg, rgba(234, 179, 8, 0.22), rgba(56, 189, 248, 0.15))',
              border: '1px solid rgba(250, 204, 21, 0.5)',
            }}
          >
            <Chip
              label="CHAMPION"
              color="warning"
              sx={{ fontWeight: 900, mb: 1, letterSpacing: 1 }}
            />
            <Typography variant="h4" sx={{ fontWeight: 900, color: '#fef08a' }}>
              {topWinner.display_name}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#38bdf8', mt: 0.5 }}>
              {topWinner.score} Total Points
            </Typography>
          </Box>
        )}

        <Typography
          variant="h6"
          sx={{ textAlign: 'left', fontWeight: 800, mb: 1.5, color: '#e2e8f0' }}
        >
          Final Standings
        </Typography>

        <Stack spacing={1.2} sx={{ mb: 4 }}>
          {sorted.map((player, index) => {
            const isYou = player.id === currentPlayerId;
            return (
              <Box
                key={player.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2.5,
                  py: 1.5,
                  borderRadius: 2.5,
                  bgcolor: isYou
                    ? 'rgba(56, 189, 248, 0.16)'
                    : 'rgba(255, 255, 255, 0.04)',
                  border: isYou
                    ? '1px solid rgba(56, 189, 248, 0.45)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar
                    sx={{
                      fontWeight: 900,
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
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {player.display_name} {isYou ? '(You)' : ''}
                    </Typography>
                  </Box>
                </Stack>

                <Typography variant="h6" sx={{ fontWeight: 900, color: '#38bdf8' }}>
                  {player.score} pts
                </Typography>
              </Box>
            );
          })}
        </Stack>

        {rounds.length > 0 && (
          <>
            <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />
            <Typography
              variant="subtitle1"
              sx={{ textAlign: 'left', fontWeight: 800, mb: 1.5, color: '#cbd5e1' }}
            >
              Secret Words Drawn This Game
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 4 }}>
              {rounds.map((r) => (
                <Chip
                  key={r.id}
                  label={`Round ${r.round_number}: ${(r.word || r.word_hint).toUpperCase()}`}
                  variant="outlined"
                  color="info"
                  sx={{ fontWeight: 700 }}
                />
              ))}
            </Stack>
          </>
        )}

        <Button
          variant="contained"
          size="large"
          startIcon={<HomeIcon />}
          onClick={onBackToHome}
          sx={{ px: 4, py: 1.4, fontWeight: 800, borderRadius: 2.5 }}
        >
          Back to Home / Play Again
        </Button>
      </Paper>
    </Container>
  );
};
