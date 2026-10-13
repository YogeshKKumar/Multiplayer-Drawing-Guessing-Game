import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  Snackbar,
  Alert,
  Box,
} from '@mui/material';
import {
  addPracticeBot,
  buildWebSocketUrl,
  createRoom,
  getRoomInfo,
  joinRoom,
  leaveRoom,
} from './services/api';
import {
  ChatFeedItem,
  DrawStrokePayload,
  FloatingReaction,
  PlayerInfo,
  RoomDetail,
  RoundResultSummary,
  WebSocketEnvelope,
} from './types/game';
import { JoinCreateRoom } from './components/JoinCreateRoom';
import { LobbyScreen } from './components/LobbyScreen';
import { GameRoomScreen } from './components/GameRoomScreen';
import { FinalLeaderboard } from './components/FinalLeaderboard';
import { soundFX } from './utils/sound';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#38bdf8',
    },
    secondary: {
      main: '#a855f7',
    },
    background: {
      default: '#0b1120',
      paper: '#1e293b',
    },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h3: {
      fontFamily: "'Fredoka', sans-serif",
    },
    h4: {
      fontFamily: "'Fredoka', sans-serif",
    },
    h5: {
      fontFamily: "'Fredoka', sans-serif",
    },
  },
  shape: {
    borderRadius: 12,
  },
});

const SESSION_STORAGE_KEY = 'sketchsync_session_v1';

export const App: React.FC = () => {
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Real-time game state
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [secretWord, setSecretWord] = useState<string | null>(null);
  const [wordHint, setWordHint] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(60);
  const [strokes, setStrokes] = useState<DrawStrokePayload[]>([]);
  const [feed, setFeed] = useState<ChatFeedItem[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [roundPoints, setRoundPoints] = useState<Record<string, number>>({});
  const [roundResult, setRoundResult] = useState<RoundResultSummary | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const intentionalCloseRef = useRef<boolean>(false);

  const appendFeedItem = useCallback((item: Omit<ChatFeedItem, 'id' | 'timestamp'>) => {
    setFeed((prev) => [
      ...prev.slice(-150),
      {
        ...item,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const spawnFloatingReaction = useCallback((emoji: string, playerName: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const leftPercent = Math.floor(20 + Math.random() * 60);
    setFloatingReactions((prev) => [...prev.slice(-12), { id, emoji, playerName, leftPercent }]);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
    }, 2300);
  }, []);

  const sendWsEvent = useCallback((event: string, data: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
    }
  }, []);

  // Restore session on page reload if still active
  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as {
        roomCode: string;
        playerId: number;
        displayName: string;
      };
      if (saved.roomCode && saved.playerId && saved.displayName) {
        setLoading(true);
        joinRoom(saved.roomCode, saved.displayName, saved.playerId)
          .then((res) => {
            setRoom(res.room);
            setCurrentPlayer(res.player);
          })
          .catch(() => {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
          })
          .finally(() => setLoading(false));
      }
    } catch {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  // Connect & maintain WebSocket whenever `room.room_code` and `currentPlayer.id` are active
  useEffect(() => {
    if (!room || !currentPlayer || room.status === 'finished') {
      return;
    }

    intentionalCloseRef.current = false;
    const roomCode = room.room_code;
    const playerId = currentPlayer.id;

    const connectWebSocket = () => {
      if (intentionalCloseRef.current) return;

      const url = buildWebSocketUrl(roomCode, playerId);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const message = JSON.parse(evt.data) as WebSocketEnvelope<any>;
          const { event, data } = message;

          switch (event) {
            case 'sync_state': {
              if (data.room) {
                setRoom(data.room);
                setWordHint(data.room.word_hint || null);
                setRemainingSeconds(
                  data.room.remaining_seconds || data.room.round_duration_seconds || 60
                );
              }
              if (data.you) {
                setCurrentPlayer(data.you);
              }
              if (Array.isArray(data.strokes)) {
                setStrokes(data.strokes);
              }
              break;
            }

            case 'player_joined':
            case 'player_connected': {
              soundFX.playPop();
              setRoom((prev) =>
                prev
                  ? {
                      ...prev,
                      host_player_id: data.host_player_id ?? prev.host_player_id,
                      players: data.players || prev.players,
                      active_player_count: (data.players || prev.players).length,
                    }
                  : prev
              );
              appendFeedItem({
                type: 'system',
                text: `${data.display_name} ${
                  event === 'player_connected' ? 'reconnected to' : 'joined'
                } the room.`,
              });
              break;
            }

            case 'player_disconnected':
            case 'player_left': {
              setRoom((prev) =>
                prev
                  ? {
                      ...prev,
                      host_player_id: data.host_player_id ?? prev.host_player_id,
                      players: data.players || prev.players,
                      active_player_count: (data.players || prev.players).length,
                    }
                  : prev
              );
              appendFeedItem({
                type: 'system',
                text: `${data.display_name} ${
                  event === 'player_left' ? 'left the room.' : 'disconnected.'
                }`,
              });
              break;
            }

            case 'ready_status_changed': {
              soundFX.playPop();
              setRoom((prev) =>
                prev
                  ? {
                      ...prev,
                      players: data.players || prev.players,
                    }
                  : prev
              );
              break;
            }

            case 'game_started': {
              setRoundResult(null);
              setSecretWord(null);
              setStrokes([]);
              setRoom((prev) =>
                prev
                  ? {
                      ...prev,
                      status: 'playing',
                      started_at: data.started_at,
                      players: data.players || prev.players,
                    }
                  : prev
              );
              appendFeedItem({
                type: 'system',
                text: '🚀 Game started! Get ready to draw and guess!',
              });
              break;
            }

            case 'round_started': {
              soundFX.playRoundStart();
              setRoundResult(null);
              setSecretWord(null);
              setStrokes([]);
              setRoundPoints({});
              setWordHint(data.word_hint || null);
              setRemainingSeconds(data.remaining_seconds ?? data.duration_seconds ?? 60);
              setRoom((prev) =>
                prev
                  ? {
                      ...prev,
                      status: 'playing',
                      current_round: data.round_number,
                      total_rounds: data.total_rounds ?? prev.total_rounds,
                      drawer_player_id: data.drawer_player_id,
                      word_hint: data.word_hint,
                      word_length: data.word_length,
                      players: data.players || prev.players,
                    }
                  : prev
              );
              appendFeedItem({
                type: 'system',
                text: `🎨 Round ${data.round_number} started! ${data.drawer_name} is drawing now.`,
              });
              break;
            }

            case 'secret_word': {
              setSecretWord(data.word);
              break;
            }

            case 'hint_updated': {
              soundFX.playPop();
              setWordHint(data.word_hint || null);
              appendFeedItem({
                type: 'system',
                text: '💡 The drawer revealed a letter hint!',
              });
              break;
            }

            case 'draw_stroke': {
              setStrokes((prev) => [...prev, data as DrawStrokePayload]);
              break;
            }

            case 'stroke_undone': {
              soundFX.playClearOrUndo();
              if (Array.isArray(data.strokes)) {
                setStrokes(data.strokes);
              }
              break;
            }

            case 'canvas_cleared': {
              soundFX.playClearOrUndo();
              setStrokes([]);
              break;
            }

            case 'timer_tick': {
              setRemainingSeconds(data.remaining_seconds);
              if (data.remaining_seconds > 0 && data.remaining_seconds <= 10) {
                soundFX.playTimerUrgent();
              }
              break;
            }

            case 'guess_submitted': {
              appendFeedItem({
                type: data.is_close ? 'close' : 'guess',
                playerName: data.player_name,
                text: data.guess_text,
              });
              break;
            }

            case 'correct_guess': {
              soundFX.playCorrectGuess();
              spawnFloatingReaction('🎉', data.player_name);
              appendFeedItem({
                type: 'correct',
                playerName: data.player_name,
                text: `${data.player_name} guessed the secret word!`,
                pointsAwarded: data.points_awarded,
              });
              break;
            }

            case 'player_reaction': {
              soundFX.playPop();
              spawnFloatingReaction(data.emoji, data.player_name);
              appendFeedItem({
                type: 'reaction',
                playerName: data.player_name,
                text: `${data.player_name} reacted ${data.emoji}`,
              });
              break;
            }

            case 'score_update': {
              setRoundPoints(data.round_points || {});
              setRoom((prev) =>
                prev
                  ? {
                      ...prev,
                      players: data.players || prev.players,
                    }
                  : prev
              );
              break;
            }

            case 'round_ended': {
              setRoundResult(data as RoundResultSummary);
              setStrokes([]);
              setRoom((prev) =>
                prev
                  ? {
                      ...prev,
                      players: data.players || prev.players,
                    }
                  : prev
              );
              appendFeedItem({
                type: 'system',
                text: `⏰ Round ${data.round_number} ended! The word was "${String(
                  data.word
                ).toUpperCase()}".`,
              });
              break;
            }

            case 'game_ended': {
              soundFX.playGameEnd();
              setRoundResult(null);
              setSecretWord(null);
              setStrokes([]);
              getRoomInfo(roomCode)
                .then((updatedRoom) => setRoom(updatedRoom))
                .catch(() => {
                  setRoom((prev) =>
                    prev
                      ? {
                          ...prev,
                          status: 'finished',
                          ended_at: data.ended_at,
                          winner: data.winner,
                          players: data.leaderboard || prev.players,
                        }
                      : prev
                  );
                });
              break;
            }

            case 'error': {
              if (data?.message) {
                setToast(data.message);
              }
              break;
            }

            default:
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!intentionalCloseRef.current) {
          reconnectTimerRef.current = window.setTimeout(() => {
            connectWebSocket();
          }, 2000);
        }
      };
    };

    connectWebSocket();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [room?.room_code, room?.status, currentPlayer?.id, appendFeedItem, spawnFloatingReaction]);

  const handleToggleSound = () => {
    soundFX.muted = !soundMuted;
    setSoundMuted(!soundMuted);
  };

  const handleCreateRoom = async (
    displayName: string,
    totalRounds: number,
    roundDuration: number
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await createRoom(displayName, totalRounds, roundDuration);
      setRoom(res.room);
      setCurrentPlayer(res.player);
      setFeed([]);
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: res.room.room_code,
          playerId: res.player.id,
          displayName: res.player.display_name,
        })
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.detail || 'Failed to create room. Please check backend connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (roomCode: string, displayName: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await joinRoom(roomCode, displayName);
      setRoom(res.room);
      setCurrentPlayer(res.player);
      setFeed([]);
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: res.room.room_code,
          playerId: res.player.id,
          displayName: res.player.display_name,
        })
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.detail || 'Unable to join room. Verify the room code and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveOrReset = async () => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (wsRef.current) {
      sendWsEvent('leave_room');
      wsRef.current.close();
      wsRef.current = null;
    }
    if (room && currentPlayer && room.status !== 'finished') {
      try {
        await leaveRoom(room.room_code, currentPlayer.id);
      } catch {
        // ignore if already left
      }
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setRoom(null);
    setCurrentPlayer(null);
    setSecretWord(null);
    setWordHint(null);
    setStrokes([]);
    setFeed([]);
    setRoundResult(null);
  };

  const handleToggleReady = (isReady: boolean) => {
    sendWsEvent('player_ready', { is_ready: isReady });
  };

  const handleAddBot = async () => {
    if (!room) return;
    try {
      const updatedRoom = await addPracticeBot(room.room_code);
      setRoom(updatedRoom);
    } catch (err: any) {
      setToast(err?.response?.data?.detail || 'Could not add practice bot.');
    }
  };

  const handleStartGame = () => {
    sendWsEvent('start_game', {});
  };

  const handleEmitStroke = (stroke: DrawStrokePayload) => {
    setStrokes((prev) => [...prev, stroke]);
    sendWsEvent('draw_stroke', stroke as unknown as Record<string, unknown>);
  };

  const handleUndoStroke = (strokeId?: string) => {
    sendWsEvent('undo_stroke', strokeId ? { stroke_id: strokeId } : {});
  };

  const handleClearCanvas = () => {
    setStrokes([]);
    sendWsEvent('clear_canvas', {});
  };

  const handleRevealHint = () => {
    sendWsEvent('reveal_hint', {});
  };

  const handleSubmitGuess = (guessText: string) => {
    sendWsEvent('submit_guess', { guess_text: guessText });
  };

  const handleSendReaction = (emoji: string) => {
    sendWsEvent('send_reaction', { emoji });
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh' }}>
        {!room || !currentPlayer ? (
          <JoinCreateRoom
            loading={loading}
            error={error}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
          />
        ) : room.status === 'waiting' ? (
          <LobbyScreen
            room={room}
            currentPlayer={currentPlayer}
            onToggleReady={handleToggleReady}
            onAddBot={handleAddBot}
            onStartGame={handleStartGame}
            onLeaveRoom={handleLeaveOrReset}
          />
        ) : room.status === 'playing' ? (
          <GameRoomScreen
            room={room}
            currentPlayer={currentPlayer}
            wsConnected={wsConnected}
            soundMuted={soundMuted}
            secretWord={secretWord}
            wordHint={wordHint}
            remainingSeconds={remainingSeconds}
            strokes={strokes}
            feed={feed}
            floatingReactions={floatingReactions}
            roundPoints={roundPoints}
            roundResult={roundResult}
            onToggleSound={handleToggleSound}
            onEmitStroke={handleEmitStroke}
            onUndoStroke={handleUndoStroke}
            onClearCanvas={handleClearCanvas}
            onRevealHint={handleRevealHint}
            onSubmitGuess={handleSubmitGuess}
            onSendReaction={handleSendReaction}
            onLeaveRoom={handleLeaveOrReset}
          />
        ) : (
          <FinalLeaderboard
            roomCode={room.room_code}
            players={room.players}
            winner={room.winner}
            rounds={room.rounds}
            currentPlayerId={currentPlayer.id}
            onBackToHome={handleLeaveOrReset}
          />
        )}

        <Snackbar
          open={Boolean(toast)}
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="warning" variant="filled" onClose={() => setToast(null)}>
            {toast}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
};

export default App;
