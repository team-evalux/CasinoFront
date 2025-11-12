import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeaderboardService, LeaderboardEntry } from '../services/leaderboard.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './leaderboard.component.html',
  styleUrls: ['./leaderboard.component.css']
})
export class LeaderboardComponent implements OnInit {

  private api = inject(LeaderboardService);

  loading = false;
  error: string | null = null;
  data: LeaderboardEntry[] = [];
  limit = 50;

  ngOnInit(): void {
    this.fetch();
  }

  fetch() {
    this.loading = true;
    this.error = null;
    this.api.getTop(this.limit).subscribe({
      next: rows => {
        this.data = rows;
        this.loading = false;
      },
      error: err => {
        this.error = err?.error?.error || 'Impossible de charger le classement.';
        this.loading = false;
      }
    });
  }

  medal(rang: number): 'gold'|'silver'|'bronze'|'none' {
    if (rang === 1) return 'gold';
    if (rang === 2) return 'silver';
    if (rang === 3) return 'bronze';
    return 'none';
  }
}
