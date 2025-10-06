import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
  imports: [CommonModule, FormsModule],
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
    console.log("Tentative fermeture table:", tableId);
    this.bj.closeTable(tableId).subscribe({
      next: () => {
        console.log("Table fermée avec succès:", tableId);
        this.tables = this.tables.filter(t => t.id !== tableId);
      },
      error: (e: any) => {
        console.error("Erreur fermeture table:", e);
        this.error = e?.error || e?.message || 'Impossible de fermer la table';
      }
    });
  }

  goTable(t: BJTableSummary) {
    if (t.isPrivate) {
      const provided = window.prompt('Table privée — entrez le code d’accès :');
      if (!provided) {
        return;
      }
      this.router.navigate(['/play/blackjack/table', t.id], { state: { code: provided } });
    } else {
      this.router.navigate(['/play/blackjack/table', t.id]);
    }
  }

  validateBets() {
    const min = Number(this.create.minBet);
    const max = Number(this.create.maxBet);

    // ✅ impose un minimum de 100
    if (min < 100) {
      this.create.minBet = 100;
    }

    // ✅ impose un minimum de 4 chiffres pour max (>= 1000)
    if (max < 1000) {
      this.create.maxBet = 1000;
    }

    // ✅ plafonne à 1 million
    if (max > 1000000) {
      this.create.maxBet = 1000000;
    }

    // ✅ s’assure que max >= min
    if (this.create.maxBet < this.create.minBet) {
      this.create.maxBet = this.create.minBet;
    }
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
        if (navExtras) {
          await this.router.navigate(['/play/blackjack/table', id], navExtras);
        } else {
          await this.router.navigate(['/play/blackjack/table', id]);
        }
        await this.bj.watchTable(id);
        await this.bj.wsJoin(id, res.code);
        await this.bj.wsSit(id, 0, res.code);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error || 'Vous possédez déjà une table. Fermez-la avant d\'en créer une nouvelle.';
      }
    });
  }
  protected readonly localStorage = localStorage;
  protected readonly JSON = JSON;
}
