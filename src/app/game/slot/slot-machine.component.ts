// Composant Machine à sous avec mode invité (1000 crédits locaux) et animation contrôlée
import {
  Component,
  OnDestroy,
  AfterViewInit,
  ViewChildren,
  QueryList,
  ElementRef,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WalletService } from '../../services/wallet.service';
import { Subscription } from 'rxjs';
import { SlotPlayResponse, SlotService, SlotConfigResponse, SlotPlayRequest } from '../../services/game/slot.service';
import { RouterLink } from '@angular/router';
import { GameHistoryListComponent } from '../../history/game-history-list.component';
import { HistoryService } from '../../services/history/history.service';
import { AuthService } from '../../services/auth.service';

interface ReelModel { sequence: string[]; }

@Component({
  selector: 'app-slot-machine',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GameHistoryListComponent],
  templateUrl: './slot-machine.component.html',
  styleUrls: ['./slot-machine.component.css']
})
export class SlotMachineComponent implements OnDestroy, AfterViewInit {
  private static readonly DEFAULT_REELS = 3;

  // Mise & règles
  mise: number = 100;
  minBet = 100;

  // États
  enCours = false;
  error: string | null = null;
  lastResult: SlotPlayResponse | null = null;

  // Solde (réel ou invité)
  currentBalance: number | null = null;
  private walletSub?: Subscription;

  // Config/rouleaux
  symbols: string[] = [];
  reelsCount = SlotMachineComponent.DEFAULT_REELS;
  reels: ReelModel[] = [];
  desiredReelsCount: number | null = SlotMachineComponent.DEFAULT_REELS;

  // Anim visuelle
  private loops = 6;
  private minSpinMs = 600;
  private spinStartAt = 0;
  @ViewChildren('reelStrip') reelStrips!: QueryList<ElementRef<HTMLDivElement>>;
  private cleanupTimeout: any = null;
  private transitionTimeouts: any[] = [];

  // Auto-spin
  autoSpinActive = false;
  autoSpinCount = 0;
  protected remainingAutoSpins: number | null = null;
  private autoSpinDelay = 900;
  private autoSpinTimeoutId: any = null;

  // Attente/commit de résultat (utilisé par l’anim)
  private pendingResult: SlotPlayResponse | null = null;
  private pendingHistoryEntry: any | null = null;

  // Connexion & mode invité
  isLoggedIn = false;
  guestBalance = 1000; // solde fictif local

  private configSub?: Subscription;

  constructor(
    private game: SlotService,
    private wallet: WalletService,
    private cdr: ChangeDetectorRef,
    private history: HistoryService,
    private authService: AuthService
  ) {
    // Solde : si connecté → solde réel, sinon → solde invité
    this.walletSub = this.wallet.balance$.subscribe(b => {
      this.currentBalance = this.isLoggedIn ? (b ?? null) : this.guestBalance;
    });

    // Charger la config par défaut (3 rouleaux)
    this.loadConfigFor(this.desiredReelsCount ?? SlotMachineComponent.DEFAULT_REELS);

    // État connexion + écoute
    this.isLoggedIn = !!localStorage.getItem('jwt');
    try {
      const maybe = (this.authService as any).isLoggedIn;
      if (typeof maybe === 'function') this.isLoggedIn = !!maybe.call(this.authService);

      (this.authService as any).authState$?.subscribe((v: any) => {
        const wasGuest = !this.isLoggedIn;
        this.isLoggedIn = !!v;
        if (this.isLoggedIn && wasGuest) {
          this.wallet.refreshBalance();
        } else if (!this.isLoggedIn) {
          this.currentBalance = this.guestBalance;
        }
      });
    } catch {}
  }
  ngOnInit() {
    if (this.isLoggedIn) {
      this.wallet.refreshBalance();
    } else {
      this.currentBalance = this.guestBalance;
    }
  }

  ngAfterViewInit(): void {}

  // ===== Config machine =====
  private loadConfigFor(n: number) {
    this.configSub?.unsubscribe();
    this.configSub = this.game.getSlotsConfig(n).subscribe({
      next: (cfgAny) => {
        const cfg = cfgAny as SlotConfigResponse;
        this.symbols = cfg.symbols ?? ['🍒', '🍋', '🍊', '⭐', '7️⃣'];
        this.reelsCount = cfg.reelsCount ?? n;
        this.desiredReelsCount = this.reelsCount;
        this.buildReels();
        this.cdr.detectChanges();
      },
      error: () => {
        // Hors ligne / non connecté / 401 → fallback local
        this.symbols = ['🍒', '🍋', '🍊', '⭐', '7️⃣'];
        this.reelsCount = n;
        this.buildReels();
        this.cdr.detectChanges();
      }
    });
  }

  private buildReels() {
    if (!this.symbols || this.symbols.length === 0) this.symbols = ['SYM'];
    this.reels = [];
    const pad = this.visibleCells();
    const count = (this.desiredReelsCount && this.desiredReelsCount > 0) ? this.desiredReelsCount : this.reelsCount;
    for (let r = 0; r < count; r++) {
      const seq: string[] = [];
      // répète la bande pour un long scroll + padding pour centrer
      for (let l = 0; l < this.loops; l++) for (const s of this.symbols) seq.push(s);
      for (let p = 0; p < pad; p++) seq.push(this.symbols[p % this.symbols.length]);
      this.reels.push({ sequence: seq });
    }
  }

  // ===== Jouer =====
  jouer() {
    this.error = null;

    // Si non connecté → mode invité (simulation locale)
    if (!this.isLoggedIn) {
      this.jouerFictif();
      return;
    }

    // Validations classiques
    if (!this.mise || this.mise <= 0) { this.error = 'Mise invalide.'; return; }
    if (this.mise < this.minBet) { this.error = `Mise invalide : la mise minimale est de ${this.minBet} crédits.`; return; }
    if (this.currentBalance != null && this.mise > this.currentBalance) { this.error = 'Solde insuffisant.'; return; }
    if (this.enCours) return;

    this.enCours = true;
    this.spinStartAt = Date.now();
    this.startVisualSpin();

    const req: SlotPlayRequest = {
      montant: this.mise,
      reelsCount: (this.desiredReelsCount && this.desiredReelsCount > 0) ? this.desiredReelsCount : undefined
    };

    this.game.playSlots(req).subscribe({
      next: (res) => {
        // on mémorise le résultat pour le commit en fin d’anim
        this.pendingResult = res;
        this.pendingHistoryEntry = {
          game: 'slots',
          outcome: (res.reels || []).join(','),
          montantJoue: res.montantJoue,
          montantGagne: res.montantGagne,
          multiplier: (res.montantJoue ? (res.montantGagne / res.montantJoue) : 0),
          createdAt: new Date().toISOString()
        };

        // on garantit un spin visuel min
        const elapsed = Date.now() - this.spinStartAt;
        const wait = Math.max(0, this.minSpinMs - elapsed);
        setTimeout(() => { this.landToResult(res.reels); }, wait);
      },
      error: (err) => {
        this.error = err?.error?.error || 'Erreur serveur ou solde insuffisant';
        this.stopAllSpinImmediate();
        this.enCours = false;
        this.onSpinComplete();
      }
    });
  }

  // ===== Mode invité : simulation comptable + anim identique =====
  private jouerFictif() {
    if (!this.mise || this.mise <= 0) { this.error = 'Mise invalide.'; return; }
    if (this.mise < this.minBet) { this.error = `Mise invalide : la mise minimale est de ${this.minBet} crédits.`; return; }
    if (this.currentBalance != null && this.mise > this.currentBalance) { this.error = 'Solde insuffisant.'; return; }
    if (this.enCours) return;

    this.error = null;
    this.enCours = true;
    this.spinStartAt = Date.now();
    this.startVisualSpin();

    const reelsN = (this.desiredReelsCount && this.desiredReelsCount > 0) ? this.desiredReelsCount : this.reelsCount;
    const resultSymbols = this.genereSymbolsAleatoires(reelsN!);

    const montantGagne = this.calcGainInvite(resultSymbols, this.mise, reelsN!);
    // MAJ solde invité
    this.guestBalance = this.guestBalance - this.mise + montantGagne;
    this.currentBalance = this.guestBalance;

    // Fabrique un "SlotPlayResponse" local pour l’UI
    const fakeRes: SlotPlayResponse = {
      reels: resultSymbols,
      montantJoue: this.mise,
      montantGagne,
      solde: this.guestBalance
    } as any;

    this.pendingResult = fakeRes;
    this.pendingHistoryEntry = {
      game: 'slots',
      outcome: resultSymbols.join(','),
      montantJoue: fakeRes.montantJoue,
      montantGagne: fakeRes.montantGagne,
      multiplier: (fakeRes.montantJoue ? (fakeRes.montantGagne / fakeRes.montantJoue) : 0),
      createdAt: new Date().toISOString()
    };

    const elapsed = Date.now() - this.spinStartAt;
    const wait = Math.max(0, this.minSpinMs - elapsed);
    setTimeout(() => { this.landToResult(resultSymbols); }, wait);
  }

  private genereSymbolsAleatoires(reelsN: number): string[] {
    const pool = (this.symbols?.length ? this.symbols : ['🍒', '🍋', '🍊', '⭐', '7️⃣']);
    const res: string[] = [];
    for (let i = 0; i < reelsN; i++) {
      const s = pool[Math.floor(Math.random() * pool.length)];
      res.push(s);
    }
    return res;
  }

  // Table simple basée sur les règles affichées dans ton HTML
  private baseValue(symbol: string, reelsN: number): number {
    // valeurs de base indicatives
    switch (symbol) {
      case '🍒': return 1.0;
      case '🍋': return (reelsN === 3) ? 1.3 : (reelsN === 4 ? 1.4 : 1.3);
      case '🍊': return (reelsN === 3) ? 1.0 : (reelsN === 4 ? 2.2 : 1.7);
      case '⭐': return (reelsN === 3) ? 1.1 : (reelsN === 4 ? 3.1 : 2.4);
      case '7️⃣': return (reelsN === 3) ? 1.3 : (reelsN === 4 ? 4.0 : 3.0);
      default: return 1.0;
    }
  }

  private comboMultiplier(count: number, reelsN: number): number {
    if (reelsN === 3) {
      if (count >= 3) return 6;
      if (count === 2) return 1;
      return 0;
    }
    if (reelsN === 4) {
      if (count >= 4) return 6;
      if (count === 3) return 3;
      return 0;
    }
    // reelsN === 5
    if (count >= 5) return 10;
    if (count === 4) return 5;
    if (count === 3) return 1;
    return 0;
  }

  private calcGainInvite(reels: string[], mise: number, reelsN: number): number {
    // compte occurrences
    const map: Record<string, number> = {};
    for (const s of reels) map[s] = (map[s] || 0) + 1;

    // symbole dominant
    let bestSym = reels[0];
    let bestCount = 0;
    for (const [sym, cnt] of Object.entries(map)) {
      if (cnt > bestCount) { bestCount = cnt; bestSym = sym; }
    }

    const mult = this.comboMultiplier(bestCount, reelsN);
    if (mult === 0) return 0;

    const base = this.baseValue(bestSym, reelsN);
    return Math.round(mise * base * mult);
  }

  // ===== Animation =====
  private startVisualSpin() {
    this.buildReels();
    this.clearAllTimers();
    setTimeout(() => {
      this.reelStrips.forEach(elref => {
        const el = elref.nativeElement;
        el.style.transition = '';
        el.style.transform = '';
        el.classList.add('spinning');
      });
    }, 20);
  }

  private landToResult(resultSymbols: string[]) {
    setTimeout(() => {
      const strips = this.reelStrips.toArray();
      const cellHeight = this.getCellHeight();
      const centerOffset = Math.floor((this.visibleCells() / 2)) * cellHeight;
      const maxDuration = 1200 + (strips.length - 1) * 200;
      if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = setTimeout(() => { this.forceCleanup(); }, maxDuration + 500);
      let lastStripEl: HTMLDivElement | null = null;

      for (let r = 0; r < Math.min(resultSymbols.length, strips.length); r++) {
        const targetSym = resultSymbols[r];
        const stripEl = strips[r].nativeElement as HTMLDivElement;
        lastStripEl = stripEl;

        const seq = this.reels[r].sequence;
        const seqLen = seq.length || 1;
        const totalHeight = stripEl.scrollHeight || (cellHeight * seqLen);
        const realCellHeight = Math.max(20, Math.round(totalHeight / seqLen));
        const visibleArea = Math.max(1, this.visibleCells()) * realCellHeight;
        const maxTranslate = Math.max(0, (seqLen * realCellHeight) - visibleArea);

        // indices candidats pour placer targetSym au centre
        const candidates: number[] = [];
        for (let i = 0; i < seqLen; i++) if (seq[i] === targetSym) candidates.push(i);
        if (candidates.length === 0) candidates.push(Math.floor(Math.random() * seqLen));

        let bestIdx = candidates[0];
        let bestPenalty = Number.POSITIVE_INFINITY;
        for (const idx of candidates) {
          const desiredTranslate = (idx * realCellHeight) - centerOffset;
          const clamped = Math.min(Math.max(desiredTranslate, 0), maxTranslate);
          const penalty = Math.abs(clamped - desiredTranslate);
          if (penalty < bestPenalty || (penalty === bestPenalty && idx > bestIdx)) {
            bestPenalty = penalty; bestIdx = idx;
          }
        }

        const targetIndexInSeq = bestIdx;

        stripEl.classList.remove('spinning'); // on coupe l’anim libre
        // flush reflow
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        stripEl.offsetWidth;

        let translate = (targetIndexInSeq * realCellHeight) - centerOffset;
        if (translate < 0) translate = 0;
        if (translate > maxTranslate) translate = maxTranslate;

        const duration = 900 + r * 200;
        stripEl.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
        stripEl.style.transform = `translateY(-${translate}px)`;

        const onEnd = () => { try { stripEl.removeEventListener('transitionend', onEnd); } catch {} };
        stripEl.addEventListener('transitionend', onEnd);
        const toId = setTimeout(() => { try { stripEl.removeEventListener('transitionend', onEnd); } catch {} }, duration + 400);
        this.transitionTimeouts.push(toId);
      }

      const commitAndFinish = () => {
        this.clearAllTimers();
        if (this.pendingResult) {
          this.lastResult = this.pendingResult;
          this.pendingResult = null;
        }
        if (this.pendingHistoryEntry) {
          this.history.pushLocal(this.pendingHistoryEntry);
          this.pendingHistoryEntry = null;
        }

        // Rafraîchit le solde **uniquement si connecté**
        if (this.isLoggedIn) {
          this.wallet.refreshBalance();
        } else {
          // en invité, currentBalance a déjà été mis à jour
        }

        this.enCours = false;
        this.onSpinComplete();
      };

      if (lastStripEl) {
        const finalOnEnd = () => {
          try { lastStripEl!.removeEventListener('transitionend', finalOnEnd); } catch {}
          setTimeout(commitAndFinish, 120);
        };
        lastStripEl.addEventListener('transitionend', finalOnEnd);
        const finalTimeout = setTimeout(() => {
          try { lastStripEl!.removeEventListener('transitionend', finalOnEnd); } catch {}
          this.forceCleanup();
          commitAndFinish();
        }, (900 + (strips.length - 1) * 200) + 800);
        this.transitionTimeouts.push(finalTimeout);
      } else {
        this.forceCleanup();
        commitAndFinish();
      }
    }, 40);
  }

  private stopAllSpinImmediate() {
    this.reelStrips.forEach(elref => {
      const el = elref.nativeElement;
      el.classList.remove('spinning');
      el.style.transition = '';
    });
    this.clearAllTimers();
    this.pendingResult = null;
    this.pendingHistoryEntry = null;
  }

  // ===== Auto-spin =====
  startAutoSpin() {
    // autorisé aussi en mode invité
    if (this.autoSpinActive) return;
    if (!this.mise || this.mise <= 0) { this.error = 'Mise invalide.'; return; }
    if (this.currentBalance != null && this.mise > this.currentBalance) { this.error = 'Solde insuffisant pour auto-spin.'; return; }

    this.remainingAutoSpins = (this.autoSpinCount && this.autoSpinCount > 0)
      ? Math.floor(this.autoSpinCount)
      : null; // null = infini
    this.autoSpinActive = true;
    if (!this.enCours) this.jouer();
  }

  stopAutoSpin() {
    this.autoSpinActive = false;
    this.remainingAutoSpins = null;
    if (this.autoSpinTimeoutId != null) { clearTimeout(this.autoSpinTimeoutId); this.autoSpinTimeoutId = null; }
  }

  private onSpinComplete() {
    if (!this.autoSpinActive) return;

    if (this.remainingAutoSpins != null) {
      this.remainingAutoSpins = Math.max(0, this.remainingAutoSpins - 1);
      if (this.remainingAutoSpins === 0) { this.stopAutoSpin(); return; }
    }

    if (this.currentBalance != null && this.mise > this.currentBalance) {
      this.stopAutoSpin();
      this.error = 'Solde insuffisant — auto-spin arrêté.';
      return;
    }

    if (this.autoSpinActive) {
      if (this.autoSpinTimeoutId != null) clearTimeout(this.autoSpinTimeoutId);
      this.autoSpinTimeoutId = window.setTimeout(() => {
        this.autoSpinTimeoutId = null;
        if (!this.enCours && this.autoSpinActive) { this.jouer(); }
      }, this.autoSpinDelay);
    }
  }

  // ===== utilitaires visuels =====
  private forceCleanup() {
    this.reelStrips.forEach(elref => {
      const el = elref.nativeElement;
      el.classList.remove('spinning');
      el.style.transition = '';
    });
    this.clearAllTimers();
    // ne change pas enCours ici : géré par commit
  }

  private clearAllTimers() {
    if (this.cleanupTimeout) { clearTimeout(this.cleanupTimeout); this.cleanupTimeout = null; }
    this.transitionTimeouts.forEach(t => clearTimeout(t));
    this.transitionTimeouts = [];
    if (this.autoSpinTimeoutId != null) { clearTimeout(this.autoSpinTimeoutId); this.autoSpinTimeoutId = null; }
  }

  private getCellHeight(): number {
    const firstStrip = this.reelStrips.first;
    if (!firstStrip) return 60;
    const cell = firstStrip.nativeElement.querySelector('.cell') as HTMLElement | null;
    if (!cell) return 60;
    return Math.max(32, Math.round(cell.getBoundingClientRect().height));
  }

  private visibleCells(): number { return 3; }

  // Net
  get netGain(): number {
    const r = this.lastResult;
    if (!r) return 0;
    const mise = r.montantJoue ?? this.mise ?? 0;
    const gagne = r.montantGagne ?? 0;
    return gagne - mise;
  }

  get netLabel(): string {
    const n = this.netGain;
    if (n > 0) return `+${n}`;
    if (n < 0) return `-${Math.abs(n)}`;
    return '0';
  }

  // Changer le nombre de rouleaux
  setDesiredReels(n: number | null) {
    if (n != null) {
      const clean = Math.max(1, Math.floor(n));
      this.desiredReelsCount = clean;
      this.loadConfigFor(clean);
    } else {
      this.desiredReelsCount = this.reelsCount;
      this.buildReels();
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.walletSub?.unsubscribe();
    this.configSub?.unsubscribe();
    this.clearAllTimers();
    this.stopAutoSpin();
  }

  protected readonly Math = Math;
}
