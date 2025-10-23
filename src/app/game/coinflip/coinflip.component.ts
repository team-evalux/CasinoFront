// src/app/games/coinflip/coinflip.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CoinflipService } from '../../services/game/coinflip.service';
import { WalletService } from '../../services/wallet.service';
import { GameHistoryListComponent } from '../../history/game-history-list.component';
import { HistoryService } from '../../services/history/history.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-coinflip',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GameHistoryListComponent],
  templateUrl: './coinflip.component.html',
  styleUrls: ['./coinflip.component.css']
})
export class CoinflipComponent {
  mise: number = 100;
  choix: 'pile' | 'face' = 'pile';
  enCours = false;
  error: string | null = null;
  message: string | null = null;
  lastResult: any = null;
  currentBalance: number | null = null;
  maxBet = 1_000_000;
  minBet = 100;
  resolutionEnCours = false;
  targetRot: string = '0deg';
  rotateDuration: string = '950ms';
  baseRotDeg: number = 0;

  // ✅ hors connexion : aperçu uniquement
  isLoggedIn = false;

  constructor(
    private game: CoinflipService,
    private wallet: WalletService,
    private history: HistoryService,
    private authService: AuthService
  ) {
    this.wallet.balance$.subscribe(b => this.currentBalance = b ?? null);

    // état connecté ?
    this.isLoggedIn = !!localStorage.getItem('jwt');
    try {
      const maybe = (this.authService as any).isLoggedIn;
      if (typeof maybe === 'function') this.isLoggedIn = !!maybe.call(this.authService);
      (this.authService as any).authState$?.subscribe((v: any) => this.isLoggedIn = !!v);
    } catch {}
  }

  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  jouer() {
    this.error = null;
    this.message = null;

    if (!this.isLoggedIn) { this.error = 'Veuillez vous connecter pour jouer.'; return; }
    if (!this.mise || this.mise < this.minBet) {
      this.error = `Mise invalide : la mise minimale est de ${this.minBet} crédits.`;
      return;
    }
    if (!this.choix) { this.error = 'Choix requis.'; return; }

    this.enCours = true;
    this.resolutionEnCours = false;
    this.rotateDuration = '950ms';

    this.game.jouerPiece({ choix: this.choix, montant: this.mise }).subscribe({
      next: (res) => {
        const base = (res.outcome === 'face') ? 180 : 0;
        this.baseRotDeg = base;

        const tours = this.randInt(6, 10);
        const totalDeg = base + tours * 360;
        this.targetRot = `${totalDeg}deg`;
        this.rotateDuration = `${this.randInt(800, 1100)}ms`;
        this.resolutionEnCours = true;

        this.lastResult = res;
        this.message = res.win ? 'Bravo !' : 'Dommage.';
        this.wallet.refreshBalance();
        this.history.pushLocal({
          game: 'coinflip',
          outcome: `choice=${this.choix},outcome=${res.outcome}`,
          montantJoue: (res.montantJoue ?? this.mise),
          montantGagne: (res.montantGagne ?? 0),
          multiplier: (res.montantJoue ? ((res.montantGagne ?? 0) / res.montantJoue) : (res.win ? 2 : 0)),
          createdAt: new Date().toISOString()
        });

        const totalAnimMs = Math.max(680, parseInt(this.rotateDuration)) + 120;
        setTimeout(() => {
          this.enCours = false;
          this.resolutionEnCours = false;
          this.baseRotDeg = base;
        }, totalAnimMs);
      },
      error: (err) => {
        this.error = err?.error?.error || 'Erreur serveur ou solde insuffisant';
        this.enCours = false;
        this.resolutionEnCours = false;
      }
    });
  }

  refreshBalance() { this.wallet.refreshBalance(); }
  protected readonly Math = Math;
}
