import type { BattleReportPayload, Difficulty, GameContent, GameMode } from '../game/types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/** Server-side record of one match: its settings, final result and battle reports. */
export interface MatchRecord {
  id: string
  name: string
  mode: GameMode
  seed: number | null
  scenario: string | null
  difficulty: Difficulty
  status: 'active' | 'victory' | 'defeat'
  game_time: number
  summary: Record<string, number>
}

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError('Cannot reach the game server. Is Django running on port 8000?')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(`Server error ${res.status}: ${text.slice(0, 200)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  content: () => request<GameContent>('/content/'),
  createCampaign: (body: { name: string; mode: GameMode; seed: number | null; scenario: string | null; difficulty: Difficulty; state: null }) =>
    request<MatchRecord>('/campaigns/', { method: 'POST', body: JSON.stringify(body) }),
  saveCampaign: (id: string, body: Partial<Pick<MatchRecord, 'game_time' | 'status' | 'summary'>>) =>
    request<MatchRecord>(`/campaigns/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  postReport: (id: string, report: BattleReportPayload) =>
    request(`/campaigns/${id}/battle-reports/`, { method: 'POST', body: JSON.stringify(report) }),
}
