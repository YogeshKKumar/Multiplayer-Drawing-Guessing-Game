export type DrawToolType =
  | 'brush'
  | 'marker'
  | 'spray'
  | 'line'
  | 'rect'
  | 'circle'
  | 'fill'
  | 'eraser';

export interface PlayerInfo {
  id: number;
  room_id: number;
  display_name: string;
  score: number;
  joined_at: string;
  left_at?: string | null;
  is_ready: boolean;
  is_connected: boolean;
  is_host: boolean;
  is_drawer: boolean;
  has_guessed_current_round: boolean;
}

export interface RoundPublicInfo {
  id: number;
  room_id: number;
  round_number: number;
  drawer_player_id: number;
  drawer_name?: string | null;
  word?: string | null;
  word_hint: string;
  word_length: number;
  started_at: string;
  ended_at?: string | null;
}

export interface RoomDetail {
  id: number;
  room_code: string;
  status: 'waiting' | 'playing' | 'finished';
  current_round: number;
  total_rounds: number;
  round_duration_seconds: number;
  min_players: number;
  host_player_id?: number | null;
  drawer_player_id?: number | null;
  remaining_seconds: number;
  word_hint?: string | null;
  word_length?: number | null;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
  players: PlayerInfo[];
  active_player_count: number;
  rounds: RoundPublicInfo[];
  winner?: PlayerInfo | null;
}

export interface JoinRoomResponse {
  room: RoomDetail;
  player: PlayerInfo;
}

export interface StrokePoint {
  x: number;
  y: number;
}

export interface DrawStrokePayload {
  stroke_id?: string;
  drawer_player_id?: number;
  tool: DrawToolType;
  color: string;
  brush_size: number;
  filled?: boolean;
  opacity?: number;
  points: StrokePoint[];
}

export interface ChatFeedItem {
  id: string;
  type: 'guess' | 'correct' | 'system' | 'close' | 'reaction';
  playerName?: string;
  text: string;
  timestamp: string;
  pointsAwarded?: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  playerName: string;
  leftPercent: number;
}

export interface RoundResultSummary {
  round_number: number;
  total_rounds: number;
  word: string;
  reason: string;
  round_scores: Record<string, number>;
  correct_guesser_ids: number[];
  players: PlayerInfo[];
}

export interface GameHistoryItem {
  id: number;
  room_code: string;
  status: string;
  total_rounds: number;
  player_count: number;
  winner_name?: string | null;
  winner_score?: number | null;
  secret_words: string[];
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: number;
  display_name: string;
  score: number;
  room_code: string;
  game_ended_at?: string | null;
}

export interface PlayerStats {
  display_name: string;
  games_played: number;
  games_won: number;
  total_score: number;
  highest_score: number;
  average_score: number;
  total_guesses: number;
  correct_guesses: number;
  guess_accuracy_percent: number;
  rounds_drawn: number;
}

export interface WebSocketEnvelope<T = Record<string, unknown>> {
  event: string;
  data: T;
  timestamp?: string;
}
