import { Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { WalletService } from './wallet.service';
import { FriendsService } from './friends.service';

export interface AuthResponse {
  token: string;
  email: string;
  pseudo: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private baseUrl = 'http://localhost:8080/api/auth';

  constructor(
    private http: HttpClient,
    private injector: Injector
  ) {}

  inscription(payload: { email: string; pseudo: string; motDePasse: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/register`, payload);
  }

  login(email: string, motDePasse: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, { email, motDePasse }).pipe(
      tap((res: AuthResponse) => {
        this.saveToken(res.token);
        localStorage.setItem('user', JSON.stringify(res));

        try {
          const walletService = this.injector.get(WalletService);
          walletService.connectSse();
          walletService.refreshBalance();
        } catch {}

        try {
          const friendsService = this.injector.get(FriendsService);
          friendsService.setOnline(true).subscribe();
        } catch {}
      })
    );
  }

  private saveToken(token: string) {
    localStorage.setItem('jwt', token);
  }

  getToken(): string | null {
    return localStorage.getItem('jwt');
  }

  logout() {
    localStorage.removeItem('jwt');
    localStorage.removeItem('user');

    try {
      const walletService = this.injector.get(WalletService);
      walletService.clear();
    } catch {}

    try {
      const friendsService = this.injector.get(FriendsService);
      friendsService.setOnline(false).subscribe();
    } catch {}
  }

  isLoggedIn(): boolean {
    return this.getToken() != null;
  }
}
