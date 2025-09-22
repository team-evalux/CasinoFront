import { Component, HostListener, OnDestroy, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BlackjackService } from '../../services/game/blackjack.service';
import { BJSeat, BJTableState } from '../../services/game/blackjack.models';
import { Subscription, interval } from 'rxjs';
import { WalletService } from '../../services/wallet.service';

@Component({
  selector: 'app-blackjack-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './blackjack-table.component.html',
  styleUrls: ['./blackjack-table.component.css']
})
export class BlackjackTableComponent implements OnInit, OnDestroy {
  tableId!: number | string;
  state: BJTableState | null = null;
  loading = true;
  error: string | null = null;

  betAmount = 0;                 // <-- initialisé à 0
  userEditedBet = false;

  private sub?: Subscription;
  private subErr?: Subscription;

  remainingSeconds: number = 0;
  private tickSub?: Subscription;

  // --- Résultat partie
  myPayoutObj: any | null = null;
  resultMessage: string | null = null;
  private readonly RESULT_DISPLAY_MS = 10000;
  private resultTimeoutId?: any = undefined;

  meEmail = (() => {
    try { return JSON.parse(localStorage.getItem('user')||'{}')?.email || null; }
    catch { return null; }
  })();

  constructor(
    private route: ActivatedRoute,
    private bj: BlackjackService,
    private wallet: WalletService,
    private cd: ChangeDetectorRef,
    private ngZone: NgZone,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const raw = this.route.snapshot.paramMap.get('id');
    if (!raw) { this.error = 'Identifiant de table manquant'; this.loading = false; return; }
    this.tableId = /^\d+$/.test(raw) ? Number(raw) : raw;

    await this.bj.watchTable(this.tableId);
    await this.bj.wsJoin(this.tableId);
    await this.bj.wsSit(this.tableId, 0);

    this.sub = this.bj.table$.subscribe(s => {
      this.state = s;
      this.loading = false;

      if (s?.phase === 'BETTING') {
        if (!this.userEditedBet && s.minBet != null && Number(s.minBet) > 0) {
          this.betAmount = Number(s.minBet);
        }
      } else {
        // quand on quitte BETTING on autorise une ré-initialisation future
        this.userEditedBet = false;
      }

      // --- logique résultat PAYOUT
      if (s?.phase === 'PAYOUT' && s?.lastPayouts) {
        this.myPayoutObj = this.findMyPayout(s);
        this.resultMessage = this.buildResultMessage(this.myPayoutObj);

        // appliquer delta optimiste
        const net = (this.myPayoutObj && typeof this.myPayoutObj.credit === 'number' && typeof this.myPayoutObj.bet === 'number')
          ? Number(this.myPayoutObj.credit) - Number(this.myPayoutObj.bet)
          : 0;
        if (!Number.isNaN(net) && net !== 0) {
          this.wallet.applyOptimisticDelta(net);
        }

        if (this.resultTimeoutId) {
          clearTimeout(this.resultTimeoutId);
          this.resultTimeoutId = undefined;
        }
        this.resultTimeoutId = setTimeout(() => {
          this.resultMessage = null;
          this.myPayoutObj = null;
          this.resultTimeoutId = undefined;
          try { this.cd.detectChanges(); } catch {}
        }, this.RESULT_DISPLAY_MS);

        try { this.cd.detectChanges(); } catch {}
      }

      this.setupCountdown();
    });

    this.subErr = this.bj.error$.subscribe(msg => {
      if (msg) {
        this.error = msg;
        setTimeout(() => { this.error = null; this.bj.clearError(); }, 4000);
      }
    });
  }

  onBetInputChange() {
    this.userEditedBet = true;
  }

  ngOnDestroy(): void {
    if (this.resultTimeoutId) {
      clearTimeout(this.resultTimeoutId);
      this.resultTimeoutId = undefined;
    }

    try {
      const me = this.mySeat();
      if (me) { this.bj.wsLeave(this.tableId, me.index); }
    } catch {}
    this.sub?.unsubscribe();
    this.subErr?.unsubscribe();
    this.stopCountdown();
    this.bj.disconnectTable();
  }

  @HostListener('window:beforeunload')
  beforeUnload() {
    try {
      const me = this.mySeat();
      if (me) this.bj.wsLeave(this.tableId, me.index);
    } catch {}
  }

  // ---------- countdown helpers ----------
  private setupCountdown() {
    setTimeout(() => this.updateRemaining(), 0);
    if (!this.tickSub) {
      this.tickSub = interval(500).subscribe(() => {
        this.ngZone.run(() => this.updateRemaining());
      });
    }
  }

  private stopCountdown() {
    this.tickSub?.unsubscribe();
    this.tickSub = undefined;
  }

  private updateRemaining() {
    if (!this.state || !this.state.deadline) {
      this.remainingSeconds = 0;
    } else {
      this.remainingSeconds = Math.max(0, Math.ceil((this.state.deadline - Date.now()) / 1000));
    }
    try { this.cd.detectChanges(); } catch {}
  }

  // ---------- helpers ----------
  mySeat(): BJSeat | null {
    if (!this.state || !this.state.seats || !this.meEmail) return null;
    return this.state.seats.find(s => s.email === this.meEmail) || null;
  }

  myTurn(): boolean {
    const me = this.mySeat();
    if (!me || !this.state) return false;
    if (!(me.hand?.bet > 0)) return false;
    const idx = this.state.currentSeatIndex;
    return typeof idx === 'number'
      ? idx === me.index && !me.hand.busted && !me.hand.standing
      : !!me.hand && !me.hand.busted && !me.hand.standing;
  }

  // --- Trouve le payout correspondant
  private findMyPayout(state: BJTableState | null): any | null {
    if (!state || !state.lastPayouts) return null;
    const me = this.mySeat();
    if (!me) return null;

    return state.lastPayouts.find((x: any) => {
      const seatNum = typeof x.seat === 'string' ? Number(x.seat) : x.seat;
      return seatNum === me.index;
    }) ?? null;
  }

  // --- Construit un message lisible
  private buildResultMessage(payout: any | null): string | null {
    if (!payout) return null;

    const outcomeRaw = (payout.outcome ?? '').toString();
    const outcome = outcomeRaw.trim().toUpperCase();
    const bet = Number(payout.bet ?? 0);
    const credit = Number(payout.credit ?? 0);
    const net = credit - bet;

    let finalOutcome = outcome || '';
    if (!finalOutcome) {
      if (credit > bet) finalOutcome = 'WIN';
      else if (credit === bet) finalOutcome = 'PUSH';
      else finalOutcome = 'LOSE';
    } else {
      if (finalOutcome === 'WON') finalOutcome = 'WIN';
      if (finalOutcome === 'LOSS') finalOutcome = 'LOSE';
      if (['TIE','DRAW'].includes(finalOutcome)) finalOutcome = 'PUSH';
      if (finalOutcome === 'BJ') finalOutcome = 'BLACKJACK';
    }

    switch (finalOutcome) {
      case 'WIN':
        return `✅ Tu as gagné ${net > 0 ? net : credit} crédits !`;
      case 'BLACKJACK':
        return `🖤 Blackjack ! +${net > 0 ? net : credit} crédits !`;
      case 'PUSH':
        return `➖ Push — ta mise a été rendue.`;
      case 'LOSE':
      default:
        return `❌ Tu as perdu ${bet} crédits.`;
    }
  }

  canPlaceBet(s: BJTableState | null): boolean {
    if (!s) return false;
    const min = s.minBet ?? 0;
    const max = s.maxBet ?? 0;
    const amount = Number(this.betAmount) || 0;
    if (amount <= 0) return false;
    if (min > 0 && amount < min) return false;
    if (max > 0 && amount > max) return false;
    return true;
  }

  // --- actions WS
  async sit(index: number) { await this.bj.wsSit(this.tableId, index); }
  async leave() { const me = this.mySeat(); if (me) await this.bj.wsLeave(this.tableId, me.index); }
  async bet() {
    if (!this.betAmount || this.betAmount <= 0) return;
    const me = this.mySeat();
    if (!me) { this.error = 'Tu dois être assis pour miser.'; return; }
    // client-side validation
    const s = this.state;
    if (s) {
      const min = s.minBet ?? 0;
      const max = s.maxBet ?? 0;
      if (min > 0 && this.betAmount < min) {
        this.error = `Mise minimale: ${min}`;
        setTimeout(() => this.error = null, 3500);
        return;
      }
      if (max > 0 && this.betAmount > max) {
        this.error = `Mise maximale: ${max}`;
        setTimeout(() => this.error = null, 3500);
        return;
      }
    }
    this.error = null;
    try {
      await this.bj.wsBet(this.tableId, this.betAmount, me.index);
    } catch (e: any) {
      this.error = e?.message || 'Erreur lors de la mise';
      setTimeout(() => this.error = null, 3500);
    }
  }

  async hit() { const me = this.mySeat(); if (me) { await this.bj.wsAction(this.tableId, 'HIT', me.index); } }
  async stand() { const me = this.mySeat(); if (me) await this.bj.wsAction(this.tableId, 'STAND', me.index); }
  async double() { const me = this.mySeat(); if (me) await this.bj.wsAction(this.tableId, 'DOUBLE', me.index); }
  async surrender() { const me = this.mySeat(); if (me) await this.bj.wsAction(this.tableId, 'SURRENDER', me.index); }

  closeTable() {
    this.bj.closeTable(this.tableId).subscribe({
      next: () => this.router.navigate(['/play/blackjack']),
      error: (e: any) => { this.error = e?.error || e?.message || 'Impossible de fermer la table'; }
    });
  }


  // --- conversion nom de fichier
  cardFileName(c: any): string {
    if (!c) return 'back.svg';
    const suitMap: Record<string, string> = {
      CLUBS: 'clubs', DIAMONDS: 'diamonds', HEARTS: 'hearts', SPADES: 'spades',
      '♠': 'spades', '♦': 'diamonds', '♥': 'hearts', '♣': 'clubs'
    };
    const rankMap: Record<string, string> = {
      ACE: 'ace', JACK: 'jack', QUEEN: 'queen', KING: 'king',
      TWO: '2', THREE: '3', FOUR: '4', FIVE: '5', SIX: '6',
      SEVEN: '7', EIGHT: '8', NINE: '9', TEN: '10'
    };
    const suit = suitMap[(c.suit || '').toUpperCase()] ?? c.suit?.toLowerCase();
    const rank = rankMap[(c.rank || '').toUpperCase()] ?? c.rank?.toLowerCase();
    return `${suit}_${rank}.svg`;
  }
}
