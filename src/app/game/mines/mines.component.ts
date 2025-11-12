import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MinesService,
  MinesStartResponse,
  MinesPickResponse,
  MinesCashoutResponse
} from '../../services/game/mines.service';
import { WalletService } from '../../services/wallet.service';
import { AuthService } from '../../services/auth.service';
import { RouterLink } from '@angular/router';
import { Subscription, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GameHistoryListComponent } from '../../history/game-history-list.component';
import { HistoryService } from '../../services/history/history.service';


@Component({
  selector: 'app-mines',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GameHistoryListComponent],
  templateUrl: './mines.component.html',
  styleUrls: ['./mines.component.css']
})
export class MinesComponent implements OnInit, OnDestroy {
  readonly GRID = 25;
  readonly HOUSE_EDGE = 0.98;
  readonly CELLS = Array.from({ length: this.GRID }, (_, i) => i);

  mines = 3;
  mise = 100;
  minBet = 100;

  sessionId: string | null = null;
  finished = false;
  enCours = false;
  error: string | null = null;

  revealed = new Set<number>();
  bombs = new Set<number>();
  safeCount = 0;

  // --- solde
  isLoggedIn = false;
  currentBalance: number | null = null;
  guestBalance = 1000;

  // --- multiplicateurs
  table: { [k: number]: number } = {};
  nextMultiplier = 0;

  // --- Ajouts en haut de classe ---
  overlayVisible = false;
  overlayTitle: string | null = null;
  overlaySubtitle: string | null = null;

  get currentMultiplier(): number {
    return this.table[this.safeCount] || 0;
  }
  get nextPayout(): number {
    const mult = this.table[this.safeCount] || 1;
    return Math.floor((this.mise || 0) * mult);
  }


  private showOverlay(title: string, subtitle?: string) {
    this.overlayTitle = title;
    this.overlaySubtitle = subtitle || null;
    this.overlayVisible = true;
  }

  rejouer() {
    // On réinitialise l’UI et relance directement une partie avec les mêmes paramètres
    this.overlayVisible = false;
    this.finished = false;
    this.sessionId = null;
    this.revealed.clear();
    this.bombs.clear();
    this.start();
  }


  // --- mode invité local
  private guestBombs: Set<number> = new Set();
  private guestSafes: Set<number> = new Set();

  private walletSub?: Subscription;

  constructor(
    private api: MinesService,
    private wallet: WalletService,
    private auth: AuthService,
    private history: HistoryService
  ) {}


  ngOnInit() {
    this.isLoggedIn = !!this.auth.getToken();

    if (this.isLoggedIn) {
      this.api.resume().subscribe(r => {
        if (r.active) {
          this.sessionId = r.sessionId;
          this.mines = r.mines;
          this.mise = r.mise;
          this.safeCount = r.safeCount;
          this.revealed = new Set<number>(r.revealed || []);
          this.nextMultiplier = this.table[this.safeCount + 1] || this.table[this.safeCount] || 1;
        } else {
          this.sessionId = null;
          this.finished = false;
        }
        this.clampInputs();
      });

      this.wallet.refreshBalance().subscribe(b => {
        this.currentBalance = b?.solde ?? 0;
        this.clampInputs();
      });

      // restauration éventuelle
      const saved = localStorage.getItem('mines_state');
      if (saved) {
        try {
          const s = JSON.parse(saved);
          this.sessionId = s.sessionId;
          this.mines = s.mines;
          this.mise = s.mise;
          this.safeCount = s.safeCount;
          this.finished = s.finished;
          this.revealed = new Set<number>(s.revealed || []);
          this.bombs = new Set<number>(s.bombs || []);
          this.table = s.table || {};
          this.nextMultiplier = s.nextMultiplier || 1;
        } catch {
          localStorage.removeItem('mines_state');
        }
      }
    } else {
      this.currentBalance = this.guestBalance;
    }

    this.rebuildLocalTable();
    this.clampInputs();
    this.overlayVisible = false;
  }

  // =========================
  //   Multiplicateurs locaux
  // =========================
  private rebuildLocalTable() {
    const m = Math.min(24, Math.max(1, this.mines));
    const safe = this.GRID - m;
    const map: { [k: number]: number } = {};
    let numer = 1;
    let denom = 1;
    for (let k = 1; k <= safe; k++) {
      numer *= (safe - (k - 1));
      denom *= (this.GRID - (k - 1));
      const pk = denom > 0 ? numer / denom : 0;
      const mult = pk > 0 ? (1 / pk) * this.HOUSE_EDGE : 0;
      map[k] = Math.floor(mult * 10000) / 10000;
    }
    this.table = map;
    this.nextMultiplier = this.table[1] || 1;
  }

  loadTable() {
    this.clampMines();
    this.rebuildLocalTable();
  }

  // =========================
  //    Sauvegarde locale
  // =========================
  private saveState() {
    if (!this.isLoggedIn || !this.sessionId || this.finished) {
      localStorage.removeItem('mines_state');
      return;
    }
    const state = {
      sessionId: this.sessionId,
      mines: this.mines,
      mise: this.mise,
      safeCount: this.safeCount,
      finished: this.finished,
      revealed: Array.from(this.revealed),
      bombs: Array.from(this.bombs),
      table: this.table,
      nextMultiplier: this.nextMultiplier
    };
    localStorage.setItem('mines_state', JSON.stringify(state));
  }

  private clearState() {
    localStorage.removeItem('mines_state');
  }

  // =========================
  //   Helpers bornes
  // =========================
  protected getMaxMise(): number {
    return this.isLoggedIn
      ? (this.currentBalance ?? 0)
      : (this.guestBalance ?? 0);
  }

  private clampMise() {
    const max = this.getMaxMise();
    let v = Number(this.mise);

    if (isNaN(v) || v < this.minBet) v = this.minBet;
    if (max > 0 && v > max) v = max;

    this.mise = v;
  }

  private clampMines() {
    let v = Number(this.mines);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 24) v = 24;
    this.mines = v;
  }

  private clampInputs() {
    this.clampMise();
    this.clampMines();
  }

  // =========================
  //   Handlers de saisie (anti spam / anti troll)
  // =========================

  /** 🔒 borne la mise (appelé sur ngModelChange et sur les boutons) */
  onMiseChange(value: any) {
    let v = Number(value);
    if (isNaN(v)) v = this.minBet;

    const max = this.getMaxMise();
    if (v < this.minBet) v = this.minBet;
    if (max > 0 && v > max) v = max;

    this.mise = v;
  }

  /** 🔒 bloque les caractères non numériques et limite la longueur selon le solde */
  blockMiseKeys(event: KeyboardEvent) {
    const allowed = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'];
    if (allowed.includes(event.key)) return;

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    const input = event.target as HTMLInputElement;
    const max = this.getMaxMise() || 0;
    const maxLen = Math.max(String(max || 0).length, String(this.minBet).length);

    if (input.value.length >= maxLen) {
      event.preventDefault();
    }
  }

  /** 🔒 borne les mines (1–24) */
  onMinesChange(value: any) {
    let v = Number(value);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 24) v = 24;
    this.mines = v;
    this.rebuildLocalTable();
  }

  /** 🔒 bloque non numérique & >2 chiffres pour mines */
  blockMinesKeys(event: KeyboardEvent) {
    const allowed = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'];
    if (allowed.includes(event.key)) return;

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    const input = event.target as HTMLInputElement;
    if (input.value.length >= 2) {
      event.preventDefault();
    }
  }

  // =========================
  //       Démarrer partie
  // =========================
  start() {
    this.overlayVisible = false;
    this.overlayTitle = null;
    this.overlaySubtitle = null;

    this.error = null;
    this.revealed.clear();
    this.bombs.clear();
    this.safeCount = 0;
    this.finished = false;
    this.sessionId = null;
    this.clampInputs();
    this.rebuildLocalTable();

    const balance = this.getMaxMise();

    if (!this.mise || this.mise < this.minBet) {
      this.error = `Mise invalide : minimum ${this.minBet} crédits.`;
      return;
    }
    if (this.mise > balance) {
      this.error = 'Mise supérieure à ton solde.';
      return;
    }
    if (this.mines < 1 || this.mines > 24) {
      this.error = 'Nombre de mines invalide (1 à 24).';
      return;
    }

    // --- MODE INVITÉ
    if (!this.isLoggedIn) {
      this.guestBalance -= this.mise;
      this.currentBalance = this.guestBalance;

      this.guestBombs.clear();
      while (this.guestBombs.size < this.mines) {
        this.guestBombs.add(Math.floor(Math.random() * this.GRID));
      }
      this.guestSafes.clear();
      this.sessionId = 'guest-' + Date.now();
      this.overlayVisible = false;
      this.nextMultiplier = this.table[1] || 1;
      return;
    }

    // --- MODE CONNECTÉ
    this.enCours = true;
    this.api.start({ montant: this.mise, mines: this.mines })
      .pipe(
        catchError(err => {
          this.error = err?.error?.error || 'Erreur start';
          return of(null);
        })
      )
      .subscribe((res: MinesStartResponse | null) => {
        this.enCours = false;
        if (!res) return;
        this.sessionId = res.sessionId;
        this.nextMultiplier = this.table[1] || 1;
        this.saveState();
      });
  }

  // =========================
  //         Clic case
  // =========================
  clickCell(i: number) {
    if (!this.sessionId || this.finished || this.revealed.has(i)) return;

    // --- MODE INVITÉ
    if (!this.isLoggedIn) {
      this.revealed.add(i);
      if (this.guestBombs.has(i)) {
        this.bombs.add(i);
        this.finished = true;
        this.sessionId = null;
        return;
      }
      this.guestSafes.add(i);
      this.safeCount = this.guestSafes.size;
      const currentMult = this.table[this.safeCount] || 1;
      this.nextMultiplier = this.table[this.safeCount + 1] || currentMult;
      return;
    }

    // --- MODE CONNECTÉ
    this.enCours = true;
    this.api.pick({ sessionId: this.sessionId, index: i })
      .pipe(
        catchError(err => {
          this.error = err?.error?.error || 'Erreur pick';
          return of(null);
        })
      )
      .subscribe((res: MinesPickResponse | null) => {
        this.enCours = false;
        if (!res) return;
        this.revealed.add(i);

        if (res.bomb) {
          // marque la bombe et termine
          for (const b of res.bombs || []) this.bombs.add(b);
          this.finished = true;

          // ✅ mets à jour immédiatement le nombre de diamants trouvés
          this.safeCount = res.safeCount ?? this.safeCount;

          // garde la mise avant de reset la session
          const mise = this.mise || 0;

          // nettoie la session UI
          this.sessionId = null;
          this.clearState();

          // 🧾 push historique local **complet** (inclut mines & safe)
          if (this.isLoggedIn) {
            this.history.pushLocal({
              game: 'mines',
              // format compact compris par ton formatteur :
              // mines=<n>,safe=<k>,bomb=true,index=<i>
              outcome: `mines=${this.mines},safe=${this.safeCount},bomb=true,index=${res.index}`,
              montantJoue: mise,
              montantGagne: 0,
              multiplier: 0,
              createdAt: new Date().toISOString()
            });
          }

          // 🔥 reset côté serveur (optionnel, tu le gardes)
          this.api.reset().subscribe({
            complete: () => console.log('Session mines réinitialisée après bombe')
          });
        } else {
          this.safeCount = res.safeCount;
          const currentMult = this.table[this.safeCount] || 1;
          this.nextMultiplier = this.table[this.safeCount + 1] || currentMult;
          this.saveState();
        }
      });
  }

  // =========================
  //         Encaisser
  // =========================
  cashout() {
    if (!this.sessionId || this.finished || this.safeCount <= 0) return;

    // --- MODE INVITÉ
    if (!this.isLoggedIn) {
      const mult = this.table[this.safeCount] || 1;
      const payout = Math.round(this.mise * mult);
      this.guestBalance += payout;
      this.currentBalance = this.guestBalance;

// ✅ on nettoie immédiatement la grille
      this.revealed.clear();
      this.bombs.clear();

      this.finished = true;
      this.sessionId = null;
      this.clearState();

// Overlay d’info
      this.showOverlay('✅ Encaissement réussi', `+${payout} crédits (×${Math.round(mult*100)/100})`);
      return;
    }

    // --- MODE CONNECTÉ
    this.enCours = true;
    this.api.cashout({ sessionId: this.sessionId })
      .pipe(
        catchError(err => {
          this.error = err?.error?.error || 'Erreur cashout';
          return of(null);
        })
      )
      .subscribe((res: MinesCashoutResponse | null) => {
        this.enCours = false;
        if (!res) return;

        // capture
        const mise = this.mise || 0;
        const mult = res.multiplier ?? (mise ? res.payout / mise : 0);

// ✅ on nettoie visuellement la grille
        this.revealed.clear();
        this.bombs.clear();

        this.finished = true;
        this.sessionId = null;
        this.clearState();

        this.wallet.applyOptimisticDelta(res.payout);
        this.wallet.refreshBalance().subscribe(b => (this.currentBalance = b?.solde ?? null));
        for (const b of res.bombs || []) this.bombs.add(b); // <- si tu veux afficher les bombes, laisse ; sinon supprime cette ligne.

// 🧾 historique (inchangé)
        if (this.isLoggedIn) {
          this.history.pushLocal({
            game: 'mines',
            outcome: `cashout safe=${res.safeCount}`,
            montantJoue: mise,
            montantGagne: res.payout,
            multiplier: Math.round((mult || 0) * 100) / 100,
            createdAt: new Date().toISOString()
          });
        }

// Overlay d’info
        this.showOverlay('✅ Encaissement réussi', `+${res.payout} crédits (×${Math.round((mult||0)*100)/100})`);

      });
  }

  // =========================
  //         Helpers UI
  // =========================
  canStart(): boolean {
    const balance = this.getMaxMise();
    return !this.sessionId &&
      !this.enCours &&
      this.mise >= this.minBet &&
      this.mise <= balance &&
      this.mines >= 1 &&
      this.mines <= 24;
  }

  canCashout(): boolean {
    return !!this.sessionId && !this.finished && this.safeCount > 0 && !this.enCours;
  }

  canPick(): boolean {
    return !!this.sessionId && !this.finished && !this.enCours;
  }

  ngOnDestroy() {
    this.walletSub?.unsubscribe();
  }

  protected readonly Math = Math;
}
