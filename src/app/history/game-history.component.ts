import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {HistoryEntry, HistoryService} from '../services/history/history.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-game-history',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div style="max-width:900px;margin:20px auto;padding:18px;border:1px solid #eee;border-radius:8px;">
      <h2>Historique {{ game ? ('— ' + (game | uppercase)) : '' }}</h2>

      <div style="margin-top:12px;">
        <label>Filtrer par jeu :</label>
        <input [(ngModel)]="gameInput" placeholder="ex: coinflip, slots, roulette" style="padding:6px;border:1px solid #ccc;border-radius:4px;" />
        <button (click)="loadForGame()" style="padding:6px 10px;margin-left:8px">Filtrer</button>
        <button (click)="loadAll()" style="padding:6px 10px;margin-left:8px">Tout</button>
      </div>

      <div *ngIf="loading" style="margin-top:12px">Chargement...</div>

      <table *ngIf="!loading && items.length>0" style="width:100%;margin-top:12px;border-collapse:collapse;">
        <thead>
        <tr style="text-align:left;border-bottom:1px solid #eee">
          <th style="padding:8px">Jeu</th>
          <th style="padding:8px">Issue / détails</th>
          <th style="padding:8px">Mise</th>
          <th style="padding:8px">Gain</th>
          <th style="padding:8px">Multiplicateur</th>
          <th style="padding:8px">Date</th>
        </tr>
        </thead>
        <tbody>
        <tr *ngFor="let it of items">
          <td style="padding:8px">{{ it.game }}</td>
          <td style="padding:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px;display:flex;align-items:center;gap:10px;">
            <ng-container *ngIf="formatOutcome(it) as fo">
              <span *ngIf="fo.type==='roulette' && fo.number!=null"
                    [style.background]="colorFor(fo.color)"
                    style="display:inline-flex;width:36px;height:36px;border-radius:50%;justify-content:center;align-items:center;color:white;font-weight:700;flex:0 0 auto;">
                {{ fo.number }}
              </span>
              <span *ngIf="fo.type==='coinflip'"
                    [style.background]="couleurPileFace(fo.outcome)"
                    style="display:inline-flex;width:36px;height:36px;border-radius:50%;justify-content:center;align-items:center;color:white;font-weight:800;font-size:0.7rem;line-height:1;flex:0 0 auto;">
                {{ (fo.outcome || '—') | uppercase }}
              </span>
              <div>
                <div style="font-weight:600">{{ fo.label }}</div>
                <div *ngIf="fo.type==='coinflip'" style="font-size:0.85rem;color:#666">
                  Choix : {{ fo.choice ? (fo.choice | titlecase) : '—' }} • Résultat : {{ fo.outcome ? (fo.outcome | titlecase) : '—' }}
                </div>
              </div>
            </ng-container>
            <ng-container *ngIf="!formatOutcome(it)">
              {{ it.outcome }}
            </ng-container>
          </td>
          <td style="padding:8px">{{ it.montantJoue }}</td>
          <td style="padding:8px" [style.color]="it.montantGagne>0 ? 'green' : '#b00020'">
            {{ it.montantGagne }}
          </td>
          <td style="padding:8px">{{ it.multiplier ? (it.multiplier | number:'1.2-2') : '—' }}</td>
          <td style="padding:8px">{{ it.createdAt | date:'short' }}</td>
        </tr>
        </tbody>
      </table>

      <div *ngIf="!loading && items.length === 0" style="margin-top:12px">Aucune partie trouvée.</div>

      <div style="margin-top:12px">
        <button routerLink="/home" style="padding:6px 10px;border-radius:6px;border:1px solid #ddd;background:white;">Retour</button>
      </div>
    </div>
  `
})
export class GameHistoryComponent implements OnInit {
  items: HistoryEntry[] = [];
  loading = true;
  game: string | null = null;
  gameInput = '';

  constructor(private svc: HistoryService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const g = params['game'];
      if (g) {
        this.game = g;
        this.gameInput = g;
        this.loadForGame();
      } else {
        this.loadAll();
      }
    });
  }

  loadAll() {
    if (!localStorage.getItem('jwt')) {
      this.items = [];
      this.loading = false;
      return;
    }
    this.loading = true;
    this.svc.getMyHistory().subscribe({
      next: res => { this.items = res; this.loading = false; },
      error: () => { this.items = []; this.loading = false; }
    });
  }

  loadForGame() {
    const g = this.gameInput && this.gameInput.trim() !== '' ? this.gameInput.trim() : null;
    if (!g) { this.loadAll(); return; }
    if (!localStorage.getItem('jwt')) {
      this.items = [];
      this.loading = false;
      return;
    }
    this.loading = true;
    this.svc.getMyHistoryByGame(g).subscribe({
      next: res => { this.items = res; this.loading = false; },
      error: () => { this.items = []; this.loading = false; }
    });
  }

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
      return { type:'roulette', number: num, color, label: num != null ? `${num} ${color ? '(' + capitalize(color) + ')' : ''}`.trim() : o };
    }

    if (it.game === 'coinflip') {
      const map = this.parseKeyVals(o);
      const choice = (map['choice'] || this.grab(o, /choice\s*=\s*(pile|face)/i))?.toLowerCase() || null;
      const outcome = (map['outcome'] || this.grab(o, /outcome\s*=\s*(pile|face)/i))?.toLowerCase() || null;
      const win = !!choice && !!outcome ? (choice === outcome) : null;
      const left = choice ? capitalize(choice) : '?';
      const right = outcome ? capitalize(outcome) : '?';
      const status = win==null ? '' : (win ? '• Gagné' : '• Perdu');
      const label = `${left} → ${right} ${status}`.trim();
      return { type:'coinflip', choice, outcome, win, label };
    }

    if (it.game === 'blackjack') {
      const map = this.parseKeyVals(o);
      const total = map['total'] || this.grab(o, /total\s*=\s*(\d+)/i);
      const outcome = (map['outcome'] || this.grab(o, /outcome\s*=\s*(\w+)/i))?.toUpperCase() || '';
      const label = `Total: ${total || '?'} • ${outcome || ''}`;
      const win = outcome === 'WIN' || outcome === 'BLACKJACK';
      return { type: 'blackjack', total, outcome, win, label };
    }

    return { type:'autre', number: null, color: null, label: o };
  }

  private parseKeyVals(s: string): Record<string,string> {
    const map: Record<string,string> = {};
    s.split(',').forEach(p => {
      const [k,v] = p.split('=');
      if (v !== undefined) map[k.trim().toLowerCase()] = v.trim();
    });
    return map;
  }
  private grab(s: string, re: RegExp): string | null {
    const m = re.exec(s);
    return m && m[1] ? m[1] : null;
  }

  colorFor(c?: string|null) {
    if (!c) return '#666';
    if (c === 'red') return '#d32f2f';
    if (c === 'black') return '#212121';
    if (c === 'green') return '#2e7d32';
    return '#666';
  }

  couleurPileFace(side?: string|null) {
    if (!side) return '#666';
    return side.toLowerCase() === 'pile'
      ? 'linear-gradient(145deg, #2196f3, #1565c0)'
      : 'linear-gradient(145deg, #ef5350, #c62828)';
  }
}

function capitalize(s: string|null|undefined) { if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1); }
