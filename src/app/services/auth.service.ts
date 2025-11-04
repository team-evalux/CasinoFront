// auth.service.ts
import { Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, BehaviorSubject } from 'rxjs';
import { WalletService } from './wallet.service';
import { environment } from '../../environments/environment';

export interface AuthResponse {
  token: string;
  email: string;
  pseudo: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private baseUrl = `${environment.apiBaseUrl}/auth`;

  // ✅ nouvel observable d’état
  private loggedInSubject = new BehaviorSubject<boolean>(this.isLoggedIn());
  loggedIn$ = this.loggedInSubject.asObservable();

  constructor(
    private http: HttpClient,
    private injector: Injector
  ) {}

  inscriptionSendCode(data: { email: string; pseudo: string }) {
    return this.http.post(`${this.baseUrl}/register/send-code`, data);
  }

  inscriptionComplete(payload: { email: string; pseudo: string; motDePasse: string; code: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/register/verify`, payload).pipe(
      tap((res: AuthResponse) => this.afterLoginLike(res))
    );
  }

  forgotSendCode(email: string) {
    return this.http.post(`${this.baseUrl}/forgot/send-code`, { email });
  }

  forgotReset(email: string, code: string, nouveauMotDePasse: string) {
    return this.http.post(`${this.baseUrl}/forgot/reset`, { email, code, nouveauMotDePasse });
  }

  login(email: string, motDePasse: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, { email, motDePasse }).pipe(
      tap((res: AuthResponse) => this.afterLoginLike(res))
    );
  }

  // ---------- Helpers token / session ----------
  private afterLoginLike(res: AuthResponse) {
    this.saveToken(res.token);
    localStorage.setItem('user', JSON.stringify(res));
    try {
      const walletService = this.injector.get(WalletService);
      walletService.connectSse();
      walletService.refreshBalance();
    } catch { /* ignore */ }

    // ✅ notifie immédiatement le Header que l’utilisateur est loggé
    this.loggedInSubject.next(true);
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
    } catch { /* ignore */ }

    // ✅ notifie la déconnexion
    this.loggedInSubject.next(false);
  }

  isLoggedIn(): boolean {
    return this.getToken() != null;
  }
}
