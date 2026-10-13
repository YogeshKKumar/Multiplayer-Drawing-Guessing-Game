import React from 'react';
import { Box, LinearProgress, Stack, Typography, Chip } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

interface TimerBadgeProps {
  remainingSeconds: number;
  totalDurationSeconds: number;
  currentRound: number;
  totalRounds: number;
}

export const TimerBadge: React.FC<TimerBadgeProps> = ({
  remainingSeconds,
  totalDurationSeconds,
  currentRound,
  totalRounds,
}) => {
  const safeTotal = Math.max(1, totalDurationSeconds);
  const progress = Math.max(0, Math.min(100, (remainingSeconds / safeTotal) * 100));

  const isLow = remainingSeconds <= 10;
  const isWarning = remainingSeconds > 10 && remainingSeconds <= 20;

  const badgeColor = isLow ? 'error' : isWarning ? 'warning' : 'success';

  return (
    <Box sx={{ width: '100%' }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={2}
        sx={{ mb: 0.75 }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#e2e8f0' }}>
          Round {currentRound} of {totalRounds}
        </Typography>

        <Chip
          icon={<AccessTimeIcon />}
          label={`${remainingSeconds}s`}
          color={badgeColor}
          sx={{
            fontWeight: 800,
            fontSize: '0.95rem',
            px: 0.5,
          }}
        />
      </Stack>

      <LinearProgress
        variant="determinate"
        value={progress}
        color={badgeColor}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: 'rgba(255,255,255,0.1)',
        }}
      />
    </Box>
  );
};
