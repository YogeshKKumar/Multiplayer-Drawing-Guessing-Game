import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  Box,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { RoundResultSummary } from '../types/game';

interface RoundResultModalProps {
  open: boolean;
  result: RoundResultSummary | null;
}

export const RoundResultModal: React.FC<RoundResultModalProps> = ({ open, result }) => {
  if (!result) return null;

  const reasonLabels: Record<string, string> = {
    all_guessed: 'Everyone guessed the secret word!',
    time_up: 'Time ran out!',
    drawer_disconnected: 'The drawer disconnected — moving to next round!',
    insufficient_players: 'Not enough players remaining.',
  };

  const sortedPlayers = [...result.players].sort((a, b) => b.score - a.score);

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#1e293b',
          color: '#f8fafc',
          borderRadius: 3,
          border: '1px solid rgba(56, 189, 248, 0.35)',
        },
      }}
    >
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        <Stack direction="row" justifyContent="center" alignItems="center" spacing={1}>
          <AutoAwesomeIcon sx={{ color: '#facc15' }} />
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Round {result.round_number} Complete!
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {reasonLabels[result.reason] || 'Round finished'}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            textAlign: 'center',
            bgcolor: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
          }}
        >
          <Typography variant="caption" color="text.secondary" display="block">
            THE SECRET WORD WAS
          </Typography>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 900,
              color: '#38bdf8',
              letterSpacing: 2,
              textTransform: 'uppercase',
              mt: 0.5,
            }}
          >
            {result.word}
          </Typography>
        </Box>

        <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.1)' }} />

        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, color: '#cbd5e1' }}>
          Round Standings
        </Typography>

        <Stack spacing={1}>
          {sortedPlayers.map((p, idx) => {
            const delta = result.round_scores[String(p.id)] || 0;
            return (
              <Box
                key={p.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.04)',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  #{idx + 1} {p.display_name}
                </Typography>

                <Stack direction="row" spacing={1} alignItems="center">
                  {delta > 0 && (
                    <Chip
                      label={`+${delta} pts`}
                      color="success"
                      size="small"
                      sx={{ fontWeight: 800, height: 22 }}
                    />
                  )}
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#38bdf8' }}>
                    {p.score} pts
                  </Typography>
                </Stack>
              </Box>
            );
          })}
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 2.5 }}
        >
          {result.round_number < result.total_rounds
            ? 'Preparing next round & selecting next drawer...'
            : 'Calculating final game leaderboard...'}
        </Typography>
      </DialogContent>
    </Dialog>
  );
};
