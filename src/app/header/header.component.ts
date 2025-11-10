import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {catchError, finalize, interval, Subscription, switchMap, timer} from 'rxjs';

import { AuthService } from '../services/auth.service';
import { WalletService } from '../services/wallet.service';
import { BalanceHeaderComponent } from './balance-header.component';
import { UiService } from '../services/ui.service';
import {environment} from '../../environments/environment';
import {EquippedAvatarDto} from '../services/boutique/avatar.models';
import {AvatarService} from '../services/boutique/avatar.service';

type BonusStatus = {
  canClaim: boolean;
  lastClaimEpochMs?: number | null;
  nextResetEpochMs: number;
  serverNowEpochMs: number;
  amount: number;
  solde?: number;
};

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, BalanceHeaderComponent, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  // URLs bonus via environment
  private readonly API = environment.apiBaseUrl;   // ex: 'https://api.evaluxcasino.fr/api' OU '/api'
  private readonly BONUS_STATUS_URL = `${this.API}/bonus/status`;
  private readonly BONUS_CLAIM_URL  = `${this.API}/bonus/claim`;

  // services
  private authService = inject(AuthService);
  private wallet = inject(WalletService);
  private http = inject(HttpClient);
  protected router = inject(Router);
  protected ui = inject(UiService);
  private avatarService = inject(AvatarService);

  equippedAvatar: EquippedAvatarDto | null = null;

  // UI/auth
  bonusLoading = false;
  bonusMsg: string | null = null;

  email = '';
  motDePasse = '';
  loading = false;
  error: string | null = null;
  userObj: { email?: string; pseudo?: string } | null = null;

  // Bonus
  bonusStatus: BonusStatus | null = null;
  private statusFetchedAt = 0;

  // tick
  private tickSub?: Subscription;
  private authSub?: Subscription;
  private avatarSub?: Subscription;

  constructor() { this.loadUser(); }

  ngOnInit(): void {

    this.avatarSub = this.avatarService.equipped$.subscribe(av => {
      this.equippedAvatar = av;
    });

    if (this.isLoggedIn()) {
      this.loadUser();
      this.fetchBonusStatus();
      this.loadEquippedAvatar(); // charge l’état initial depuis le back
    }

    // réagit aux changements d’auth (login/logout)
    this.authSub = this.authService.loggedIn$.subscribe(isIn => {
      if (isIn) {
        this.loadUser();
        this.fetchBonusStatus();
        this.loadEquippedAvatar(); // refresh après login
      } else {
        this.bonusStatus = null;
        this.statusFetchedAt = 0;
        this.equippedAvatar = null;
        this.avatarService.clearEquipped();
      }
    });

    this.tickSub = interval(1000).subscribe(() => {
      if (this.isLoggedIn() && this.bonusStatus && this.msUntilNextReset() <= 0) {
        this.fetchBonusStatus();
      }
    });
  }
  ngOnDestroy(): void { this.tickSub?.unsubscribe(); this.authSub?.unsubscribe(); this.avatarSub?.unsubscribe(); }

  // ---------- Auth ----------
  isLoggedIn(): boolean { return this.authService.isLoggedIn(); }
  loadUser() {
    const u = localStorage.getItem('user');
    this.userObj = u ? (JSON.parse(u) as any) : null;
  }
  submitLogin() {
    this.error = null;
    if (!this.email || !this.motDePasse) { this.error = 'Email et mot de passe requis.'; return; }
    this.loading = true;

    this.authService.login(this.email, this.motDePasse).pipe(
      // important: on ne lance la requête status qu'après le succès du login
      switchMap(() => {
        // recharge l'utilisateur depuis le localStorage (pseudo/email)
        this.loadUser();
        // petite marge au cas où l'interceptor pose le token dans le même tick
        return timer(0).pipe(switchMap(() => this.http.get<BonusStatus>(this.BONUS_STATUS_URL)));
      }),
      finalize(() => { this.loading = false; }),
    ).subscribe({
      next: (res) => {
        this.bonusStatus = res;
        this.statusFetchedAt = Date.now();
        this.error = null;
        this.ui.closeMenu();
      },
      error: (err) => {
        this.error = err?.error || 'Identifiants invalides';
      },
    });
  }

  private loadEquippedAvatar() {
    this.avatarService.getEquipped().subscribe({
      error: () => { /* on ignore, le header restera avec la dernière valeur connue */ }
    });
  }



  logout() {
    this.authService.logout();
    this.wallet.clear?.();
    this.avatarService.clearEquipped(); // 👈 optionnel mais propre
    this.loadUser();
    this.bonusStatus = null;
    this.statusFetchedAt = 0;
    this.ui.closeMenu();
    this.router.navigate(['/home']);
  }

  // ---------- Bonus ----------
  private fetchBonusStatus() {
    if (!this.isLoggedIn()) { this.bonusStatus = null; return; }

    this.http.get<BonusStatus>(this.BONUS_STATUS_URL).pipe(
      // petit retry très court au cas où
      catchError(() => timer(150).pipe(switchMap(() => this.http.get<BonusStatus>(this.BONUS_STATUS_URL))))
    ).subscribe({
      next: (res) => { this.bonusStatus = res; this.statusFetchedAt = Date.now(); },
      error: () => { this.bonusStatus = null; this.statusFetchedAt = 0; }
    });
  }

  get canClaim(): boolean { return !!(this.isLoggedIn() && this.bonusStatus?.canClaim); }
  get giftTooltip(): string {
    if (!this.isLoggedIn()) return 'Connecte-toi pour le bonus';
    if (this.canClaim) return 'Bonus disponible. Clique pour +1000';
    if (!this.bonusStatus) return 'Chargement du statut…';
    return `Prochain bonus dans ${this.countdownStr(this.msUntilNextReset())}`;
  }
  onClickGift() {
    if (!this.isLoggedIn()) { this.toast('Connecte-toi pour réclamer le bonus.'); return; }
    if (!this.canClaim || this.bonusLoading) return;
    this.bonusLoading = true;
    this.http.post<{ amount:number; solde:number }>(this.BONUS_CLAIM_URL, {})
      .subscribe({
        next: r => { this.wallet.refreshBalance().subscribe(); this.toast(`+${r.amount} crédits ajoutés !`); this.bonusLoading = false; this.fetchBonusStatus(); },
        error: e => { this.toast(e?.error?.error || 'Bonus déjà réclamé.'); this.bonusLoading = false; this.fetchBonusStatus(); }
      });
  }

  // ---------- Helpers ----------
  openMenu() { this.ui.openMenu(); }
  private msUntilNextReset(): number {
    if (!this.bonusStatus) return 0;
    const nowClient = Date.now();
    const serverNowEstimated = this.bonusStatus.serverNowEpochMs + (nowClient - this.statusFetchedAt);
    return Math.max(0, this.bonusStatus.nextResetEpochMs - serverNowEstimated);
  }
  private countdownStr(ms: number): string {
    if (ms <= 0) return '00:00';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600)/60), r = s % 60;
    return h > 0 ? `${h}h ${m}m ${r}s` : `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  }
  private toast(msg: string) { this.bonusMsg = msg; setTimeout(()=> this.bonusMsg=null, 3000); }
}
