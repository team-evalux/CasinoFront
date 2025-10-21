import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SlotPlayRequest {
  montant: number;
  reelsCount?: number;
}
export interface SlotPlayResponse {
  reels: string[];
  montantJoue: number;
  montantGagne: number;
  win: boolean;
  solde: number;
}

export interface SlotConfigResponse {
  symbols: string[];
  reelWeights: number[][];
  reelsCount: number;
  payouts: { [k: string]: number } | null;
  symbolValues?: { [symbol: string]: number } | null;
}

export interface SlotConfigRequest {
  symbols: string[];
  reelWeights: number[][];
  reelsCount: number;
  payouts?: { [k: string]: number };
  symbolValues?: { [symbol: string]: number };
}

@Injectable({ providedIn: 'root' })
export class SlotService {
  private base = 'http://localhost:8080/api/game/slots';

  constructor(private http: HttpClient) {}

  playSlots(req: SlotPlayRequest): Observable<SlotPlayResponse> {
    return this.http.post<SlotPlayResponse>(`${this.base}/play`, req);
  }

  // ---------- SURCHARGES ICI ----------
  getSlotsConfig(reelsCount: number): Observable<SlotConfigResponse>;
  getSlotsConfig(): Observable<Record<number, SlotConfigResponse>>;
  getSlotsConfig(reelsCount?: number): Observable<SlotConfigResponse | Record<number, SlotConfigResponse>> {
    if (reelsCount != null) {
      return this.http.get<SlotConfigResponse>(`${this.base}/config?reelsCount=${reelsCount}`);
    }
    return this.http.get<Record<number, SlotConfigResponse>>(`${this.base}/config`);
  }
  // ------------------------------------

  setSlotsConfig(cfg: SlotConfigRequest): Observable<SlotConfigResponse> {
    return this.http.post<SlotConfigResponse>(`${this.base}/config`, cfg);
  }
}
