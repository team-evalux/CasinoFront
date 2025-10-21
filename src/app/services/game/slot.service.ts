// src/app/services/game/slot.service.ts
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

// Config côté backend : symbols, reelWeights, reelsCount, payouts (map)
export interface SlotConfigResponse {
  symbols: string[];
  reelWeights: number[][];
  reelsCount: number;
  // JSON keys viennent en string (ex: { "5": 100, "4": 25, "3": 5 })
  payouts: { [k: string]: number } | null;
}

export interface SlotConfigRequest {
  symbols: string[];
  reelWeights: number[][];
  reelsCount: number;
  // facultatif : si présent, backend utilisera cette map
  payouts?: { [k: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class SlotService {
  private base = 'http://localhost:8080/api/game/slots';

  constructor(private http: HttpClient) {}

  // Machine à sous
  playSlots(req: SlotPlayRequest): Observable<SlotPlayResponse> {
    return this.http.post<SlotPlayResponse>(`${this.base}/play`, req);
  }

  getSlotsConfig(): Observable<SlotConfigResponse> {
    return this.http.get<SlotConfigResponse>(`${this.base}/config`);
  }

  // admin : update config (requires ADMIN)
  setSlotsConfig(cfg: SlotConfigRequest): Observable<SlotConfigResponse> {
    return this.http.post<SlotConfigResponse>(`${this.base}/config`, cfg);
  }
}
