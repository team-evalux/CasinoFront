import {Component, OnInit, OnDestroy, inject} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { WalletService } from '../services/wallet.service';
import { HistoryWidgetComponent } from '../history/history-widget.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, HistoryWidgetComponent],
  templateUrl: './home.component.html'
})
export class HomeComponent implements OnInit, OnDestroy {
  // ====== Données utilisateur (existantes) ======
  pseudo: string | null = null;
  userObj: { email?: string; pseudo?: string } | null = null;
  tokenPresent = false;
  private auth = inject(AuthService); // ✅

  // ====== Barre de progression “créditation horaire” ======
  percent: number = 0;            // 0 → 100 %
  remainingLabel: string = '';    // ex. "12:34"
  private tickId: any = null;     // setInterval
  private balanceRefreshTimeout: any = null; // rafraîchit le solde quelques secondes après l’heure pile

  constructor(
    private authService: AuthService,
    private router: Router,
    private wallet: WalletService
  ) {
    // Récupération pseudo depuis le localStorage
    const user = localStorage.getItem('user');
    if (user) {
      try {
        this.userObj = JSON.parse(user);
        this.pseudo = this.userObj?.pseudo ?? null;
      } catch {
        this.userObj = null;
      }
    }
    this.tokenPresent = !!localStorage.getItem('jwt');
  }

  // ====== Cycle de vie ======
  ngOnInit(): void {
    this.mettreAJourProgressionHoraire();
    this.tickId = setInterval(() => this.mettreAJourProgressionHoraire(), 1000);

    this.router.events.subscribe(() => {
      window.scrollTo(0, 0);

    });
  }

  ngOnDestroy(): void {
    if (this.tickId) clearInterval(this.tickId);
    if (this.balanceRefreshTimeout) clearTimeout(this.balanceRefreshTimeout);
  }

  isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }


  // ====== Actions ======
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  // ====== Logique barre horaire ======
  /** Met à jour le pourcentage et le libellé restant jusqu’à la prochaine heure pile. */
  private mettreAJourProgressionHoraire(): void {
    const maintenant = new Date();

    // Début d’heure courante
    const topHeureCourante = new Date(maintenant);
    topHeureCourante.setMinutes(0, 0, 0);

    // Prochaine heure pile
    const prochainTop = new Date(topHeureCourante);
    prochainTop.setHours(topHeureCourante.getHours() + 1);

    // Durée réelle (prend en compte les changements d’heure)
    const dureeTotaleMs = prochainTop.getTime() - topHeureCourante.getTime();
    const ecouleMs = maintenant.getTime() - topHeureCourante.getTime();

    // Pourcentage 0 → 100
    this.percent = Math.min(100, Math.max(0, (ecouleMs / dureeTotaleMs) * 100));

    // Temps restant formaté
    const restantMs = Math.max(0, prochainTop.getTime() - maintenant.getTime());
    this.remainingLabel = this.formaterTemps(restantMs);

    // Option : rafraîchir le solde quelques secondes après l’heure pile (quand le cron a tourné)
    if (restantMs <= 1000 && !this.balanceRefreshTimeout) {
      this.balanceRefreshTimeout = setTimeout(() => {
        try { this.wallet.refreshBalance(); } catch {}
        this.balanceRefreshTimeout = null;
      }, 5000); // 5s après l’heure pile
    }
  }

  /** Formate un temps restant en H:MM:SS ou MM:SS */
  private formaterTemps(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
}
