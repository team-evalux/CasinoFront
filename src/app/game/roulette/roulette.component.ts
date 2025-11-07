import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouletteService, RouletteBetResponse } from '../../services/game/roulette.service';
import { WalletService } from '../../services/wallet.service';
import { Subscription } from 'rxjs';
import { GameHistoryListComponent } from '../../history/game-history-list.component';
import { HistoryService } from '../../services/history/history.service';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-roulette',
  standalone: true,
  imports: [CommonModule, FormsModule, GameHistoryListComponent, RouterLink],
  templateUrl: './roulette.component.html',
  styleUrls: ['./roulette.component.css']
})
export class RouletteComponent implements OnDestroy {
  @ViewChild('wheelEl', { static: false }) wheelEl?: ElementRef<HTMLDivElement>;
  wheelNumbers = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  private static readonly RED_SET = new Set<number>([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  tableRows = [ Array.from({ length: 12 }, (_, i) => i + 1), Array.from({ length: 12 }, (_, i) => i + 13), Array.from({ length: 12 }, (_, i) => i + 25) ];
  readonly wheelSizePx = 360;
  readonly rimRadiusPx = 160;
  sectorAngle = 360 / this.wheelNumbers.length;
  betType: string = 'straight';
  betValue: string = '0';
  montant: number = 100;
  enCours = false;
  lastResult: RouletteBetResponse | null = null;
  resultsHistory: RouletteBetResponse[] = [];
  error: string | null = null;
  currentBalance: number | null = null;
  walletSub?: Subscription;
  wheelRotation = 0;
  wheelTransition = 'none';
  wheelSpinning = false;
  selectedNumber: number | null = null;
  autoSpinActive = false;
  autoSpinCount: number | null = null;
  private lastSpinFinished = true;
  minBet = 100;

  // ✅ aperçu
  isLoggedIn = false;

  private destroyed = false;
  private pendingTimeouts: any[] = [];
  private currentPlaySub?: Subscription;

  constructor(
    private game: RouletteService,
    private wallet: WalletService,
    private history: HistoryService,
    private authService: AuthService
  ) {
    this.walletSub = this.wallet.balance$.subscribe(b => this.currentBalance = b ?? null);

    this.isLoggedIn = !!localStorage.getItem('jwt');
    try {
      const maybe = (this.authService as any).isLoggedIn;
      if (typeof maybe === 'function') this.isLoggedIn = !!maybe.call(this.authService);
      (this.authService as any).authState$?.subscribe((v: any) => this.isLoggedIn = !!v);
    } catch {}
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopAutoSpin();
    this.clearPendingTimeouts();
    this.walletSub?.unsubscribe();
  }

  isRed(n: number | null | undefined): boolean {
    if (n == null || n === 0) return false;
    return RouletteComponent.RED_SET.has(Number(n));
  }

  limitAutoSpinInput(event: KeyboardEvent) {
    const allowedKeys = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'];

    if (allowedKeys.includes(event.key)) return;

    // autorise uniquement les chiffres
    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    const input = event.target as HTMLInputElement;

    // empêche plus de 4 chiffres
    if (input.value.length >= 4) {
      event.preventDefault();
    }
  }



  // 👉 gain net pour un résultat (positif, négatif ou 0)
  netGainOf(res: RouletteBetResponse | null): number {
    if (!res) return 0;
    const mise = Number(res.montantJoue ?? 0);
    const gagne = Number(res.montantGagne ?? 0);
    return gagne - mise;
  }

  // 👉 libellé signé (+X / -X / 0)
  netLabelOf(res: RouletteBetResponse | null): string {
    const n = this.netGainOf(res);
    if (n > 0) return `+${n}`;
    if (n < 0) return `-${Math.abs(n)}`;
    return '0';
  }

  choisirNumero(n: number) {
    if (!this.isLoggedIn || this.enCours) return;
    this.betType = 'straight';
    this.betValue = '' + n;
    this.selectedNumber = n;
  }

  private normalize(angle: number): number {
    let a = angle % 360;
    if (a < 0) a += 360;
    return a;
  }

  private targetModuloForIndex(idx: number): number {
    const offset = 0;
    const angleToTarget = idx * this.sectorAngle;
    return this.normalize(offset - angleToTarget);
  }

  jouer(autoTrigger = false) {
    this.error = null;
    if (!this.isLoggedIn) { this.error = 'Veuillez vous connecter pour jouer.'; return; }
    if (this.betType !== 'straight') this.selectedNumber = null;
    if (!this.montant || this.montant <= 0) { this.error = 'Mise invalide'; return; }
    if (this.montant < this.minBet) { this.error = `Mise invalide : la mise minimale est de ${this.minBet} crédits.`; return; }

    // 🔒 nouvelle vérification : solde insuffisant
    if (this.currentBalance !== null && this.montant > this.currentBalance) {
      this.error = 'Mise supérieure à votre solde.';
      return;
    }


    if (!this.betType || this.betValue == null) { this.error = 'Pari invalide'; return; }
    if (!this.isBetValueValid()) {
      this.error = 'Pari invalide : veuillez choisir une valeur avant de jouer.';
      return;
    }

    if (this.enCours) return;

    this.enCours = true;
    this.wheelSpinning = true;
    this.wheelTransition = 'none';
    this.lastSpinFinished = false;

    const req = { betType: this.betType, betValue: this.betValue, montant: this.montant };

    this.currentPlaySub?.unsubscribe();
    this.currentPlaySub = this.game.jouerRoulette(req).subscribe({
      next: (res) => {
        if (this.destroyed) return;
        const idx = this.wheelNumbers.indexOf(res.number);
        const targetMod = this.targetModuloForIndex(idx);
        const currentAbs = this.wheelRotation;
        const currentMod = this.normalize(currentAbs);
        const delta = (targetMod - currentMod + 360) % 360;
        const fullSpins = 2;
        const finalAbsolute = currentAbs + fullSpins * 360 + delta;

        this.wheelSpinning = false;
        const t1 = setTimeout(() => {
          if (this.destroyed) return;
          const durationSec = 5;
          this.wheelTransition = `transform ${durationSec}s cubic-bezier(.25,.8,.25,1)`;
          this.wheelRotation = finalAbsolute;
        }, 50);
        this.pendingTimeouts.push(t1);

        const totalMs = 5200;
        const t2 = setTimeout(() => {
          if (this.destroyed) return;
          this.lastResult = res;
          this.resultsHistory.unshift(res);
          if (this.resultsHistory.length > 20) this.resultsHistory.pop();
          this.enCours = false;
          this.wallet.refreshBalance();
          this.wheelTransition = 'none';
          this.wheelRotation = targetMod;
          this.lastSpinFinished = true;

          this.history.pushLocal({
            game: 'roulette',
            outcome: `number=${res.number},color=${res.color}`,
            montantJoue: res.montantJoue,
            montantGagne: res.montantGagne,
            multiplier: (res.montantJoue ? (res.montantGagne / res.montantJoue) : 0),
            createdAt: new Date().toISOString()
          });

          if (this.autoSpinActive && !this.destroyed) {
            if (this.autoSpinCount !== null) {
              if (this.autoSpinCount > 1) { this.autoSpinCount--; this.jouer(true); }
              else { this.stopAutoSpin(); }
            } else { this.jouer(true); }
          }
        }, totalMs);
        this.pendingTimeouts.push(t2);
      },
      error: err => {
        if (this.destroyed) return;
        this.error = err?.error?.message || 'Erreur serveur ou solde insuffisant';
        this.enCours = false;
        this.wheelSpinning = false;
        this.lastSpinFinished = true;
        this.stopAutoSpin();
      }
    });
  }

  private isBetValueValid(): boolean {
    if (!this.betType) return false;

    switch (this.betType) {
      case 'straight':
        const num = Number(this.betValue);
        return !isNaN(num) && num >= 0 && num <= 36;

      case 'color':
        return this.betValue === 'red' || this.betValue === 'black';

      case 'parity':
        return this.betValue === 'even' || this.betValue === 'odd';

      case 'range':
        return this.betValue === 'low' || this.betValue === 'high';

      case 'dozen':
        return ['1', '2', '3'].includes(this.betValue);

      default:
        return false;
    }
  }


  startAutoSpin(count?: number) {
    if (!this.isLoggedIn) { this.error = 'Veuillez vous connecter pour jouer.'; return; }
    this.autoSpinActive = true;
    this.autoSpinCount = count ?? null;
    if (this.lastSpinFinished) this.jouer(true);
  }

  stopAutoSpin() {
    this.autoSpinActive = false;
    this.autoSpinCount = null;
    this.currentPlaySub?.unsubscribe();
    this.clearPendingTimeouts();
  }

  private clearPendingTimeouts() {
    while (this.pendingTimeouts.length) {
      const id = this.pendingTimeouts.pop();
      try { clearTimeout(id); } catch {}
    }
  }

  resultMultiplier(res: RouletteBetResponse | null): number | null {
    if (!res || !res.montantJoue) return null;
    return Math.round((res.montantGagne / res.montantJoue) * 100) / 100;
  }

  colorFor(c?: string | null): string {
    if (!c) return '#666';
    if (c === 'red') return '#d32f2f';
    if (c === 'black') return '#212121';
    if (c === 'green') return '#2e7d32';
    return '#666';
  }
  onBetValueChange(value: any) {
    if (this.betType !== 'straight') return;

    let num = parseInt(value, 10);

    if (isNaN(num)) {
      this.betValue = '0';
      return;
    }

    // Limite stricte 0–36
    if (num < 0) num = 0;
    if (num > 36) num = 36;

    // Supprime les zéros inutiles
    this.betValue = String(num);
  }

  isInvalidStraightBet(): boolean {
    if (this.betType !== 'straight') return false;
    const num = Number(this.betValue);
    return isNaN(num) || num < 0 || num > 36;
  }

  /** 🔒 bloque les touches non numériques et limite à deux chiffres */
  blockInvalidKeys(event: KeyboardEvent) {
    const allowedKeys = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'];

    if (allowedKeys.includes(event.key)) return;

    // autorise uniquement les chiffres
    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    // empêche plus de 2 chiffres
    const input = event.target as HTMLInputElement;
    if (input.value.length >= 2) {
      event.preventDefault();
    }
  }

  protected readonly Math = Math;
}
