import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { WalletService } from '../services/wallet.service';
import { BalanceHeaderComponent } from './balance-header.component';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, BalanceHeaderComponent, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  email = '';
  motDePasse = '';
  loading = false;
  error: string | null = null;
  userObj: { email?: string; pseudo?: string } | null = null;

  // Bonus simple (reset chaque jour à 21h30 Paris)
  readonly RESET_HOUR = 21;
  readonly RESET_MIN = 37;
  readonly PARIS_TZ = 'Europe/Paris';
  readonly STORAGE_KEY = 'bonus.simple.lastClaim.parisMs';
  readonly CREDIT_AMOUNT = 1000;

  bonusLoading = false;
  bonusMsg: string | null = null;
  private tickSub?: Subscription;

  constructor(
    private authService: AuthService,
    private wallet: WalletService,
    private http: HttpClient,
    protected router: Router
  ) {
    this.loadUser();
  }

  ngOnInit(): void {
    // met à jour l’état du bouton toutes les secondes
    this.tickSub = interval(1000).subscribe(() => {});
  }

  ngOnDestroy(): void {
    this.tickSub?.unsubscribe();
  }

  // ---------- Auth ----------
  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  loadUser() {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        this.userObj = JSON.parse(u);
      } catch {
        this.userObj = null;
      }
    } else {
      this.userObj = null;
    }
  }

  submitLogin() {
    this.error = null;
    if (!this.email || !this.motDePasse) {
      this.error = 'Email et mot de passe requis.';
      return;
    }
    this.loading = true;
    this.authService.login(this.email, this.motDePasse).subscribe({
      next: () => {
        this.loading = false;
        this.error = null;
        this.loadUser();
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error || 'Identifiants invalides';
      }
    });
  }

  logout() {
    this.authService.logout();
    this.wallet.clear?.();
    this.loadUser();
    this.router.navigate(['/home']);
  }

  // ---------- Bonus bouton ----------
  get canClaim(): boolean {
    if (!this.isLoggedIn()) return false;
    const nowParis = this.parisNowMs();
    const windowStart = this.lastResetMs(nowParis);
    const lastClaim = this.getLastClaimParisMs();
    return lastClaim == null || lastClaim < windowStart;
  }

  get giftTooltip(): string {
    if (!this.isLoggedIn()) return 'Connecte-toi pour le bonus';
    if (this.canClaim) return 'Bonus disponible (21:30 Paris). Clique pour +1000';
    const next = this.nextResetFromNow();
    const remain = this.countdownStr(next - this.parisNowMs());
    return `Prochain à 21:30 (Paris) — dans ${remain}`;
  }

  onClickGift() {
    if (!this.canClaim || this.bonusLoading) return;
    if (!this.isLoggedIn()) {
      this.toast('Connecte-toi pour réclamer le bonus.');
      return;
    }

    this.bonusLoading = true;

    this.http.post<{ amount:number, solde:number }>('http://localhost:8080/api/bonus/claim', {})
      .subscribe({
        next: res => {
          // 💾 enregistre immédiatement la date du dernier claim
          const nowParis = this.parisNowMs();
          this.setLastClaimParisMs(nowParis);

          this.wallet.refreshBalance();
          this.toast(`+${res.amount} crédits ajoutés !`);
          this.bonusLoading = false;
        },
        error: err => {
          this.toast(err?.error?.error || "Bonus déjà réclamé.");
          this.bonusLoading = false;
        }
      });
  }


  // ---------- Helpers Paris time ----------
  private parisParts(d = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.PARIS_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
      .formatToParts(d)
      .reduce((acc: any, p) => ((acc[p.type] = p.value), acc), {});
    return {
      y: +parts.year,
      m: +parts.month,
      d: +parts.day,
      hh: +parts.hour,
      mm: +parts.minute,
      ss: +parts.second
    };
  }

  private parisNowMs(): number {
    const p = this.parisParts();
    return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  }

  private lastResetMs(nowParisMs?: number): number {
    const d = new Date(nowParisMs ?? this.parisNowMs());
    const y = d.getUTCFullYear(),
      m = d.getUTCMonth() + 1,
      day = d.getUTCDate();
    const todayReset = Date.UTC(y, m - 1, day, this.RESET_HOUR, this.RESET_MIN, 0);

    if ((nowParisMs ?? this.parisNowMs()) >= todayReset) return todayReset;

    // hier
    const yesterday = new Date(
      Date.UTC(y, m - 1, day, 12, 0, 0) - 24 * 3600 * 1000
    );
    return Date.UTC(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth(),
      yesterday.getUTCDate(),
      this.RESET_HOUR,
      this.RESET_MIN,
      0
    );
  }

  private nextResetFromNow(): number {
    const nowMs = this.parisNowMs();
    const last = this.lastResetMs(nowMs);
    const next = nowMs >= last ? last + 24 * 3600 * 1000 : last;
    return next < nowMs ? nowMs : next;
  }

  private countdownStr(diffMs: number): string {
    if (diffMs <= 0) return '00:00';
    const s = Math.floor(diffMs / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h ${m}m ${r}s`;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  // ---------- LocalStorage ----------
  private getLastClaimParisMs(): number | null {
    const v = localStorage.getItem(this.STORAGE_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private setLastClaimParisMs(ms: number) {
    localStorage.setItem(this.STORAGE_KEY, String(ms));
  }

  // ---------- UI toast ----------
  private toast(msg: string) {
    this.bonusMsg = msg;
    setTimeout(() => (this.bonusMsg = null), 3000);
  }
}
