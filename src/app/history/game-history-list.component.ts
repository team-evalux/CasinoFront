import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryEntry, HistoryService } from '../services/history/history.service';
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-game-history-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card">
      <h4 class="title">Historique — {{ game ? (game | uppercase) : 'TOUS' }}</h4>

      <div *ngIf="loading">Chargement...</div>
      <div *ngIf="!loading && items.length === 0">Aucune entrée.</div>

      <ul *ngIf="!loading && items.length>0" class="list">
        <li *ngFor="let it of items" class="item">
          <div class="left">
            <div class="icons" *ngIf="formatOutcome(it) as fo">
              <span *ngIf="fo.type==='roulette' && fo.number!=null"
                    class="pill"
                    [style.background]="colorFor(fo.color)">
                {{ fo.number }}
              </span>
              <span *ngIf="fo.type==='coinflip'"
                    class="pill pill-coin"
                    [style.background]="couleurPileFace(fo.outcome)">
                    {{ (fo.outcome || '—') | uppercase }}
              </span>

              <span *ngIf="fo.type==='mines'"
                    class="pill pill-mines"
                    [class.pill-danger]="fo.bomb"
                    [class.pill-success]="!fo.bomb">
                {{ fo.bomb ? '💣' : '💎' }}
              </span>
            </div>

            <div class="text">
              <div class="headline">
                {{ it.game | uppercase }} • {{ formatOutcome(it)?.label || '—' }}
              </div>
              <div class="sub">{{ it.createdAt | date:'short' }}</div>
            </div>
          </div>

          <div class="right">
            <div class="net" [style.color]="netColorOf(it)">{{ netLabelOf(it) }}</div>
            <div class="mult">
              x{{
                (formatOutcome(it)?.multiplier ?? it.multiplier) != null
                  ? ((formatOutcome(it)?.multiplier ?? it.multiplier) | number:'1.2-2')
                  : '—'
              }}
            </div>
          </div>
        </li>
      </ul>

      <div class="footer">
        <a [routerLink]="['/history']" class="btn-link">Voir tout</a>
      </div>
    </div>
  `,
  styles: [`
    .card{
      margin-top:18px;padding:12px;border:1px solid #eee;border-radius:8px;background:#fff;
      color:#0b0f10; /* 👈 noir global */
    }
    .title{margin:0 0 8px 0; color:#0b0f10;}
    .list{list-style:none;padding:0;margin:0;}
    .item{
      padding:8px 0;border-top:1px solid #f6f6f6;
      display:flex;justify-content:space-between;align-items:flex-start;gap:10px;
    }
    .left{display:flex;align-items:center;gap:10px;min-width:0;flex:1;}
    .icons{display:flex;gap:10px;align-items:center;}
    .pill{
      display:inline-flex;width:34px;height:34px;border-radius:10px;
      justify-content:center;align-items:center;color:#fff;font-weight:800;font-size:0.9rem;line-height:1;flex:0 0 auto;
      background: linear-gradient(180deg,#475569,#1f2937);
      border: 1px solid rgba(255,255,255,.12);
    }
    .pill-coin{
      width: auto; min-width: 34px; height: 26px; padding: 0 8px; border-radius: 999px;
      font-size: .60rem; /* 👈 un peu plus petit pour "FACE" */
      font-weight: 800; line-height: 1;
    }
    .pill-mines{font-size:18px;}
    .pill-success{background: linear-gradient(180deg,#16a34a,#065f46);}
    .pill-danger{background: linear-gradient(180deg,#ef4444,#7f1d1d);}
    .text{min-width:0;flex:1;}
    .headline{font-weight:600;word-break:break-word;overflow-wrap:anywhere;color:#0b0f10;}
    .sub{font-size:0.9rem;color:#0b0f10;opacity:.9;}  /* 👈 plus de #666 */
    .right{text-align:right;min-width:96px;flex:0 0 auto;}
    .net{font-weight:600;}
    .mult{font-size:0.85rem;color:#0b0f10;opacity:.9;} /* 👈 plus de #666 */
    .footer{margin-top:10px;display:flex;gap:8px;justify-content:flex-end;}
    .btn-link{
      padding:6px 10px;border-radius:6px;border:1px solid #ddd;background:#fff;text-decoration:none;
      color:#0b0f10; /* 👈 */
    }

    @media (max-width:480px){
      .item{flex-wrap:wrap;}
      .right{width:100%;text-align:left;margin-top:6px;}
    }
  `]
})
export class GameHistoryListComponent implements OnInit, OnDestroy {
  @Input() game: string | null = null;
  @Input() limit = 10;
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
    this.loading = true;
    this.sub = this.svc.entriesObservable$.subscribe(list => {
      if (!this.game) {
        this.items = list.slice(0, this.limit);
      } else {
        this.items = list.filter(i => i.game === this.game).slice(0, this.limit);
      }
      this.loading = false;
    });
    if (this.game) {
      this.svc.prependFromServerForGame(this.game, this.limit);
    } else {
      this.svc.refresh();
    }
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

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

  formatOutcome(it: HistoryEntry) {
    if (!it || !it.outcome) return null;
    const o = it.outcome;

    // ROULETTE (inchangé)
    if (it.game === 'roulette') {
      const map: Record<string,string> = {};
      o.split(',').forEach(p => { const [k,v] = p.split('='); if (v !== undefined) map[k.trim()] = v.trim(); });
      const num = map['number'] ? Number(map['number']) : (/\b\d+\b/.exec(o) ? Number(/\b\d+\b/.exec(o)![0]) : null);
      const color = (map['color'] ?? (o.includes('red') ? 'red' : o.includes('black') ? 'black' : o.includes('green') ? 'green' : null));
      return { type:'roulette', number: num, color, label: num != null ? `${num} ${color ? '(' + capitalize(color) + ')' : ''}`.trim() : o };
    }

    // COINFLIP (inchangé)
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

    // BLACKJACK (inchangé)
    if (it.game === 'blackjack') {
      const map = this.parseKeyVals(o);
      const total = map['total'] || this.grab(o, /total\s*=\s*(\d+)/i);
      const outcome = (map['outcome'] || this.grab(o, /outcome\s*=\s*(\w+)/i))?.toUpperCase() || '';
      const label = `Total: ${total || '?'} • ${outcome || ''}`;
      const win = outcome === 'WIN' || outcome === 'BLACKJACK';
      return { type: 'blackjack', total, outcome, win, label };
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

      // fallback : si pas trouvé dans outcome, on utilise it.multiplier (si dispo)
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


    return { type:'autre', number: null, color: null, label: o };
  }


  private parseKeyVals(s: string): Record<string,string> {
    const map: Record<string,string> = {};
    s.split(',').forEach(p => { const [k,v] = p.split('='); if (v !== undefined) map[k.trim().toLowerCase()] = v.trim(); });
    return map;
  }
  private grab(s: string, re: RegExp): string | null { const m = re.exec(s); return m && m[1] ? m[1] : null; }

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
      : 'linear-gradient(180deg, #ef5350, #c62828)';
  }
}
function capitalize(s: string|null|undefined) { if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1); }
