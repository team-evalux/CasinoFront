import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryEntry, HistoryService } from '../services/history/history.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-game-history',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="wrap">
      <h2>Historique des parties</h2>

      <div class="filters">
        <button
          *ngFor="let g of allGames"
          (click)="toggleGame(g)"
          [class.active]="selectedGames.includes(g)"
          class="filter-btn"
        >
          {{ displayName(g) }}
        </button>
        &nbsp; &nbsp; &nbsp;
        <button (click)="clearSelection()" class="filter-btn">Réinitialiser</button>
      </div>

      <div *ngIf="loading" class="mt12">Chargement...</div>

      <div *ngIf="!loading && filteredItems.length>0" class="table-scroll">
        <table class="history-table">
          <thead>
          <tr>
            <th>Jeu</th>
            <th>Détails</th>
            <th>Mise</th>
            <th>Net</th>
            <th>Multiplicateur</th>
            <th>Date</th>
          </tr>
          </thead>
          <tbody>
          <tr *ngFor="let it of filteredItems">
            <td>{{ displayName(it.game) }}</td>
            <td class="break">{{ formatOutcome(it)?.label || it.outcome }}</td>
            <td>{{ it.montantJoue }}</td>
            <td [style.color]="netColorOf(it)">{{ netLabelOf(it) }}</td>
            <td>
              {{
                (formatOutcome(it)?.multiplier ?? it.multiplier) != null
                  ? ((formatOutcome(it)?.multiplier ?? it.multiplier) | number:'1.2-2')
                  : '—'
              }}
            </td>

            <td>{{ it.createdAt | date:'short' }}</td>
          </tr>
          </tbody>
        </table>
      </div>

      <div *ngIf="!loading && filteredItems.length === 0" class="mt12">Aucune partie trouvée.</div>

      <div class="mt14">
        <button routerLink="/home" class="btn">Retour</button>
      </div>
    </div>
  `,
  styles: [`
    .wrap{
      max-width:900px;margin:20px auto;padding:18px;border:1px solid #eee;border-radius:8px;background:#fff;
      color:#0b0f10; /* 👈 forcer le texte en noir sur fond blanc */
    }
    .filters{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0;}
    .filter-btn{
      padding:6px 12px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer;transition:.2s;
      color:#0b0f10; /* 👈 boutons lisibles */
    }
    .filter-btn.active{
      background: linear-gradient(180deg, #2563eb, #1e40af);
      color: #fff; border-color: #1e3a8a; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .filter-btn.active:hover{ transform: scale(1.05); }
    .mt12{margin-top:12px;} .mt14{margin-top:14px;}

    .table-scroll{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
    .history-table{width:100%;min-width:640px;border-collapse:collapse;margin-top:12px;}
    .history-table thead th{ background:#fafafa; }
    .history-table th,.history-table td{padding:8px;border-bottom:1px solid #eee;text-align:left;vertical-align:top;color:#0b0f10;}
    .break{word-break:break-word;overflow-wrap:anywhere;}

    .btn{
      padding:6px 10px;border-radius:6px;border:1px solid #ddd;background:#fff;cursor:pointer;
      color:#0b0f10; /* 👈 */
    }

    @media (max-width:480px){
      .history-table{min-width:560px;}
    }
  `]
})
export class GameHistoryComponent implements OnInit {
  allGames = ['coinflip', 'roulette', 'slots', 'blackjack', 'mines'];
  selectedGames: string[] = [];
  items: HistoryEntry[] = [];
  filteredItems: HistoryEntry[] = [];
  loading = true;

  constructor(private svc: HistoryService) {}

  ngOnInit(): void {
    if (!localStorage.getItem('jwt')) {
      this.items = [];
      this.filteredItems = [];
      this.loading = false;
      return;
    }
    this.svc.getMyHistory().subscribe({
      next: res => { this.items = res; this.filteredItems = res; this.loading = false; },
      error: () => { this.items = []; this.filteredItems = []; this.loading = false; }
    });
  }

  toggleGame(g: string) {
    if (this.selectedGames.includes(g)) {
      this.selectedGames = this.selectedGames.filter(x => x !== g);
    } else {
      this.selectedGames.push(g);
    }
    this.applyFilter();
  }
  clearSelection() { this.selectedGames = []; this.applyFilter(); }
  applyFilter() {
    this.filteredItems = this.selectedGames.length === 0
      ? this.items
      : this.items.filter(i => this.selectedGames.includes(i.game));
  }

  netGainOf(it: HistoryEntry | null | undefined): number {
    if (!it) return 0;
    return Number(it.montantGagne ?? 0) - Number(it.montantJoue ?? 0);
  }
  netLabelOf(it: HistoryEntry | null | undefined): string {
    const n = this.netGainOf(it);
    if (n > 0) return `+${n}`;
    if (n < 0) return `-${Math.abs(n)}`;
    return '0';
  }
  netColorOf(it: HistoryEntry | null | undefined): string {
    const n = this.netGainOf(it);
    if (n > 0) return 'green';
    if (n < 0) return '#b00020';
    return '#eab308';
  }

  private grab(s: string, re: RegExp): string | null {
    const m = re.exec(s);
    return m && m[1] ? m[1] : null;
  }


  displayName(game: string): string {
    switch (game) {
      case 'coinflip': return 'Pile ou Face';
      case 'slots': return 'Machine à sous';
      case 'roulette': return 'Roulette';
      case 'blackjack': return 'BlackJack';
      case 'mines': return 'Mines';
      default: return game;
    }
  }

  formatOutcome(it: HistoryEntry) {
    if (!it || !it.outcome) return null;
    const o = it.outcome;

    if (it.game === 'roulette') {
      const map: Record<string,string> = {};
      o.split(',').forEach(p => { const [k,v] = p.split('='); if (v !== undefined) map[k.trim()] = v.trim(); });
      const num = map['number'] ? Number(map['number']) : (/\b\d+\b/.exec(o) ? Number(/\b\d+\b/.exec(o)![0]) : null);
      const color = (map['color'] ?? (o.includes('red') ? 'red' : o.includes('black') ? 'black' : o.includes('green') ? 'green' : null));
      return { type:'roulette', number: num, color, label: num != null ? `${num} (${color})` : o };
    }

    if (it.game === 'coinflip') {
      const outcome = o.match(/outcome\s*=\s*(pile|face)/i)?.[1];
      const choice = o.match(/choice\s*=\s*(pile|face)/i)?.[1];
      const win = choice && outcome ? (choice === outcome) : null;
      const label = `${choice || '?'} → ${outcome || '?'} ${win==null ? '' : (win ? '• Gagné' : '• Perdu')}`;
      return { type:'coinflip', outcome, label };
    }

    if (it.game === 'blackjack') {
      const total = o.match(/total\s*=\s*(\d+)/i)?.[1];
      const outcome = o.match(/outcome\s*=\s*(\w+)/i)?.[1];
      return { type:'blackjack', label: `Total: ${total || '?'} • ${outcome || ''}` };
    }

    // MINES — regex robustes (gère "cashout safe=3" et "mines=...,safe=...,multiplier=...")
    if (it.game === 'mines') {
      const toNum = (s?: string|null) => (s ? Number(String(s).replace(',', '.')) : NaN);

      // \b = limite de mot → marche pour "cashout safe=3" (espace) comme pour ",safe=3"
      const mines = Number(this.grab(o, /\bmines\s*=\s*(\d+)/i));
      const safe  = Number(this.grab(o, /\bsafe\s*=\s*(\d+)/i));

      // accepte "multiplier=1,46" ou "mult=1.46"
      const multStr = this.grab(o, /\b(?:multiplier|mult)\s*=\s*([\d.,]+)/i);
      let multiplier = toNum(multStr);

      // fallback : si pas trouvé dans outcome, utiliser it.multiplier si dispo
      if (!isFinite(multiplier) && it.multiplier != null) {
        multiplier = Number(it.multiplier);
      }

      // bomb=true / bomb=false ou juste "bomb" (perdu)
      const bombTrue  = /\bbomb\s*=\s*true\b/i.test(o);
      const bombFalse = /\bbomb\s*=\s*false\b/i.test(o);
      const bomb = bombTrue || (!bombFalse && /\bbomb\b/i.test(o));

      const label = bomb
        ? `💣 Perdu • après ${isFinite(safe) ? safe : 0} 💎`
        : `💎 ${isFinite(safe) ? safe : 0}${isFinite(multiplier) ? ' • ×' + (Number(multiplier)).toFixed(2) : ''}`;

      return { type:'mines', mines, safe, bomb, multiplier, label };
    }


    return { type:'autre', label: o };
  }
}
