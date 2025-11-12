import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LeaderboardEntry {
  rang: number;
  pseudo: string;
  solde: number;
}

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private base = `${environment.apiBaseUrl}/leaderboard`;

  constructor(private http: HttpClient) {}

  getTop(limit: number = 50): Observable<LeaderboardEntry[]> {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<LeaderboardEntry[]>(this.base, { params });
  }
}
