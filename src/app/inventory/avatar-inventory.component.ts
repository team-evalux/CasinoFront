import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {AvatarService} from '../services/boutique/avatar.service';
import {InventoryAvatarDto} from '../services/boutique/avatar.models';
import {RouterLink} from '@angular/router';


@Component({
  selector: 'app-avatar-inventory',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './avatar-inventory.component.html',
  styleUrls: ['./avatar-inventory.component.css']
})
export class AvatarInventoryComponent implements OnInit {

  private avatarService = inject(AvatarService);

  avatars: InventoryAvatarDto[] = [];
  loading = false;
  error: string | null = null;
  infoMsg: string | null = null;
  equippingId: number | null = null;

  ngOnInit(): void {
    this.loadInventory();
  }

  private loadInventory() {
    this.loading = true;
    this.error = null;

    this.avatarService.getInventory().subscribe({
      next: list => {
        this.avatars = list.sort((a,b) => {
          if (a.equipe && !b.equipe) return -1;
          if (!a.equipe && b.equipe) return 1;
          return (a.avatarId || 0) - (b.avatarId || 0);
        });
        this.loading = false;
      },
      error: () => {
        this.error = 'Impossible de charger ton inventaire.';
        this.loading = false;
      }
    });
  }

  rarityLabel(r: string): string {
    switch (r) {
      case 'COMMUN': return 'Commun';
      case 'RARE': return 'Rare';
      case 'EPIQUE': return 'Épique';
      case 'LEGENDAIRE': return 'Légendaire';
      default: return r;
    }
  }

  isEquipped(av: InventoryAvatarDto): boolean {
    return !!av.equipe;
  }

  equip(av: InventoryAvatarDto) {
    if (this.isEquipped(av)) return;

    this.equippingId = av.avatarId;
    this.error = null;

    this.avatarService.equipAvatar(av.avatarId).subscribe({
      next: updated => {
        // maj locale
        this.avatars = this.avatars.map(x => ({
          ...x,
          equipe: x.avatarId === updated.avatarId
        }));
        this.info(`Avatar "${updated.nom}" équipé.`);
        this.equippingId = null;
      },
      error: err => {
        this.error = err?.error?.error || 'Erreur lors de l\'équipement.';
        this.equippingId = null;
      }
    });
  }

  private info(msg: string) {
    this.infoMsg = msg;
    setTimeout(() => this.infoMsg = null, 2500);
  }
}
