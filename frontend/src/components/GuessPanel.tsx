import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
  Chip,
  Tooltip,
  IconButton,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import CelebrationIcon from '@mui/icons-material/Celebration';
import { ChatFeedItem } from '../types/game';

const REACTION_EMOJIS = ['👏', '😂', '🔥', '🤔', '🎨', '🤯', '🎉', '❤️'];

interface GuessPanelProps {
  feed: ChatFeedItem[];
  isDrawer: boolean;
  hasGuessedCurrentRound: boolean;
  isRoundActive: boolean;
  onSubmitGuess: (guessText: string) => void;
  onSendReaction: (emoji: string) => void;
}

export const GuessPanel: React.FC<GuessPanelProps> = ({
  feed,
  isDrawer,
  hasGuessedCurrentRound,
  isRoundActive,
  onSubmitGuess,
  onSendReaction,
}) => {
  const [guessText, setGuessText] = useState('');
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed]);

  const canGuess = isRoundActive && !isDrawer && !hasGuessedCurrentRound;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = guessText.trim();
    if (!trimmed || !canGuess) return;
    onSubmitGuess(trimmed);
    setGuessText('');
  };

  let placeholderText = 'Type your guess here...';
  if (!isRoundActive) {
    placeholderText = 'Waiting for next round...';
  } else if (isDrawer) {
    placeholderText = 'You are drawing this round!';
  } else if (hasGuessedCurrentRound) {
    placeholderText = 'Solved! Waiting for other players...';
  }

  return (
    <Paper
      elevation={8}
      sx={{
        p: 2,
        borderRadius: 4,
        bgcolor: 'rgba(30, 41, 59, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        height: 560,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <ChatIcon sx={{ color: '#38bdf8' }} />
          <Typography
            variant="subtitle1"
            sx={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 700 }}
          >
            Live Guesses & Chat
          </Typography>
        </Stack>
        {hasGuessedCurrentRound && (
          <Chip
            label="SOLVED!"
            color="success"
            size="small"
            sx={{ fontWeight: 900, height: 22 }}
          />
        )}
      </Stack>

      {/* Scrollable Feed */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          pr: 0.5,
          mb: 1.5,
        }}
      >
        {feed.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: 'center', mt: 6 }}
          >
            No guesses yet! Watch the canvas and be the first to solve the word for bonus points!
          </Typography>
        ) : (
          feed.map((item) => {
            if (item.type === 'correct') {
              return (
                <Box
                  key={item.id}
                  sx={{
                    p: 1.2,
                    borderRadius: 2.5,
                    background:
                      'linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(16, 185, 129, 0.12))',
                    border: '1px solid rgba(74, 222, 128, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CelebrationIcon sx={{ color: '#4ade80', fontSize: 18 }} />
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#4ade80' }}>
                      {item.text}
                    </Typography>
                  </Stack>
                  {item.pointsAwarded ? (
                    <Chip
                      label={`+${item.pointsAwarded}`}
                      size="small"
                      color="success"
                      sx={{ height: 22, fontWeight: 900 }}
                    />
                  ) : null}
                </Box>
              );
            }

            if (item.type === 'reaction') {
              return (
                <Box
                  key={item.id}
                  sx={{
                    px: 1.2,
                    py: 0.6,
                    borderRadius: 2,
                    bgcolor: 'rgba(168, 85, 247, 0.14)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#e9d5ff', fontWeight: 700 }}>
                    {item.text}
                  </Typography>
                </Box>
              );
            }

            if (item.type === 'system') {
              return (
                <Box
                  key={item.id}
                  sx={{
                    px: 1.2,
                    py: 0.7,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(56, 189, 248, 0.1)',
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#93c5fd', fontWeight: 600 }}>
                    {item.text}
                  </Typography>
                </Box>
              );
            }

            return (
              <Box
                key={item.id}
                sx={{
                  px: 1.5,
                  py: 0.85,
                  borderRadius: 2,
                  bgcolor:
                    item.type === 'close'
                      ? 'rgba(234, 179, 8, 0.18)'
                      : 'rgba(255, 255, 255, 0.04)',
                  border:
                    item.type === 'close'
                      ? '1px solid rgba(250, 204, 21, 0.45)'
                      : '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                <Typography variant="body2" sx={{ color: '#f1f5f9' }}>
                  <Box component="span" sx={{ fontWeight: 800, color: '#38bdf8', mr: 1 }}>
                    {item.playerName}:
                  </Box>
                  {item.text}
                </Typography>
                {item.type === 'close' && (
                  <Typography
                    variant="caption"
                    sx={{ color: '#facc15', fontWeight: 800, display: 'block', mt: 0.3 }}
                  >
                    🔥 So close! Only 1 letter off!
                  </Typography>
                )}
              </Box>
            );
          })
        )}
        <div ref={feedEndRef} />
      </Box>

      {/* Quick Arcade Emoji Reactions Bar */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          mb: 1.2,
          px: 1,
          py: 0.4,
          borderRadius: 2,
          bgcolor: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {REACTION_EMOJIS.map((emoji) => (
          <Tooltip title={`React ${emoji}`} key={emoji}>
            <IconButton
              size="small"
              onClick={() => onSendReaction(emoji)}
              sx={{
                fontSize: '1.1rem',
                p: 0.5,
                transition: 'transform 0.15s ease',
                '&:hover': { transform: 'scale(1.3)' },
              }}
            >
              {emoji}
            </IconButton>
          </Tooltip>
        ))}
      </Stack>

      {/* Guess Input Form */}
      <Box component="form" onSubmit={handleSubmit}>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            disabled={!canGuess}
            value={guessText}
            onChange={(e) => setGuessText(e.target.value)}
            placeholder={placeholderText}
            inputProps={{ maxLength: 100 }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                bgcolor: 'rgba(15, 23, 42, 0.6)',
              },
            }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={!canGuess || !guessText.trim()}
            endIcon={<SendIcon />}
            sx={{
              px: 2.5,
              fontWeight: 800,
              borderRadius: 2.5,
              fontFamily: "'Fredoka', sans-serif",
            }}
          >
            Guess
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
};
