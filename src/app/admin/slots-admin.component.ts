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
  symbolValues: number[] = []; // aligné sur symbols
  reelWeights: number[][] = [];
  reelsCount = 3;              // machine en cours d’édition (3/4/5)
  loading = false;
  message: string | null = null;
  error: string | null = null;

  payouts: Record<number, number> = {};

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
    this.loadConfigFor(this.reelsCount); // charge la machine par défaut (3)
  }

  /** Charge la configuration d'une machine N rouleaux depuis le back */
  private loadConfigFor(n: number) {
    this.loading = true;
    this.error = null;
    this.message = null;

    this.slotService.getSlotsConfig(n).subscribe(
      (cfg: SlotConfigResponse) => {
        this.reelsCount = cfg.reelsCount || n;
        this.symbols = cfg.symbols || [];
        this.reelWeights = cfg.reelWeights || [];
        this.payouts = cfg.payouts ? this.mapFromObject(cfg.payouts) : {};

        // symbolValues -> array alignée
        this.symbolValues = [];
        if (cfg.symbolValues) {
          for (const s of this.symbols) this.symbolValues.push(cfg.symbolValues[s] ?? 1.0);
        } else {
          for (let i = 0; i < this.symbols.length; i++) this.symbolValues.push(1.0);
        }

        // complète les lignes de poids si besoin
        while (this.reelWeights.length < this.reelsCount) {
          this.reelWeights.push(Array(this.symbols.length).fill(100));
        }

        this.ensureGrid();
        this.ensurePayoutsUpToMax();
        this.loading = false;
      },
      _err => {
        this.error = 'Impossible de charger la configuration.';
        this.loading = false;
      }
    );
  }

  // s'assure que payouts contient des clefs 2..MAX_REELS (valeurs par défaut si manquantes)
  ensurePayoutsUpToMax() {
    if (!this.payouts) this.payouts = {};
    for (let k = 2; k <= this.MAX_REELS; k++) {
      if (!(k in this.payouts)) this.payouts[k] = Math.max(1, Math.floor(Math.pow(3, k - 2)));
    }
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
    Object.keys(rec).forEach(k => { o[k] = rec[Number(k)]; });
    return o;
  }

  hasPayouts(): boolean {
    return Object.keys(this.payouts).length > 0;
  }

  initDefaultPayoutsForReels(n: number) {
    const def: Record<number, number> = {};
    for (let k = 2; k <= n; k++) def[k] = Math.max(1, Math.floor(Math.pow(3, k - 2)));
    this.payouts = def;
  }

  ensureGrid() {
    if (!this.symbols || this.symbols.length === 0) this.symbols = ['SYM'];

    // sync symbolValues length with symbols
    while (this.symbolValues.length < this.symbols.length) this.symbolValues.push(1.0);
    if (this.symbolValues.length > this.symbols.length) this.symbolValues.splice(this.symbols.length);

    for (let r = 0; r < this.reelsCount; r++) {
      if (!this.reelWeights[r]) this.reelWeights[r] = Array(this.symbols.length).fill(100);
      if (this.reelWeights[r].length !== this.symbols.length) {
        const arr = Array(this.symbols.length).fill(100);
        for (let i = 0; i < Math.min(arr.length, this.reelWeights[r].length); i++) {
          arr[i] = this.reelWeights[r][i] || 100;
        }
        this.reelWeights[r] = arr;
      }
    }
    if (this.reelWeights.length > this.reelsCount) this.reelWeights.splice(this.reelsCount);

    // garde au moins 2..reelsCount visibles dans l’UI
    for (let k = 2; k <= this.reelsCount; k++) if (!(k in this.payouts)) this.payouts[k] = this.payouts[k] || 0;

    // mais ne conserve jamais > MAX_REELS
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

  save() {
    this.loading = true;
    this.error = null;
    this.message = null;

    this.ensureGrid();
    this.ensurePayoutsUpToMax();

    const payload = {
      symbols: this.symbols,
      reelWeights: this.reelWeights,
      reelsCount: this.reelsCount, // machine ciblée
      payouts: this.mapToObject(this.payouts),
      symbolValues: this.mapSymbolValuesToObject()
    };

    this.slotService.setSlotsConfig(payload).subscribe({
      next: () => {
        this.message = 'Configuration sauvegardée.';
        this.loading = false;
        // recharger depuis le back pour afficher exactement ce qui est persisté
        this.loadConfigFor(this.reelsCount);
      },
      error: (err) => {
        this.error = err?.error?.error || 'Erreur lors de la sauvegarde';
        this.loading = false;
      }
    });
  }

  /** Quand l’admin change la machine (3/4/5), on recharge la config côté back */
  setReelsCount(n: number) {
    const clean = Math.max(1, Math.floor(n));
    this.reelsCount = clean;
    this.loadConfigFor(clean);
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

  payoutKeysDesc(): number[] {
    const keys = Object.keys(this.payouts).map(k => Number(k)).filter(k => !isNaN(k));
    for (let k = 2; k <= this.MAX_REELS; k++) if (!keys.includes(k)) keys.push(k);
    return keys.sort((a, b) => b - a);
  }

  range(n: number): number[] {
    if (!n || n <= 0) return [];
    return Array.from({ length: n }, (_, i) => i);
  }

  ksFrom2(): number[] {
    if (this.reelsCount <= 1) return [];
    return Array.from({ length: this.reelsCount - 1 }, (_, i) => i + 2);
  }

  /* ========== Aperçu proba & simulation (inchangé) ========== */

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
        prod *= ((mask & (1 << r)) !== 0) ? p[r] : (1 - p[r]);
      }
      prob += prod;
    }
    return prob;
  }

  private countBits(mask: number): number {
    let c = 0;
    while (mask) { mask &= (mask - 1); c++; }
    return c;
  }

  symbolProbabilities(): { symbol: string, probs: Record<number, number> }[] {
    const out: { symbol: string, probs: Record<number, number> }[] = [];
    for (let i = 0; i < this.symbols.length; i++) {
      const probs: Record<number, number> = {};
      for (let k = 2; k <= this.reelsCount; k++) probs[k] = this.probExactKForSymbol(i, k);
      out.push({ symbol: this.symbols[i], probs });
    }
    return out;
  }

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

  /** valeur du symbole par index, retombe à 1.0 si absent */
  private sv(i: number): number {
    const v = Number(this.symbolValues?.[i]);
    return isFinite(v) && v > 0 ? v : 1.0;
  }

  /** parmi les symboles ayant au moins k occurrences, retourne la meilleure symbolValue */
  private bestSymbolValue(countsMap: Record<number, number>, k: number): number {
    let best = 1.0;
    for (const key of Object.keys(countsMap)) {
      const idx = Number(key);
      const c = countsMap[idx] || 0;
      if (c >= k) {
        const val = this.sv(idx);
        if (val > best) best = val;
      }
    }
    return best;
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

      // tirage indices de symboles
      const reelsResult: number[] = [];
      for (let r = 0; r < this.reelsCount; r++) {
        const idx = this.weightedPick(this.reelWeights[r]);
        reelsResult.push(idx);
      }

      // comptage par index de symbole
      const countsMap: Record<number, number> = {};
      for (const idx of reelsResult) countsMap[idx] = (countsMap[idx] || 0) + 1;

      // max identiques observés
      let maxCount = 0;
      Object.values(countsMap).forEach(c => maxCount = Math.max(maxCount, c));

      // multiplicateur en prenant le plus grand k possible
      let multiplier = 0;
      let kUsed = 0;
      const ks = Object.keys(payouts).map(k => Number(k)).filter(k => !isNaN(k)).sort((a,b) => b - a);
      for (const k of ks) {
        if (maxCount >= k) {
          multiplier = payouts[k] || 0;
          kUsed = k;
          break;
        }
      }

      if (multiplier > 0 && kUsed > 0) {
        // applique la meilleure symbolValue parmi ceux qui atteignent kUsed
        const bestSV = this.bestSymbolValue(countsMap, kUsed);
        totalReturn += bet * multiplier * bestSV;
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
