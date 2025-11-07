import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MinesStartRequest { montant: number; mines: number; }
export interface MinesStartResponse {
  sessionId: string; gridSize: number; mines: number;
  safeMax: number; safeCount: number; nextMultiplier: number; solde: number;
}
export interface MinesPickRequest { sessionId: string; index: number; }
export interface MinesPickResponse {
  bomb: boolean; index: number; safeCount: number; mines: number;
  currentMultiplier: number; potentialPayout: number; finished: boolean;
  bombs: number[];
}
export interface MinesCashoutRequest { sessionId: string; }
export interface MinesCashoutResponse {
  ok: boolean; safeCount: number; multiplier: number; payout: number; solde: number;
  bombs: number[];
}
export interface MinesConfigResponse {
  gridSize: number; mines: number; houseEdge: number; multipliers: { [k:number]: number };
}

@Injectable({ providedIn: 'root' })
export class MinesService {
  private baseUrl = `${environment.apiBaseUrl}/game/mines`;
  constructor(private http: HttpClient) {}
  
  start(req: MinesStartRequest): Observable<MinesStartResponse> {
    return this.http.post<MinesStartResponse>(`${this.baseUrl}/start`, req);
  }
  pick(req: MinesPickRequest): Observable<MinesPickResponse> {
    return this.http.post<MinesPickResponse>(`${this.baseUrl}/pick`, req);
  }
  cashout(req: MinesCashoutRequest): Observable<MinesCashoutResponse> {
    return this.http.post<MinesCashoutResponse>(`${this.baseUrl}/cashout`, req);
  }
  reset(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/reset`);
  }

  resume(): Observable<any> {
    return this.http.get(`${this.baseUrl}/resume`);
  }

}
