import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {environment} from '../../../environments/environment';

export interface RouletteBetRequest {
  betType: string;
  betValue: string;
  montant: number;
}

export interface RouletteBetResponse {
  number: number;
  color: string;
  win: boolean;
  montantJoue: number;
  montantGagne: number;
  solde: number;
}

@Injectable({
  providedIn: 'root'
})
export class RouletteService {
  private base = `${environment.apiBaseUrl}/game`;

  constructor(private http: HttpClient) {}

  jouerRoulette(req: RouletteBetRequest): Observable<RouletteBetResponse> {
    return this.http.post<RouletteBetResponse>(`${this.base}/roulette`, req);
  }

  updateProbabilities(weights: Record<number, number>): Observable<any> {
    return this.http.post(`${this.base}/roulette/probabilities`, weights);
  }

  getProbabilities(): Observable<{weights: Record<number, number> | null}> {
    return this.http.get<{weights: Record<number, number> | null}>(`${this.base}/roulette/probabilities`);
  }

  resetProbabilities(): Observable<any> {
    return this.http.delete(`${this.base}/roulette/probabilities`);
  }

  // get bias or other endpoints later
}
