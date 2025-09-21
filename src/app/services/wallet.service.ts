import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of } from 'rxjs';

export interface WalletDto {
  id: number;
  solde: number;
}

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private baseUrl = 'http://localhost:8080/api/wallet';
  private balanceSubject = new BehaviorSubject<number | null>(null);
  balance$ = this.balanceSubject.asObservable();

  private eventSource?: EventSource;
  private reconnectTimeout = 1000;

  // gestion des deltas optimistes
  private pendingDeltas: number[] = [];
  private reconcileTimer?: any;

  constructor(
    private http: HttpClient,
    private ngZone: NgZone
  ) {
    const token = localStorage.getItem('jwt');
    if (token) {
      // fetch initial authoritative balance + connect SSE
      this.refreshBalance().subscribe(() => {});
      this.connectSse();
    }
  }

  /**
   * Récupère le solde depuis le serveur (met à jour balanceSubject).
   * Retourne l'observable pour pouvoir chaîner si besoin.
   */
  public refreshBalance(): Observable<WalletDto | null> {
    return this.http.get<WalletDto>(`${this.baseUrl}/me`)
      .pipe(
        catchError(() => of(null))
      )
      .pipe((source$) => {
        // on s'abonne ici pour mettre à jour le subject et annuler pending deltas
        (source$ as Observable<WalletDto | null>).subscribe(w => {
          if (w && typeof w.solde === 'number') {
            // balance authoritative : on remplace totalement
            this.balanceSubject.next(w.solde);
            // on considère que le serveur a confirmé la situation -> on vide les deltas optimistes
            this.pendingDeltas.length = 0;
            if (this.reconcileTimer) {
              clearTimeout(this.reconcileTimer);
              this.reconcileTimer = undefined;
            }
          }
        });
        return source$ as Observable<WalletDto | null>;
      });
  }

  getMyWallet(): Observable<WalletDto> {
    return this.http.get<WalletDto>(`${this.baseUrl}/me`);
  }

  debit(montant: number): Observable<WalletDto> {
    return this.http.post<WalletDto>(`${this.baseUrl}/debit`, { montant });
  }

  credit(montant: number): Observable<WalletDto> {
    return this.http.post<WalletDto>(`${this.baseUrl}/credit`, { montant });
  }

  /**
   * Applique un delta de façon optimiste côté client et programme une réconciliation
   * avec le serveur. En multijoueur le SSE / refreshBalance corrigera si nécessaire.
   */
  public applyOptimisticDelta(delta: number) {
    if (typeof delta !== 'number' || delta === 0) return;

    this.pendingDeltas.push(delta);

    const current = this.balanceSubject.value;
    if (typeof current === 'number') {
      // update immédiat visible dans le header
      this.balanceSubject.next(current + delta);
    } else {
      // si on ne connaît pas le solde on déclenche un refresh pour obtenir la base
      this.refreshBalance().subscribe(() => {
        // une fois la base récupérée, on laisse la réconciliation s'occuper d'appliquer/vider
      });
    }

    // programme une réconciliation authoritative dans un court délai
    this.scheduleReconcile();
  }

  private scheduleReconcile(delay = 1500) {
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer);
    }
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = undefined;
      // on demande la valeur autoritaire du serveur (cela videra pendingDeltas si différent)
      this.refreshBalance().subscribe();
    }, delay);
  }

  connectSse() {
    const token = localStorage.getItem('jwt');
    if (!token) return;

    const url = `${this.baseUrl}/stream?token=${encodeURIComponent(token)}`;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('wallet-update', (ev: any) => {
      this.ngZone.run(() => {
        try {
          const data = JSON.parse(ev.data);
          if (data && typeof data.solde === 'number') {
            // SSE authoritative -> on replace et on annule deltas optimistes
            this.balanceSubject.next(data.solde);
            this.pendingDeltas.length = 0;
            if (this.reconcileTimer) {
              clearTimeout(this.reconcileTimer);
              this.reconcileTimer = undefined;
            }
          }
        } catch (e) {
          // ignore parse erreurs
        }
      });
    });

    this.eventSource.onopen = () => {
      this.reconnectTimeout = 1000;
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = undefined;
      setTimeout(() => this.connectSse(), this.reconnectTimeout);
      this.reconnectTimeout = Math.min(this.reconnectTimeout * 2, 30000);
    };
  }

  disconnectSse() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
  }

  clear() {
    this.balanceSubject.next(null);
    this.disconnectSse();
    this.pendingDeltas.length = 0;
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }
  }
}
