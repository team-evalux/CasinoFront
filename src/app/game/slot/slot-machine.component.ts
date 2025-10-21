// src/app/games/slot-machine/slot-machine.component.ts
import { Component, OnDestroy, AfterViewInit, ViewChildren, QueryList, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WalletService } from '../../services/wallet.service';
import { Subscription } from 'rxjs';
import {SlotPlayResponse, SlotService, SlotConfigResponse, SlotPlayRequest} from '../../services/game/slot.service';
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
  mise: number = 100;
  minBet = 100;
  enCours = false;
  error: string | null = null;

  // ✅ affichage retardé (ancien résultat visible pendant le spin)
  lastResult: SlotPlayResponse | null = null;

  currentBalance: number | null = null;
  symbols: string[] = [];
  reelsCount = 3;
  reels: ReelModel[] = [];
  // propriété
  desiredReelsCount: number | null = null; // si null -> utilise la config serveur (this.reelsCount)
  private loops = 6;
  private minSpinMs = 600;
  private spinStartAt = 0;
  private sub?: Subscription;
  private configSub?: Subscription;

  @ViewChildren('reelStrip') reelStrips!: QueryList<ElementRef<HTMLDivElement>>;
  private cleanupTimeout: any = null;
  private transitionTimeouts: any[] = [];

  autoSpinActive = false;
  autoSpinCount = 0;
  protected remainingAutoSpins: number | null = null;
  private autoSpinDelay = 900;
  private autoSpinTimeoutId: any = null;

  // buffers commit fin d’anim
  private pendingResult: SlotPlayResponse | null = null;
  private pendingHistoryEntry: any | null = null;

  // ✅ aperçu
  isLoggedIn = false;

  constructor(
    private game: SlotService,
    private wallet: WalletService,
    private cdr: ChangeDetectorRef,
    private history: HistoryService,
    private authService: AuthService
  ) {
    this.sub = this.wallet.balance$.subscribe(b => this.currentBalance = b ?? null);
    this.configSub = this.game.getSlotsConfig().subscribe({
      next: (cfg: SlotConfigResponse) => {
        this.symbols = cfg.symbols || [];
        this.reelsCount = cfg.reelsCount || 3; // config admin
        // initialiser choix utilisateur par défaut sur la config (mais l'utilisateur peut changer)
        if (this.desiredReelsCount == null) this.desiredReelsCount = this.reelsCount;
        this.buildReels();
        this.cdr.detectChanges();
      },
      error: () => {}
    });


    this.isLoggedIn = !!localStorage.getItem('jwt');
    try {
      const maybe = (this.authService as any).isLoggedIn;
      if (typeof maybe === 'function') this.isLoggedIn = !!maybe.call(this.authService);
      (this.authService as any).authState$?.subscribe((v: any) => this.isLoggedIn = !!v);
    } catch {}
  }

  ngAfterViewInit(): void {}

  private buildReels() {
    if (!this.symbols || this.symbols.length === 0) this.symbols = ['SYM'];
    this.reels = [];
    const pad = this.visibleCells();
    const count = (this.desiredReelsCount && this.desiredReelsCount > 0) ? this.desiredReelsCount : this.reelsCount;
    for (let r = 0; r < count; r++) {
      const seq: string[] = [];
      for (let l = 0; l < this.loops; l++) for (const s of this.symbols) seq.push(s);
      for (let p = 0; p < pad; p++) seq.push(this.symbols[p % this.symbols.length]);
      this.reels.push({ sequence: seq });
    }
  }


  jouer() {
    this.error = null;
    if (!this.isLoggedIn) { this.error = 'Veuillez vous connecter pour jouer.'; return; }

    if (!this.mise || this.mise <= 0) { this.error = 'Mise invalide.'; return; }
    if (this.mise < this.minBet) { this.error = `Mise invalide : la mise minimale est de ${this.minBet} crédits.`; return; }
    if (this.currentBalance != null && this.mise > this.currentBalance) { this.error = 'Solde insuffisant.'; return; }
    if (this.enCours) return;

    this.enCours = true;
    this.spinStartAt = Date.now();
    this.startVisualSpin();

    const req: SlotPlayRequest = { montant: this.mise, reelsCount: this.desiredReelsCount ?? undefined };
    this.game.playSlots(req).subscribe({
      next: (res) => {
        // buffer : on affiche en fin d’anim
        this.pendingResult = res;
        this.pendingHistoryEntry = {
          game: 'slots',
          outcome: (res.reels || []).join(','),
          montantJoue: res.montantJoue,
          montantGagne: res.montantGagne,
          multiplier: (res.montantJoue ? (res.montantGagne / res.montantJoue) : 0),
          createdAt: new Date().toISOString()
        };

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

  startAutoSpin() {
    if (!this.isLoggedIn) { this.error = 'Veuillez vous connecter pour jouer.'; return; }
    if (this.autoSpinActive) return;
    if (!this.mise || this.mise <= 0) { this.error = 'Mise invalide.'; return; }
    if (this.currentBalance != null && this.mise > this.currentBalance) { this.error = 'Solde insuffisant pour auto-spin.'; return; }
    this.remainingAutoSpins = (this.autoSpinCount && this.autoSpinCount > 0) ? Math.floor(this.autoSpinCount) : null;
    this.autoSpinActive = true;
    if (!this.enCours) this.jouer();
  }

  stopAutoSpin() {
    this.autoSpinActive = false;
    this.remainingAutoSpins = null;
    if (this.autoSpinTimeoutId != null) { clearTimeout(this.autoSpinTimeoutId); this.autoSpinTimeoutId = null; }
  }

  setDesiredReels(n: number | null) {
    if (n != null) {
      this.desiredReelsCount = Math.max(1, Math.floor(n));
    }
    this.buildReels();
    this.cdr.detectChanges();
  }

  private onSpinComplete() {
    if (!this.autoSpinActive) return;
    if (this.remainingAutoSpins != null) this.remainingAutoSpins = Math.max(0, this.remainingAutoSpins - 1);
    if (this.remainingAutoSpins === 0) { this.stopAutoSpin(); return; }
    if (this.currentBalance != null && this.mise > this.currentBalance) { this.stopAutoSpin(); this.error = 'Solde insuffisant — auto-spin arrêté.'; return; }
    if (this.autoSpinActive) {
      if (this.autoSpinTimeoutId != null) clearTimeout(this.autoSpinTimeoutId);
      this.autoSpinTimeoutId = window.setTimeout(() => {
        this.autoSpinTimeoutId = null;
        if (!this.enCours && this.autoSpinActive) { this.jouer(); }
      }, this.autoSpinDelay);
    }
  }

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

        const candidates: number[] = [];
        for (let i = 0; i < seqLen; i++) if (seq[i] === targetSym) candidates.push(i);
        if (candidates.length === 0) candidates.push(Math.floor(Math.random() * seqLen));

        let bestIdx = candidates[0];
        let bestPenalty = Number.POSITIVE_INFINITY;
        for (const idx of candidates) {
          const desiredTranslate = (idx * realCellHeight) - centerOffset;
          const clamped = Math.min(Math.max(desiredTranslate, 0), maxTranslate);
          const penalty = Math.abs(clamped - desiredTranslate);
          if (penalty < bestPenalty || (penalty === bestPenalty && idx > bestIdx)) { bestPenalty = penalty; bestIdx = idx; }
        }

        const targetIndexInSeq = bestIdx;

        stripEl.classList.remove('spinning');
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

      // commit résultat + historique à la fin
      const commitAndFinish = () => {
        this.clearAllTimers();
        if (this.pendingResult) { this.lastResult = this.pendingResult; this.pendingResult = null; }
        if (this.pendingHistoryEntry) { this.history.pushLocal(this.pendingHistoryEntry); this.pendingHistoryEntry = null; }
        this.wallet.refreshBalance();
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

  private forceCleanup() {
    this.reelStrips.forEach(elref => {
      const el = elref.nativeElement;
      el.classList.remove('spinning');
      el.style.transition = '';
    });
    this.clearAllTimers();
    this.enCours = false;
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


  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.configSub?.unsubscribe();
    this.clearAllTimers();
    this.stopAutoSpin();
  }
}
