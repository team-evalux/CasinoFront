import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BoutiqueService, Item } from '../services/boutique.service';
import { WalletService } from '../services/wallet.service';

@Component({
  selector: 'app-boutique',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './boutique.component.html',
  styleUrls: ['./boutique.component.css']
})
export class BoutiqueComponent implements OnInit {
  items: Item[] = [];
  solde: number = 0;
  message: string | null = null;
  userId = 1; // ⚠️ À remplacer par ID utilisateur connecté

  constructor(private boutique: BoutiqueService, private wallet: WalletService) {}

  ngOnInit(): void {
    this.boutique.getAllItems().subscribe(items => this.items = items);
    this.wallet.balance$.subscribe(b => this.solde = b ?? 0);
  }

  acheter(item: Item): void {
    if (this.solde < item.prix) {
      this.message = '💸 Solde insuffisant !';
      return;
    }
    this.boutique.acheterItem(this.userId, item.id).subscribe({
      next: msg => {
        this.message = msg;
        this.wallet.refreshBalance();
      },
      error: err => this.message = err.error || 'Erreur lors de l’achat'
    });
  }

  getImageSrc(path: string): string {
    // si le chemin commence déjà par "assets/", on le préfixe avec /
    if (path.startsWith('assets/')) {
      return '/' + path;
    }
    // sinon on renvoie tel quel
    return path;
  }

  couleurRarete(r: string): string {
    return {
      COMMUN: '#9ca3af',
      RARE: '#3b82f6',
      EPIQUE: '#8b5cf6',
      LEGENDAIRE: '#f59e0b'
    }[r] || '#ccc';
  }
}
