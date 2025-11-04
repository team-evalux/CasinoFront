import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BoutiqueService, UserItem } from '../services/boutique.service';

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './collection.component.html',
  styleUrls: ['./collection.component.css']
})
export class CollectionComponent implements OnInit {
  collection: UserItem[] = [];
  message: string | null = null;
  userId = 1; // ⚠️ Remplacer par l’utilisateur connecté

  constructor(private boutique: BoutiqueService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.boutique.getUserCollection(this.userId).subscribe(res => this.collection = res);
  }

  setAvatar(ui: UserItem): void {
    this.boutique.setAvatar(this.userId, ui.id).subscribe({
      next: () => {
        this.message = `✅ ${ui.item.nom} défini comme avatar.`;
        this.refresh();
      },
      error: () => this.message = 'Erreur lors du changement d’avatar.'
    });
  }
}
