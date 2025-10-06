import { Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { WalletService } from './wallet.service';

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

  /**
   * ÉTAPE 1 INSCRIPTION : envoi du code à l'email.
   */
  inscriptionSendCode(data: { email: string; pseudo: string }) {
    return this.http.post(`${this.baseUrl}/register/send-code`, data);
  }

  /**
   * ÉTAPE 2 INSCRIPTION : validation du code + création du compte.
   * -> renvoie AuthResponse, on persiste le token + user et on démarre le Wallet SSE.
   */
  inscriptionComplete(payload: { email: string; pseudo: string; motDePasse: string; code: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/register/verify`, payload).pipe(
      tap((res: AuthResponse) => this.afterLoginLike(res))
    );
  }

  /**
   * MOT DE PASSE OUBLIÉ : envoi du code.
   */
  forgotSendCode(email: string) {
    return this.http.post(`${this.baseUrl}/forgot/send-code`, { email });
  }

  /**
   * MOT DE PASSE OUBLIÉ : reset avec code + nouveau mot de passe.
   */
  forgotReset(email: string, code: string, nouveauMotDePasse: string) {
    return this.http.post(`${this.baseUrl}/forgot/reset`, { email, code, nouveauMotDePasse });
  }

  /**
   * Login classique (inchangé, mais factorisé via afterLoginLike).
   */
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
  }

  isLoggedIn(): boolean {
    return this.getToken() != null;
  }
}
