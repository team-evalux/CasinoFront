import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BlackjackService, BJTableSummary } from '../../services/game/blackjack.service';
import { Subscription, combineLatest, timer } from 'rxjs';
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

  constructor(
    private bj: BlackjackService,
    private router: Router,
    private auth: AuthService
  ) {
    this.isLoggedIn = this.auth.isLoggedIn();
  }

  ngOnInit(): void {
    this.bj.connectIfNeeded();
    this.loading = true;
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
  }

  closeTableFromLobby(tableId: number | string) {
    this.bj.closeTable(tableId).subscribe({
      next: () => {
        this.tables = this.tables.filter(t => t.id !== tableId);
      },
      error: (e: any) => {
        this.error = e?.error || e?.message || 'Impossible de fermer la table';
      }
    });
  }

  async goTable(t: BJTableSummary) {
    // Plus de prompt ici : on enverra le code sur la page de la table via un modal
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
    if (!this.isLoggedIn) { this.error = 'Connecte-toi pour créer une table.'; return; }
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

        // 👉 on ne fait plus watchTable/wsJoin/wsSit ici.
        // Le composant de la table s’en charge (auto-join + auto-seat).
        if (navExtras) {
          await this.router.navigate(['/play/blackjack/table', id], navExtras);
        } else {
          await this.router.navigate(['/play/blackjack/table', id]);
        }
      },
      error: (err) => {
        this.loading = false;

        // extrait le vrai message backend si présent
        const serverMsg =
          err?.error?.error ?? // { error: "..."} (notre back)
          err?.error?.message ??
          err?.message ??
          null;

        // si pas de message lisible, fallback générique
        this.error = serverMsg || 'Erreur lors de la création de la table.';

        // optionnel : log pour debug
        console.warn('[Lobby] createTable error:', err);
      }
    });
  }

  protected readonly localStorage = localStorage;
  protected readonly JSON = JSON;
}
