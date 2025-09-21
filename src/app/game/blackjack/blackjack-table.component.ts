import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BlackjackService } from '../../services/game/blackjack.service';
import { BJSeat, BJTableState } from '../../services/game/blackjack.models';
import { Subscription, interval } from 'rxjs';
import { WalletService } from '../../services/wallet.service';
import { ChangeDetectorRef, NgZone } from '@angular/core';

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

  betAmount = 100;
  private sub?: Subscription;
  private subErr?: Subscription;

  // countdown stable pour le template (évite ExpressionChangedAfter...)
  remainingSeconds: number = 0;
  private tickSub?: Subscription;

  // stocke l'objet payout correspondant au joueur courant lorsqu'il y en a un
  myPayoutObj: any | null = null;
  // message user-friendly affiché lors de la phase PAYOUT
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
    // auto-sit seat 0 (solo) : si tu veux garder l'auto-join, sinon supprime
    await this.bj.wsSit(this.tableId, 0);

    // abonnement état table
    this.sub = this.bj.table$.subscribe(s => {
      this.state = s;
      this.loading = false;

      // logs utiles (observable côté front)
      console.debug('Table update -> phase:', s?.phase, 'deadline:', s?.deadline, 'lastPayouts:', s?.lastPayouts);

      // si on est en payout : calcule l'objet payout pour le joueur courant et prépare un message
      if (s?.phase === 'PAYOUT' && s?.lastPayouts) {
        this.myPayoutObj = this.findMyPayout(s);
        this.resultMessage = this.buildResultMessage(this.myPayoutObj);

        // apply optimistic delta for immediate header update; WalletService will reconcile
        const net = (this.myPayoutObj && typeof this.myPayoutObj.credit === 'number' && typeof this.myPayoutObj.bet === 'number')
          ? Number(this.myPayoutObj.credit) - Number(this.myPayoutObj.bet)
          : 0;

        if (!Number.isNaN(net) && net !== 0) {
          this.wallet.applyOptimisticDelta(net);
        }

        // annule ancien timeout si existant
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
      } else {
        // si on n'est pas en PAYOUT :
        // - ne supprime pas le message si on a un timeout actif (on veut que le résultat reste visible)
        if (!this.resultTimeoutId) {
          this.myPayoutObj = null;
          this.resultMessage = null;
        }
      }

      // démarre/arrête le timer qui calcule remainingSeconds
      this.setupCountdown();
    });

    // abonnement aux erreurs server -> user (inchangé)
    this.subErr = this.bj.error$.subscribe(msg => {
      if (msg) {
        this.error = msg;
        setTimeout(() => { this.error = null; this.bj.clearError(); }, 4000);
      }
    });
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
    // calc initial valeur asynchrone pour éviter ExpressionChangedAfter...
    setTimeout(() => this.updateRemaining(), 0);

    if (!this.tickSub) {
      // run outside angular then re-enter zone only when updating value to reduce CD churn
      this.tickSub = interval(500).subscribe(() => {
        this.ngZone.run(() => {
          this.updateRemaining();
        });
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
      const diff = Math.max(0, Math.ceil((this.state.deadline - Date.now()) / 1000));
      this.remainingSeconds = diff;
    }
    // force detect si nécessaire
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
    const idx = this.state.currentSeatIndex;
    return typeof idx === 'number'
      ? idx === me.index && !me.hand.busted && !me.hand.standing
      : !!me.hand && !me.hand.busted && !me.hand.standing;
  }

  // trouve dans lastPayouts l'entrée correspondant au joueur courant (par index de seat)
  private findMyPayout(state: BJTableState | null): any | null {
    if (!state || !state.lastPayouts) return null;
    const me = this.mySeat();
    if (!me) {
      console.debug('findMyPayout: no mySeat (peut-être non assis)');
      return null;
    }

    const p = state.lastPayouts.find((x: any) => {
      const seatNum = typeof x.seat === 'string' ? Number(x.seat) : x.seat;
      return seatNum === me.index;
    }) ?? null;

    console.debug('findMyPayout -> seatIndex:', me.index, 'lastPayouts:', state.lastPayouts, 'found:', p);
    return p;
  }


  // construit un message lisible pour l'utilisateur
  private buildResultMessage(payout: any | null): string | null {
    if (!payout) return null;

    // normalise les champs
    const outcomeRaw = (payout.outcome ?? '').toString();
    const outcome = outcomeRaw.trim().toUpperCase();
    const bet = Number(payout.bet ?? 0);
    const credit = Number(payout.credit ?? 0);
    const net = credit - bet;

    // Si outcome non présent ou inconnu, on tente d'inférer depuis bet/credit
    let finalOutcome = outcome || '';
    if (!finalOutcome) {
      if (credit > bet) finalOutcome = 'WIN';
      else if (credit === bet) finalOutcome = 'PUSH';
      else finalOutcome = 'LOSE';
    } else {
      // mappe synonymes possibles
      if (finalOutcome === 'WON') finalOutcome = 'WIN';
      if (finalOutcome === 'LOSS') finalOutcome = 'LOSE';
      if (finalOutcome === 'TIE' || finalOutcome === 'DRAW') finalOutcome = 'PUSH';
      if (finalOutcome === 'BJ') finalOutcome = 'BLACKJACK';
    }

    // debug pour voir ce qu'on a reçu / inféré
    console.debug('buildResultMessage -> rawOutcome:', outcomeRaw, 'inferred:', finalOutcome, { bet, credit, net });

    switch (finalOutcome) {
      case 'WIN':
        // si net <= 0 fallback : affiche le credit quand même
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

  // actions via WS (inchangés)
  async sit(index: number) { await this.bj.wsSit(this.tableId, index); }
  async leave() { const me = this.mySeat(); if (me) await this.bj.wsLeave(this.tableId, me.index); }
  async bet() { if (!this.betAmount || this.betAmount <= 0) return; const me = this.mySeat(); if (!me) return; this.bj.wsBet(this.tableId, this.betAmount, me.index); }
  async hit() { const me = this.mySeat(); if (me) await this.bj.wsAction(this.tableId, 'HIT', me.index); }
  async stand() { const me = this.mySeat(); if (me) await this.bj.wsAction(this.tableId, 'STAND', me.index); }
  async double() { const me = this.mySeat(); if (me) await this.bj.wsAction(this.tableId, 'DOUBLE', me.index); }
  async surrender()  { const me = this.mySeat(); if (me) await this.bj.wsAction(this.tableId, 'SURRENDER', me.index); }

  // --- fermeture table si creator ---
  closeTable() {
    // on appelle l'API et on s'abonne (ne pas utiliser toPromise())
    this.bj.closeTable(this.tableId).subscribe({
      next: () => {
        // retourne au lobby
        this.router.navigate(['/play/blackjack']);
      },
      error: (e: any) => {
        this.error = e?.error || e?.message || 'Impossible de fermer la table';
      }
    });
  }

  asCardText(rank: string, suit: string) { return `${rank}${suit}`; }
}
