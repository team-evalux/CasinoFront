// src/app/services/game/blackjack.service.ts
import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {BehaviorSubject, Observable, throwError} from 'rxjs';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import {BJSeat, BJTableState} from './blackjack.models';
import {catchError} from 'rxjs/operators';
import {Router} from '@angular/router';

// --- DTOs alignés avec ton back ---
export interface BJCreateTableReq {
  privateTable?: boolean;
  maxSeats?: number;
  code?: string;
  name?: string;
  minBet?: number;
  maxBet?: number;
}

export interface BJTableSummary {
  id: number;
  maxSeats: number;
  isPrivate: boolean;
  phase: string;
  name?: string;
  minBet?: number;
  maxBet?: number;
  creatorEmail?: string;
}

export interface JoinOrCreateMsg {
  tableId?: number | string;
  code?: string;
  // (les autres champs optionnels de création si nécessaire)
}

export interface SitMsg { tableId: number | string; seatIndex: number; code?: string | null; }
export interface BetMsg { tableId: number | string; amount: number; seatIndex?: number; }
export type ActionType = 'HIT'|'STAND'|'DOUBLE'|'SPLIT'|'SURRENDER';
export interface ActionMsg { tableId: number | string; seatIndex: number; type: ActionType; }

@Injectable({ providedIn: 'root' })
export class BlackjackService {
  private apiBase = 'http://localhost:8080/api/bj';
  private wsUrl  = 'http://localhost:8080/ws';

  private lobbySubject = new BehaviorSubject<BJTableSummary[] | null>(null);
  lobby$ = this.lobbySubject.asObservable();

  private tableSubject = new BehaviorSubject<any | null>(null);
  table$ = this.tableSubject.asObservable();

  // nouvel observable d'erreurs personnelles (messages server -> user)
  private errorSubject = new BehaviorSubject<string | null>(null);
  error$ = this.errorSubject.asObservable();

  private stomp?: Client;
  private currentTableId?: number | string;
  private onConnectedResolvers: Array<() => void> = [];

  // <-- nouvelles références aux subscriptions STOMP
  private lobbySubscription?: any;
  private errorsSubscription?: any;
  private tableSubscription?: any;
  private currentTableIsPrivate: boolean = false;


  constructor(private http: HttpClient, private zone: NgZone,private router: Router) {}

  // --- REST ---
  listTables(): Observable<BJTableSummary[]> {
    return this.http.get<BJTableSummary[]>(`${this.apiBase}/tables`);
  }

  getTableMeta(tableId: number | string) {
    return this.http.get<any>(`${this.apiBase}/table/${tableId}`);
  }

  createTable(req: BJCreateTableReq) {
    return this.http.post<{ id: number | string; code?: string; private: boolean }>(
      `${this.apiBase}/table`, req
    ).pipe(
      catchError(err => {
        const msg = err.error?.error || "Erreur inconnue";
        this.errorSubject.next(msg);
        return throwError(() => new Error(msg));
      })
    );
  }


  // --- WS connection promise ---
  private waitConnected(): Promise<void> {
    if (this.stomp && this.stomp.connected) return Promise.resolve();
    return new Promise<void>((resolve) => this.onConnectedResolvers.push(resolve));
  }

  // src/app/services/game/blackjack.service.ts (méthode connectIfNeeded)
  connectIfNeeded() {
    if (this.stomp && this.stomp.active) return;

    const token = localStorage.getItem('jwt') || '';
    const urlWithToken = `${this.wsUrl}?token=${encodeURIComponent(token)}`;

    this.stomp = new Client({
      webSocketFactory: () => new SockJS(urlWithToken),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
        token
      },
      reconnectDelay: 1500,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        console.log('[WS] connected, subscribing lobby + errors etc.');
        // résout les promises waitConnected()
        const toResolve = [...this.onConnectedResolvers];
        this.onConnectedResolvers.length = 0;
        toResolve.forEach(r => r());

        // Si on avait des subscriptions de l'ancienne instance, unsubscribe-les d'abord
        try { this.lobbySubscription?.unsubscribe(); } catch {}
        try { this.errorsSubscription?.unsubscribe(); } catch {}
        try { this.tableSubscription?.unsubscribe(); } catch {}

        // (re)subscribe lobby (unique)
        this.lobbySubscription = this.stomp!.subscribe('/topic/bj/lobby', (msg) =>
          this.zone.run(() => this.onLobby(msg))
        );

        // errors queue (unique)
        this.errorsSubscription = this.stomp!.subscribe('/user/queue/bj/errors', (msg) =>
          this.zone.run(() => {
            try {
              console.log('[WS] received /user/queue/bj/errors raw:', msg);
              const p = JSON.parse(msg.body);
              console.log('[WS] parsed user error:', p);
              this.errorSubject.next(p?.error || p?.msg || 'Erreur serveur');
              // conserve le clearError existant
              setTimeout(() => this.clearError(), 5000);
            } catch (e) {
              console.warn('[WS] error parsing /user/queue/bj/errors', e);
            }
          })
        );

        // ré-subscribe au topic de la table courante si demandé
        if (this.currentTableId != null) {
          console.log('[WS] re-subscribing to current table', this.currentTableId, 'isPrivate=', this.currentTableIsPrivate);
          this.subscribeTableTopic(this.currentTableId, this.currentTableIsPrivate);
        }

      },
      onStompError: () => {}
    });

    this.stomp.activate();
  }

  clearError() {
    this.errorSubject.next(null);
  }

  private onLobby(msg: IMessage) {
    try {
      const payload: BJTableSummary[] = JSON.parse(msg.body);
      this.lobbySubject.next(payload);
    } catch {}
  }

  private subscribeTableTopic(tableId: number | string, isPrivate = false) {
    // si c'est déjà la même table et qu'on a une subscription, rien à faire
    if (String(this.currentTableId) === String(tableId) && this.tableSubscription) return;

    // unsubscribe si actif
    try { this.tableSubscription?.unsubscribe(); } catch {}
    this.tableSubscription = undefined;

    // met à jour l'id courant (utile pour reconnexion) et si privé/public
    this.currentTableId = tableId;
    this.currentTableIsPrivate = !!isPrivate;

    if (!this.stomp) return;

    const dest = isPrivate ? `/user/queue/bj/table/${tableId}` : `/topic/bj/table/${tableId}`;
    console.log('[WS] subscribe to table destination ->', dest);

    this.tableSubscription = this.stomp!.subscribe(dest, (msg) =>
      this.zone.run(() => this.onTableEvent(msg))
    );
  }


  private unsubscribeTableTopic() {
    try { this.tableSubscription?.unsubscribe(); } catch {}
    this.tableSubscription = undefined;
    this.currentTableId = undefined;
  }

  // src/app/services/game/blackjack.service.ts (ajoute)
  closeTable(tableId: number | string) {
    return this.http.delete(`${this.apiBase}/table/${tableId}`);
  }

  private rankToValue(rank: string): { value: number; isAce: boolean } {
    const r = String(rank ?? '').toUpperCase();
    if (r === 'A' || r === 'ACE') return { value: 11, isAce: true };
    if (r === 'K' || r === 'KING') return { value: 10, isAce: false };
    if (r === 'Q' || r === 'QUEEN') return { value: 10, isAce: false };
    if (r === 'J' || r === 'JACK') return { value: 10, isAce: false };
    if (r === '10' || r === 'T' || r === 'TEN') return { value: 10, isAce: false };
    if (r === '9' || r === 'NINE') return { value: 9, isAce: false };
    if (r === '8' || r === 'EIGHT') return { value: 8, isAce: false };
    if (r === '7' || r === 'SEVEN') return { value: 7, isAce: false };
    if (r === '6' || r === 'SIX') return { value: 6, isAce: false };
    if (r === '5' || r === 'FIVE') return { value: 5, isAce: false };
    if (r === '4' || r === 'FOUR') return { value: 4, isAce: false };
    if (r === '3' || r === 'THREE') return { value: 3, isAce: false };
    if (r === '2' || r === 'TWO') return { value: 2, isAce: false };
    // fallback
    const n = parseInt(r, 10);
    if (!Number.isNaN(n)) return { value: Math.max(0, n), isAce: false };
    return { value: 0, isAce: false };
  }

  private computeBestTotal(cards: any[] | undefined): number {
    if (!Array.isArray(cards) || cards.length === 0) return 0;
    let sum = 0;
    let aces = 0;
    for (const c of cards) {
      const rank = c?.rank ?? c; // parfois payloade contient juste la string
      const { value, isAce } = this.rankToValue(rank);
      sum += value;
      if (isAce) aces++;
    }
    while (sum > 21 && aces > 0) {
      sum -= 10;
      aces--;
    }
    return sum;
  }

  private onTableEvent(msg: IMessage) {
    try {
      console.log('[WS] onTableEvent raw:', msg);
      const evt = JSON.parse(msg.body);
      console.log('[WS] onTableEvent parsed type=', evt?.type, 'payload=', evt?.payload);
      if (!evt || !evt.type) return;
      const curr = this.tableSubject.value ? { ...this.tableSubject.value } : null;

      switch (evt.type) {
        case 'TABLE_STATE': {
          const state = this.normalizeState(evt.payload);
          this.tableSubject.next(state);
          break;
        }
        case 'HAND_START': {
          // on part d'un état courant (ou d'un squelette)
          const base = curr ?? this.normalizeState({});
          base.seats = this.normalizeSeatsMap(evt.payload.players);
          // dealerUp peut être une carte unique ; on veut un tableau de cartes
          const dealerUp = evt.payload?.dealerUp ? [evt.payload.dealerUp] : (base.dealer?.cards ?? []);
          base.dealer = { cards: dealerUp, total: this.computeBestTotal(dealerUp) };
          base.phase = 'PLAYING';
          base.deadline = evt.payload.deadline ?? base.deadline;
          this.tableSubject.next(base);
          break;
        }
        case 'PLAYER_TURN': {
          if (!curr) break;
          const s = { ...curr, currentSeatIndex: evt.payload.seat, deadline: evt.payload.deadline };
          this.tableSubject.next(s);
          break;
        }
        case 'BET_UPDATE': {
          if (!curr) break;
          const s = { ...curr };
          const i = evt.payload.seat;
          const bet = evt.payload.bet;
          if (s.seats?.[i]) s.seats[i] = { ...s.seats[i], hand: { ...s.seats[i].hand, bet } };
          this.tableSubject.next(s);
          break;
        }
        case 'ACTION_RESULT': {
          if (!curr) break;
          const s = { ...curr };
          const i = evt.payload.seat;
          if (s.seats?.[i]) {
            if (evt.payload.hand) {
              // Met à jour la main côté client et recalcule total
              const newHand = { ...s.seats[i].hand, ...evt.payload.hand };
              newHand.total = this.computeBestTotal(newHand.cards);
              s.seats[i] = { ...s.seats[i], hand: newHand };
            }
          }
          this.tableSubject.next(s);
          break;
        }
        case 'DEALER_TURN_START': {
          if (!curr) break;
          const s = { ...curr, phase: 'DEALER_TURN' };
          if (evt.payload?.dealer) {
            const dealerCards = evt.payload.dealer.cards ?? evt.payload.dealer;
            s.dealer = { cards: dealerCards, total: this.computeBestTotal(dealerCards) };
          }
          s.currentSeatIndex = undefined;
          this.tableSubject.next(s);
          break;
        }
        case 'DEALER_TURN_END': {
          if (!curr) break;
          const s = { ...curr };
          if (evt.payload?.dealer) {
            const dealerCards = evt.payload.dealer.cards ?? evt.payload.dealer;
            s.dealer = { cards: dealerCards, total: this.computeBestTotal(dealerCards) };
          }
          this.tableSubject.next(s);
          break;
        }
        case 'PAYOUTS': {
          console.debug('WS EVENT PAYOUTS payload:', evt.payload);
          if (!curr) break;
          const s = { ...curr, phase: 'PAYOUT', lastPayouts: evt.payload?.payouts ?? [] };
          this.tableSubject.next(s);
          break;
        }

        case 'TABLE_CLOSED': {
          console.log('[WS] Table fermée par le créateur.');
          this.tableSubject.next(null);
          // redirige vers le lobby
          this.zone.run(() => {
            this.router.navigate(['/play/blackjack']);
          });
          break;
        }

        default:
          break;
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  // ---- NOUVEAU: normalisations ----
  private normalizeState(payload: any): {
    phase: any;
    createdAt: any;
    maxBet: any;
    minBet: any;
    name: any;
    dealer: any;
    currentSeatIndex: any;
    maxSeats: any;
    id: string;
    seats: BJSeat[];
    shoeCount: any;
    creatorEmail?: string;
    deadline?: number;
  } {
    // Normalise le dealer et les seats ; calcule les totals
    const seats = this.normalizeSeatsMap(payload.seats);
    const dealerObj = payload.dealer ?? { cards: [], total: 0 };
    const dealerCards = dealerObj.cards ?? [];
    const dealerTotal = this.computeBestTotal(dealerCards);

    return {
      id: String(payload.tableId ?? payload.id ?? ''),
      name: payload.name ?? undefined,
      maxSeats: payload.maxSeats ?? (payload.seats ? Object.keys(payload.seats).length : 5),
      seats: seats,
      dealer: { cards: dealerCards, total: dealerTotal },
      phase: this.normPhase(payload.phase),
      minBet: payload.minBet ?? 0,
      maxBet: payload.maxBet ?? 0,
      createdAt: payload.createdAt ?? undefined,
      shoeCount: payload.shoeCount ?? undefined,
      currentSeatIndex: payload.currentSeatIndex ?? undefined,
      creatorEmail: payload.creatorEmail ?? undefined,
      deadline: payload.deadline ?? undefined
    };
  }



  private normalizeSeatsMap(seatsMap: any): BJSeat[] {
    if (!seatsMap) return [];
    return Object.keys(seatsMap)
      .map(k => Number(k))
      .sort((a, b) => a - b)
      .map(i => {
        const s = seatsMap[i] ?? {};
        const hand = s.hand ?? { cards: [], standing: false, busted: false, bet: 0 };
        // calc total localement
        const total = this.computeBestTotal(hand.cards);
        return {
          index: i,
          userId: s.userId,
          email: s.email,
          status: s.status,
          hand: {
            ...hand,
            total: total
          }
        } as BJSeat;
      });
  }

  private normPhase(p: any): any {
    if (!p) return 'BETTING';
    if (typeof p === 'string') return p;
    return p.name ?? 'BETTING';
  }



  private onTableState(msg: IMessage) {
    try {
      const payload = JSON.parse(msg.body);
      this.tableSubject.next(payload);
    } catch {}
  }

  /** Commence à recevoir l’état de la table (abonnement garanti après connexion). */
  async watchTable(tableId: number | string) {
    if (String(this.currentTableId) === String(tableId) && this.tableSubscription) {
      return;
    }

    // stocke l'intention
    this.currentTableId = tableId;

    // assure connexion WS
    this.connectIfNeeded();
    await this.waitConnected();

    // fetch meta to know if private (and subscribe accordingly)
    try {
      const meta = await this.getTableMeta(tableId).toPromise();
      const isPrivate = !!meta?.isPrivate;
      console.log('[WS] watchTable meta isPrivate=', isPrivate, 'meta=', meta);
      this.subscribeTableTopic(tableId, isPrivate);
    } catch (err) {
      console.warn('[WS] watchTable getTableMeta failed, subscribing to public topic by default', err);
      this.subscribeTableTopic(tableId, false);
    }
  }


  disconnectTable() {
    // annule subscription table (ne touche pas au socket global)
    this.unsubscribeTableTopic();
    // ne remplace pas la tableSubject si on veut forcer null côté UI
    this.tableSubject.next(null);
    this.currentTableId = undefined;
  }

  disconnectAll() {
    // cleanup toutes les subscriptions et stop le stomp client
    try { this.lobbySubscription?.unsubscribe(); } catch {}
    try { this.errorsSubscription?.unsubscribe(); } catch {}
    try { this.tableSubscription?.unsubscribe(); } catch {}

    this.lobbySubscription = undefined;
    this.errorsSubscription = undefined;
    this.tableSubscription = undefined;
    this.currentTableId = undefined;

    this.lobbySubject.next(null);
    this.tableSubject.next(null);
    try { this.stomp?.deactivate(); } catch {}
    this.stomp = undefined;
  }

  // --- Envois d’actions via WS ---
  async wsJoin(tableId: number | string, code?: string | null) {
    await this.waitConnected();
    this.publish('/app/bj/join', <JoinOrCreateMsg>{ tableId, code }, code ? { code } : undefined);
  }

  async wsSit(tableId: number | string, seatIndex: number, code?: string | null) {
    await this.waitConnected();
    this.publish('/app/bj/sit', <SitMsg>{ tableId, seatIndex, code }, code ? { code } : undefined);
  }


  async wsBet(tableId: number | string, amount: number, seatIndex?: number) {
    await this.waitConnected();
    this.publish('/app/bj/bet', <BetMsg>{ tableId, amount, seatIndex });
  }

  async wsAction(tableId: number | string, type: ActionType, seatIndex: number) {
    await this.waitConnected();
    this.publish('/app/bj/action', <ActionMsg>{ tableId, seatIndex, type });
  }

  async wsLeave(tableId: number | string, seatIndex: number) {
    await this.waitConnected();
    this.publish('/app/bj/leave', <SitMsg>{ tableId, seatIndex });
  }

  private publish(dest: string, body: any, extraHeaders?: Record<string,string>) {
    if (!this.stomp || !this.stomp.connected) {
      console.warn('[WS] publish blocked, stomp not connected:', dest, body);
      return;
    }

    // assure que le header 'code' est présent si on l'a dans le body
    const headers: Record<string,string> = {
      ...(extraHeaders ?? {}),
      ...(body && body.code ? { code: String(body.code) } : {})
    };

    console.log('[WS] publish ->', dest, body, 'headers=', headers);
    this.stomp.publish({
      destination: dest,
      body: JSON.stringify(body ?? {}),
      headers
    });
  }

}
