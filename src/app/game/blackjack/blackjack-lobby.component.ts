import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BlackjackService, BJTableSummary } from '../../services/game/blackjack.service';
import {Subscription, combineLatest, timer, of, firstValueFrom} from 'rxjs';
import { AuthService } from '../../services/auth.service';

type Visibility = 'PUBLIC' | 'PRIVATE';

interface CreateForm {
  name: string;
  maxSeats: number;
  minBet: number;
  maxBet: number;
  visibility: Visibility;
  code?: string;
}

@Component({
  selector: 'app-blackjack-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './blackjack-lobby.component.html',
  styleUrls: ['./blackjack-lobby.component.css']
})
export class BlackjackLobbyComponent implements OnInit, OnDestroy {
  tables: BJTableSummary[] = [];
  loading = false;
  error: string | null = null;
  isLoggedIn = false;

  create: CreateForm = {
    name: '',
    maxSeats: 5,
    minBet: 100,
    maxBet: 5000,
    visibility: 'PUBLIC',
    code: ''
  };

  private sub?: Subscription;
  private authSub?: Subscription;

  constructor(
    private bj: BlackjackService,
    private router: Router,
    private auth: AuthService
  ) {
    // état initial
    this.isLoggedIn = this.safeIsLoggedIn();
  }

  ngOnInit(): void {
    // réagit aux changements d’auth si dispo
    try {
      const s = (this.auth as any).authState$;
      if (s?.subscribe) {
        this.authSub = s.subscribe((v: any) => {
          const was = this.isLoggedIn;
          this.isLoggedIn = !!v;
          if (was !== this.isLoggedIn) this.reloadLobby();
        });
      }
    } catch {}

    this.reloadLobby();
  }

  private reloadLobby() {
    // purge / reset
    this.sub?.unsubscribe();
    this.tables = [];
    this.error = null;
    this.loading = false;

    if (!this.safeIsLoggedIn()) {
      // non connecté : pas d’appels réseau, pas de WS
      this.isLoggedIn = false;
      return;
    }

    this.isLoggedIn = true;
    this.bj.connectIfNeeded(); // interne : ne fait rien sans JWT

    this.loading = true;
    // On écoute le flux lobby WS s’il arrive, sinon on fait un GET de secours.
    this.sub = combineLatest([this.bj.lobby$, timer(0)]).subscribe(([ws]) => {
      if (ws) {
        this.tables = ws;
        this.loading = false;
      } else {
        this.bj.listTables().subscribe({
          next: (t) => { this.tables = t; this.loading = false; },
          error: () => { this.error = 'Impossible de charger les tables.'; this.loading = false; }
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.authSub?.unsubscribe();
  }

  async closeTableFromLobby(tableId: number | string) {
    if (!this.safeIsLoggedIn()) {
      this.error = 'Connecte-toi pour gérer les tables.';
      return;
    }
    try {
      await firstValueFrom(this.bj.closeTable(tableId));
      this.tables = this.tables.filter(t => t.id !== tableId);
    } catch (e: any) {
      this.error = e?.error || e?.message || 'Impossible de fermer la table';
    }
  }

  async goTable(t: BJTableSummary) {
    // Navigation simple : la page “table” gère l’auto-join (et le cas privé)
    this.router.navigate(['/play/blackjack/table', t.id]);
  }

  validateBets() {
    const min = Number(this.create.minBet);
    const max = Number(this.create.maxBet);
    if (min < 100) this.create.minBet = 100;
    if (max < 1000) this.create.maxBet = 1000;
    if (max > 1000000) this.create.maxBet = 1000000;
    if (this.create.maxBet < this.create.minBet) this.create.maxBet = this.create.minBet;
  }

  async onCreate() {
    if (!this.safeIsLoggedIn()) { this.error = 'Connecte-toi pour créer une table.'; return; }
    this.loading = true; this.error = null;

    const req = {
      privateTable: this.create.visibility === 'PRIVATE',
      maxSeats: Number(this.create.maxSeats) || 5,
      code: this.create.visibility === 'PRIVATE' ? (this.create.code || '') : undefined,
      name: this.create.name?.trim() || undefined,
      minBet: Number(this.create.minBet) || 0,
      maxBet: Number(this.create.maxBet) || 0
    };

    this.bj.createTable(req).subscribe({
      next: async (res) => {
        this.loading = false;
        const id = res.id;
        const navExtras = res.code ? { state: { code: res.code } } : undefined;
        if (navExtras) await this.router.navigate(['/play/blackjack/table', id], navExtras);
        else await this.router.navigate(['/play/blackjack/table', id]);
      },
      error: (err) => {
        this.loading = false;
        const serverMsg = err?.error?.error ?? err?.error?.message ?? err?.message ?? null;
        this.error = serverMsg || 'Erreur lors de la création de la table.';
        console.warn('[Lobby] createTable error:', err);
      }
    });
  }

  private safeIsLoggedIn(): boolean {
    try {
      if (typeof this.auth.isLoggedIn === 'function') return !!this.auth.isLoggedIn();
      return !!localStorage.getItem('jwt');
    } catch { return false; }
  }

  protected readonly localStorage = localStorage;
  protected readonly JSON = JSON;
}
