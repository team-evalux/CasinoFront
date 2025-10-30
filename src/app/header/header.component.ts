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
  // ---------- Types ----------
  // Réponse attendue par /api/bonus/status
  // (adapter si ton contrôleur renvoie autre chose)
  private static readonly BONUS_STATUS_PATH = 'http://localhost:8080/api/bonus/status';
  private static readonly BONUS_CLAIM_PATH  = 'http://localhost:8080/api/bonus/claim';

  // ---------- State UI / Auth ----------
  email = '';
  motDePasse = '';
  loading = false;
  error: string | null = null;
  userObj: { email?: string; pseudo?: string } | null = null;

  // ---------- Bonus ----------
  bonusLoading = false;
  bonusMsg: string | null = null;
  bonusStatus: BonusStatus | null = null;
  /** Date.now() au moment où on a reçu serverNowEpochMs (sert à “faire avancer” l’horloge serveur côté client) */
  private statusFetchedAt = 0;

  // ---------- Ticks ----------
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
    // tick visuel pour le tooltip / compte à rebours
    this.tickSub = interval(1000).subscribe(() => {
      // Quand on atteint/surpasse l’heure de reset, on rafraîchit l’état côté serveur.
      if (this.isLoggedIn() && this.bonusStatus) {
        const remain = this.msUntilNextReset();
        if (remain <= 0) this.fetchBonusStatus();
      }
    });

    if (this.isLoggedIn()) {
      this.fetchBonusStatus();
    }
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
    if (!u) { this.userObj = null; return; }
    try { this.userObj = JSON.parse(u); } catch { this.userObj = null; }
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
        this.fetchBonusStatus(); // ← récupère l’état du bonus après login
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
    this.bonusStatus = null;      // ← reset visuel bonus
    this.statusFetchedAt = 0;
    this.router.navigate(['/home']);
  }

  // ---------- Bonus côté serveur ----------
  /** Interroge le serveur pour connaître l’état (peut-claim, prochaine fenêtre, etc.) */
  private fetchBonusStatus() {
    if (!this.isLoggedIn()) { this.bonusStatus = null; return; }
    this.http.get<BonusStatus>(HeaderComponent.BONUS_STATUS_PATH).subscribe({
      next: (res) => {
        this.bonusStatus = res;
        this.statusFetchedAt = Date.now();
      },
      error: () => {
        // En cas d’erreur, on garde un état neutre
        this.bonusStatus = null;
        this.statusFetchedAt = 0;
      }
    });
  }

  /** Bouton disponible ? */
  get canClaim(): boolean {
    return !!(this.isLoggedIn() && this.bonusStatus?.canClaim);
  }

  /** Tooltip dynamique basé sur l’horloge serveur renvoyée par /status */
  get giftTooltip(): string {
    if (!this.isLoggedIn()) return 'Connecte-toi pour le bonus';
    if (this.canClaim) return 'Bonus disponible. Clique pour +1000';

    if (!this.bonusStatus) return 'Chargement du statut du bonus…';

    const remainMs = this.msUntilNextReset();
    const remain = this.countdownStr(remainMs);
    return `Prochain bonus dans ${remain}`;
  }

  /** Clique sur le cadeau */
  onClickGift() {
    if (!this.isLoggedIn()) {
      this.toast('Connecte-toi pour réclamer le bonus.');
      return;
    }
    if (!this.canClaim || this.bonusLoading) return;

    this.bonusLoading = true;

    this.http.post<{ amount: number; solde: number }>(HeaderComponent.BONUS_CLAIM_PATH, {})
      .subscribe({
        next: res => {
          this.wallet.refreshBalance();
          this.toast(`+${res.amount} crédits ajoutés !`);
          this.bonusLoading = false;

          // Après un claim, on recharge le statut pour refléter la nouvelle fenêtre
          this.fetchBonusStatus();
        },
        error: err => {
          this.toast(err?.error?.error || 'Bonus déjà réclamé.');
          this.bonusLoading = false;

          // En cas d’erreur côté serveur, on remet aussi en phase avec /status
          this.fetchBonusStatus();
        }
      });
  }

  // ---------- Helpers temps/affichage ----------
  /** Millisecondes restantes jusqu’au prochain reset (basées sur l’heure serveur + drift client). */
  private msUntilNextReset(): number {
    if (!this.bonusStatus) return 0;
    const { nextResetEpochMs, serverNowEpochMs } = this.bonusStatus;
    const nowClient = Date.now();
    const serverNowEstimated = serverNowEpochMs + (nowClient - this.statusFetchedAt);
    return Math.max(0, nextResetEpochMs - serverNowEstimated);
    // (option : Math.ceil pour arrondir)
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

  // ---------- UI toast ----------
  private toast(msg: string) {
    this.bonusMsg = msg;
    setTimeout(() => (this.bonusMsg = null), 3000);
  }
}

/** Garde ce type côté front en miroir de la réponse /api/bonus/status */
type BonusStatus = {
  canClaim: boolean;
  lastClaimEpochMs?: number | null;
  nextResetEpochMs: number;
  serverNowEpochMs: number;
  amount: number;   // montant du bonus (info)
  solde?: number;   // optionnel si tu veux renvoyer le solde avec /status
};
