import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SlotConfigResponse, SlotService } from '../services/game/slot.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-slots-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './slots-admin.component.html'
})
export class SlotsAdminComponent {
  readonly MAX_REELS = 5;
  symbols: string[] = [];
  symbolValues: number[] = []; // alignée par index avec `symbols`
  reelWeights: number[][] = [];
  reelsCount = 3;
  loading = false;
  message: string | null = null;
  error: string | null = null;

  // payouts: clé = nombre d'identiques (k), valeur = multiplicateur
  payouts: Record<number, number> = {};

  // Simulation UI
  simSpins = 1000;
  simRunning = false;
  simResult: {
    rtp: number;
    totalReturn: number;
    totalBet: number;
    avgReturnPerSpin: number;
    countsByK: Record<number, number>;
  } | null = null;

  constructor(private slotService: SlotService) {
    this.loadConfig();
  }

  loadConfig() {
    this.slotService.getSlotsConfig().subscribe({
      next: (cfg: SlotConfigResponse) => {
        this.symbols = cfg.symbols || [];
        this.reelWeights = cfg.reelWeights || [];
        this.reelsCount = cfg.reelsCount || 3;
        this.payouts = cfg.payouts ? this.mapFromObject(cfg.payouts) : {};

        // map symbolValues object -> array alignée
        this.symbolValues = [];
        if (cfg.symbolValues) {
          for (const s of this.symbols) {
            this.symbolValues.push(cfg.symbolValues[s] ?? 1.0);
          }
        } else {
          for (let i = 0; i < this.symbols.length; i++) this.symbolValues.push(1.0);
        }

        while (this.reelWeights.length < this.reelsCount) this.reelWeights.push(Array(this.symbols.length).fill(100));
        this.ensureGrid();
        this.ensurePayoutsUpToMax();
      },
      error: () => { this.error = 'Impossible de charger la configuration.'; }
    });
  }

  // s'assure que payouts contient des clefs 2..MAX_REELS (valeurs par défaut si manquantes)
  ensurePayoutsUpToMax() {
    if (!this.payouts) this.payouts = {};
    for (let k = 2; k <= this.MAX_REELS; k++) {
      if (!(k in this.payouts)) {
        // même formule que initDefaultPayoutsForReels pour cohérence
        this.payouts[k] = Math.max(1, Math.floor(Math.pow(3, k - 2)));
      }
    }
    // supprimer les clefs supérieures à MAX_REELS si présentes
    Object.keys(this.payouts).forEach(key => {
      const kk = Number(key);
      if (kk > this.MAX_REELS) delete this.payouts[kk];
    });
  }


  // convert JSON object keys (strings) to numbers
  private mapFromObject(obj: any): Record<number, number> {
    const out: Record<number, number> = {};
    if (!obj) return out;
    Object.keys(obj).forEach(k => {
      const n = Number(k);
      out[n] = Number(obj[k]);
    });
    return out;
  }

  private mapToObject(rec: Record<number, number>): any {
    const o: any = {};
    Object.keys(rec).forEach(k => {
      o[k] = rec[Number(k)];
    });
    return o;
  }

  hasPayouts(): boolean {
    return Object.keys(this.payouts).length > 0;
  }

  initDefaultPayoutsForReels(n: number) {
    const defaultP: Record<number, number> = {};
    for (let k = 2; k <= n; k++) {
      defaultP[k] = Math.max(1, Math.floor(Math.pow(3, k - 2)));
    }
    this.payouts = defaultP;
  }

  ensureGrid() {
    if (!this.symbols || this.symbols.length === 0) {
      this.symbols = ['SYM'];
    }

    // sync symbolValues length with symbols
    while (this.symbolValues.length < this.symbols.length) this.symbolValues.push(1.0);
    if (this.symbolValues.length > this.symbols.length) this.symbolValues.splice(this.symbols.length);

    for (let r = 0; r < this.reelsCount; r++) {
      if (!this.reelWeights[r]) this.reelWeights[r] = Array(this.symbols.length).fill(100);
      if (this.reelWeights[r].length !== this.symbols.length) {
        const arr = Array(this.symbols.length).fill(100);
        for (let i = 0; i < Math.min(arr.length, this.reelWeights[r].length); i++) arr[i] = this.reelWeights[r][i] || 100;
        this.reelWeights[r] = arr;
      }
    }

    if (this.reelWeights.length > this.reelsCount) {
      this.reelWeights.splice(this.reelsCount);
    }

    for (let k = 2; k <= this.reelsCount; k++) {
      if (!(k in this.payouts)) {
        this.payouts[k] = this.payouts[k] || 0;
      }
    }
    Object.keys(this.payouts).forEach(key => {
      const kk = Number(key);
      if (kk > this.MAX_REELS) delete this.payouts[kk];
    });
  }

  addSymbol() {
    this.symbols.push('SYM');
    for (let r = 0; r < this.reelWeights.length; r++) this.reelWeights[r].push(100);
    this.symbolValues.push(1.0);
    this.ensureGrid();
  }

  removeSymbol(index: number) {
    if (index < 0 || index >= this.symbols.length) return;
    this.symbols.splice(index, 1);
    this.symbolValues.splice(index, 1);
    for (let r = 0; r < this.reelWeights.length; r++) {
      if (this.reelWeights[r] && this.reelWeights[r].length > index) this.reelWeights[r].splice(index, 1);
    }
    this.ensureGrid();
  }

  private mapSymbolValuesToObject(): any {
    const o: any = {};
    for (let i = 0; i < this.symbols.length; i++) {
      o[this.symbols[i]] = Number(this.symbolValues[i] || 1.0);
    }
    return o;
  }

  // Avant save() : on s'assure d'avoir tous les payouts jusqu'à MAX_REELS
  save() {
    this.loading = true;
    this.error = null;
    this.message = null;
    this.ensureGrid();          // construit grille / poids, mais ne supprime plus payouts > reelsCount
    this.ensurePayoutsUpToMax(); // <-- important
    const payload: any = {
      symbols: this.symbols,
      reelWeights: this.reelWeights,
      reelsCount: this.reelsCount,
      payouts: this.mapToObject(this.payouts),
      symbolValues: this.mapSymbolValuesToObject()
    };
    this.slotService.setSlotsConfig(payload).subscribe({
      next: () => {
        this.message = 'Configuration sauvegardée.';
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.error || 'Erreur lors de la sauvegarde';
        this.loading = false;
      }
    });
  }

  setReelsCount(n: number) {
    this.reelsCount = Math.max(1, Math.floor(n));
    while (this.reelWeights.length < this.reelsCount) this.reelWeights.push(Array(this.symbols.length).fill(100));
    if (this.reelWeights.length > this.reelsCount) this.reelWeights.splice(this.reelsCount);
    this.ensureGrid();
  }

  totalWeight(reelIndex: number): number {
    if (!this.reelWeights || !this.reelWeights[reelIndex]) return 0;
    return this.reelWeights[reelIndex].reduce((s, v) => s + (Number(v) || 0), 0);
  }

  getPercent(reelIndex: number, symbolIndex: number): string {
    const total = this.totalWeight(reelIndex);
    if (total <= 0) return '0.00%';
    const w = Number(this.reelWeights?.[reelIndex]?.[symbolIndex] || 0);
    const p = (w / total) * 100;
    return `${p.toFixed(2)}%`;
  }

  // adapte payoutKeysDesc pour exposer les keys jusqu'à MAX_REELS
  payoutKeysDesc(): number[] {
    const keys = Object.keys(this.payouts).map(k => Number(k)).filter(k => !isNaN(k));
    // s'assurer que 2..MAX_REELS sont présents dans la liste (même si non définis)
    for (let k = 2; k <= this.MAX_REELS; k++) {
      if (!keys.includes(k)) keys.push(k);
    }
    return keys.sort((a,b) => b - a);
  }

  // helper: range 0..n-1
  range(n: number): number[] {
    if (!n || n <= 0) return [];
    return Array.from({length: n}, (_, i) => i);
  }

  // helper: ks from 2..reelsCount
  ksFrom2(): number[] {
    if (this.reelsCount <= 1) return [];
    return Array.from({length: this.reelsCount - 1}, (_, i) => i + 2);
  }

  /* =========================
     Probabilities preview
     ========================= */

  probExactKForSymbol(symbolIndex: number, k: number): number {
    const n = this.reelsCount;
    const p: number[] = [];
    for (let r = 0; r < n; r++) {
      const total = this.totalWeight(r);
      const w = Number(this.reelWeights?.[r]?.[symbolIndex] || 0);
      p.push(total > 0 ? (w / total) : 0);
    }
    let prob = 0;
    const maxMask = 1 << n;
    for (let mask = 0; mask < maxMask; mask++) {
      if (this.countBits(mask) !== k) continue;
      let prod = 1;
      for (let r = 0; r < n; r++) {
        if ((mask & (1 << r)) !== 0) {
          prod *= p[r];
        } else {
          prod *= (1 - p[r]);
        }
      }
      prob += prod;
    }
    return prob;
  }

  private countBits(mask: number): number {
    let c = 0;
    while (mask) {
      mask &= (mask - 1);
      c++;
    }
    return c;
  }

  symbolProbabilities(): { symbol: string, probs: Record<number, number> }[] {
    const out: { symbol: string, probs: Record<number, number> }[] = [];
    for (let i = 0; i < this.symbols.length; i++) {
      const probs: Record<number, number> = {};
      for (let k = 2; k <= this.reelsCount; k++) {
        probs[k] = this.probExactKForSymbol(i, k);
      }
      out.push({ symbol: this.symbols[i], probs });
    }
    return out;
  }

  /* =========================
     Simulation (client-side)
     ========================= */

  private weightedPick(weights: number[]): number {
    const total = weights.reduce((s, w) => s + (Number(w) || 0), 0);
    if (total <= 0) return Math.floor(Math.random() * this.symbols.length);
    let v = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      v -= (Number(weights[i]) || 0);
      if (v <= 0) return i;
    }
    return weights.length - 1;
  }

  simulate(spins?: number) {
    const n = spins ?? this.simSpins;
    this.simRunning = true;
    this.simResult = null;

    this.ensureGrid();
    const payouts = { ...this.payouts };
    const bet = 1;
    let totalReturn = 0;
    let totalBet = 0;
    const countsByK: Record<number, number> = {};
    for (let k = 2; k <= this.reelsCount; k++) countsByK[k] = 0;

    for (let s = 0; s < n; s++) {
      totalBet += bet;
      const reelsResult: number[] = [];
      for (let r = 0; r < this.reelsCount; r++) {
        const idx = this.weightedPick(this.reelWeights[r]);
        reelsResult.push(idx);
      }
      const countsMap: Record<number, number> = {};
      for (const idx of reelsResult) countsMap[idx] = (countsMap[idx] || 0) + 1;
      let maxCount = 0;
      Object.values(countsMap).forEach(c => maxCount = Math.max(maxCount, c));
      let multiplier = 0;
      const ks = Object.keys(payouts).map(k => Number(k)).filter(k => !isNaN(k)).sort((a,b) => b - a);
      for (const k of ks) {
        if (maxCount >= k) {
          multiplier = payouts[k] || 0;
          break;
        }
      }
      if (multiplier > 0) {
        totalReturn += bet * multiplier;
      }
      if (maxCount >= 2) {
        countsByK[maxCount] = (countsByK[maxCount] || 0) + 1;
      }
    }

    const rtp = totalReturn / totalBet;
    this.simResult = {
      rtp,
      totalReturn,
      totalBet,
      avgReturnPerSpin: totalReturn / n,
      countsByK
    };
    this.simRunning = false;
  }
}
