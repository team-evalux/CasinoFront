// src/app/history/history-widget.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryEntry, HistoryService } from '../services/history/history.service';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-history-widget',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div style="padding:12px;border:1px solid #eee;border-radius:8px;background:#fff;">
      <h3 style="margin:0 0 8px 0;">Historique récent</h3>
      <div *ngIf="loading">Chargement...</div>
      <div *ngIf="!loading && items.length === 0">Aucune partie récente.</div>

      <ul *ngIf="!loading && items.length > 0" style="list-style:none;padding:0;margin:0;">
        <li *ngFor="let it of items" style="padding:10px 0;border-top:1px solid #f6f6f6;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;">

              <div *ngIf="formatOutcome(it) as fo" style="display:flex;align-items:center;gap:10px;">
                <span *ngIf="fo.type==='roulette' && fo.number!=null"
                      [style.background]="colorFor(fo.color)"
                      style="display:inline-flex;width:36px;height:36px;border-radius:50%;justify-content:center;align-items:center;color:white;font-weight:700;">
                  {{ fo.number }}
                </span>

                <span *ngIf="fo.type==='coinflip'"
                          [style.background]="couleurPileFace(fo.outcome)"
                          style="display:inline-flex;width:36px;height:36px;border-radius:50%;justify-content:center;align-items:center;color:white;font-weight:800;font-size:0.7rem;line-height:1;">
                  {{ (fo.outcome || '—') | uppercase }}
                </span>

                <div>
                  <div style="font-weight:600">{{ it.game | uppercase }} • {{ fo.label }}</div>
                  <div style="font-size:0.9rem;color:#666">{{ it.createdAt | date:'short' }}</div>
                </div>
              </div>

              <div *ngIf="!formatOutcome(it)">
                <div style="font-weight:600">{{ it.game | uppercase }}</div>
                <div style="font-size:0.9rem;color:#666">{{ it.createdAt | date:'short' }}</div>
              </div>
            </div>

            <div style="text-align:right;min-width:120px">
              <div [style.color]="it.montantGagne>0 ? 'green' : '#b00020'">
                {{ it.montantGagne > 0 ? '+' + it.montantGagne : '-' + it.montantJoue }}
              </div>
              <div style="font-size:0.85rem;color:#666">x{{ it.multiplier ? (it.multiplier | number:'1.2-2') : '—' }}</div>
            </div>
          </div>
        </li>
      </ul>

      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
        <button routerLink="/history" style="padding:6px 10px;border-radius:6px;border:1px solid #ddd;background:white;cursor:pointer;">Voir tout</button>
      </div>
    </div>
  `
})
export class HistoryWidgetComponent implements OnInit, OnDestroy {
  items: HistoryEntry[] = [];
  loading = true;
  private sub?: Subscription;

  constructor(private svc: HistoryService) {}

  ngOnInit(): void {
    if (!localStorage.getItem('jwt')) {
      this.items = [];
      this.loading = false;
      return;
    }
    this.sub = this.svc.entriesObservable$.subscribe(list => {
      this.items = list.slice(0, 15);
      this.loading = false;
    });
    this.svc.refresh(15);
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

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
      const map = this.parseKeyVals(it.outcome);
      const total = map['total'] || this.grab(it.outcome, /total\s*=\s*(\d+)/i);
      const outcome = map['outcome'] || this.grab(it.outcome, /outcome\s*=\s*(\w+)/i);
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
