import axios from 'axios';
import {
  GameHistoryItem,
  JoinRoomResponse,
  LeaderboardEntry,
  PlayerStats,
  RoomDetail,
} from '../types/game';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function createRoom(
  displayName: string,
  totalRounds: number = 3,
  roundDurationSeconds: number = 60
): Promise<JoinRoomResponse> {
  const res = await apiClient.post<JoinRoomResponse>('/api/rooms', {
    display_name: displayName,
    total_rounds: totalRounds,
    round_duration_seconds: roundDurationSeconds,
  });
  return res.data;
}

export async function joinRoom(
  roomCode: string,
  displayName: string,
  playerId?: number
): Promise<JoinRoomResponse> {
  const res = await apiClient.post<JoinRoomResponse>(
    `/api/rooms/${roomCode.trim().toUpperCase()}/join`,
    {
      display_name: displayName,
      player_id: playerId ?? null,
    }
  );
  return res.data;
}

export async function addPracticeBot(roomCode: string): Promise<RoomDetail> {
  const res = await apiClient.post<RoomDetail>(
    `/api/rooms/${roomCode.trim().toUpperCase()}/bot`
  );
  return res.data;
}

export async function leaveRoom(roomCode: string, playerId: number): Promise<void> {
  await apiClient.post(`/api/rooms/${roomCode.trim().toUpperCase()}/leave`, {
    player_id: playerId,
  });
}

export async function getRoomInfo(roomCode: string): Promise<RoomDetail> {
  const res = await apiClient.get<RoomDetail>(
    `/api/rooms/${roomCode.trim().toUpperCase()}`
  );
  return res.data;
}

export async function getGameHistory(
  limit: number = 20,
  includeActive: boolean = false
): Promise<{ total: number; games: GameHistoryItem[] }> {
  const res = await apiClient.get<{ total: number; games: GameHistoryItem[] }>(
    '/api/games/history',
    {
      params: { limit, include_active: includeActive },
    }
  );
  return res.data;
}

export async function getLeaderboard(
  roomCode?: string,
  limit: number = 20
): Promise<LeaderboardEntry[]> {
  const res = await apiClient.get<{ entries: LeaderboardEntry[] }>('/api/leaderboard', {
    params: { room_code: roomCode || undefined, limit },
  });
  return res.data.entries;
}

export async function getPlayerStats(displayName: string): Promise<PlayerStats> {
  const res = await apiClient.get<PlayerStats>(
    `/api/players/stats/${encodeURIComponent(displayName.trim())}`
  );
  return res.data;
}

export function buildWebSocketUrl(roomCode: string, playerId: number): string {
  const cleanBase = WS_BASE_URL.replace(/\/$/, '');
  return `${cleanBase}/ws/${roomCode.trim().toUpperCase()}/${playerId}`;
}
