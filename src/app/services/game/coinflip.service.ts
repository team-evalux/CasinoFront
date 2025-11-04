// src/app/services/game.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {environment} from '../../../environments/environment';




export interface CoinFlipRequest {
  choix: 'pile' | 'face';
  montant: number;
}

export interface CoinFlipResponse {
  outcome: 'pile' | 'face';
  win: boolean;
  montantJoue: number;
  montantGagne: number;
  solde: number;
}

@Injectable({
  providedIn: 'root'
})
export class CoinflipService {
  private base = `${environment.apiBaseUrl}/game`;


  constructor(private http: HttpClient) {}

  jouerPiece(req: CoinFlipRequest): Observable<CoinFlipResponse> {
    return this.http.post<CoinFlipResponse>(`${this.base}/coinflip`, req);
  }

  getBias(): Observable<{ probPile: number }> {
    return this.http.get<{ probPile: number }>(`${this.base}/coinflip/bias`);
  }

  setBias(probPile: number) {
    return this.http.post(`${this.base}/coinflip/bias`, { probPile });
  }
}
