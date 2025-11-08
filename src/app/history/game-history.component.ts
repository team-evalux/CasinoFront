import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryEntry, HistoryService } from '../services/history/history.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-game-history',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div style="max-width:900px;margin:20px auto;padding:18px;border:1px solid #eee;border-radius:8px;">
      <h2>Historique des parties</h2>

      <!-- 🔘 Filtres de jeu -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:14px 0;">
        <button
          *ngFor="let g of allGames"
          (click)="toggleGame(g)"
          [class.active]="selectedGames.includes(g)"
          style="padding:6px 12px;border-radius:6px;border:1px solid #ccc;background:white;cursor:pointer;transition:.2s;"
        >
          {{ displayName(g) }}
        </button>
        &nbsp; &nbsp; &nbsp;
        <button (click)="clearSelection()" style="padding:6px 12px;border-radius:6px;border:1px solid #ccc;background:white;">Réinitialiser</button>
      </div>

      <div *ngIf="loading" style="margin-top:12px;">Chargement...</div>

      <table *ngIf="!loading && filteredItems.length>0"
             style="width:100%;margin-top:12px;border-collapse:collapse;">
        <thead>
        <tr style="border-bottom:1px solid #eee;text-align:left;">
          <th style="padding:8px;">Jeu</th>
          <th style="padding:8px;">Détails</th>
          <th style="padding:8px;">Mise</th>
          <th style="padding:8px;">Net</th>
          <th style="padding:8px;">Multiplicateur</th>
          <th style="padding:8px;">Date</th>
        </tr>
        </thead>
        <tbody>
        <tr *ngFor="let it of filteredItems">
          <td style="padding:8px;">{{ displayName(it.game) }}</td>
          <td style="padding:8px;">{{ formatOutcome(it)?.label || it.outcome }}</td>
          <td style="padding:8px;">{{ it.montantJoue }}</td>
          <td style="padding:8px;" [style.color]="netColorOf(it)">{{ netLabelOf(it) }}</td>
          <td style="padding:8px;">{{ it.multiplier ? (it.multiplier | number:'1.2-2') : '—' }}</td>
          <td style="padding:8px;">{{ it.createdAt | date:'short' }}</td>
        </tr>
        </tbody>
      </table>

      <div *ngIf="!loading && filteredItems.length === 0" style="margin-top:12px;">Aucune partie trouvée.</div>

      <div style="margin-top:14px;">
        <button routerLink="/home" style="padding:6px 10px;border-radius:6px;border:1px solid #ddd;background:white;">Retour</button>
      </div>
    </div>
  `,
  styles: [`
    button.active {
      background: linear-gradient(180deg, #2563eb, #1e40af);
      color: #fff;
      border-color: #1e3a8a;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    button.active:hover {
      transform: scale(1.05);
    }
  `]
})
export class GameHistoryComponent implements OnInit {
  // 🔹 Ajout de "mines" dans la liste des jeux
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
      next: res => {
        this.items = res;
        this.filteredItems = res;
        this.loading = false;
      },
      error: () => {
        this.items = [];
        this.filteredItems = [];
        this.loading = false;
      }
    });
  }

  // --- Filtres ---
  toggleGame(g: string) {
    if (this.selectedGames.includes(g)) {
      this.selectedGames = this.selectedGames.filter(x => x !== g);
    } else {
      this.selectedGames.push(g);
    }
    this.applyFilter();
  }

  clearSelection() {
    this.selectedGames = [];
    this.applyFilter();
  }

  applyFilter() {
    if (this.selectedGames.length === 0) {
      this.filteredItems = this.items;
    } else {
      this.filteredItems = this.items.filter(i => this.selectedGames.includes(i.game));
    }
  }

  // --- Utilitaires ---
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

  // Nom affiché lisible
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

  // Formatage spécifique du champ outcome
  formatOutcome(it: HistoryEntry) {
    if (!it || !it.outcome) return null;
    const o = it.outcome;

    if (it.game === 'roulette') {
      const map: Record<string,string> = {};
      o.split(',').forEach(p => {
        const [k,v] = p.split('=');
        if (v !== undefined) map[k.trim()] = v.trim();
      });
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

    if (it.game === 'mines') {
      const mines = o.match(/mines\s*=\s*(\d+)/i)?.[1];
      const safe = o.match(/safe\s*=\s*(\d+)/i)?.[1];
      const status = o.includes('bomb') ? '💣 Perdu' : '💎 Terminé';
      return { type:'mines', label: `${safe ? safe + ' diamants' : ''} • ${status}` };
    }

    return { type:'autre', label: o };
  }
}
