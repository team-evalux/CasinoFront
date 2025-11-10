import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';


import { AuthService } from '../services/auth.service';
import { WalletService } from '../services/wallet.service';
import { Observable } from 'rxjs';
import {AvatarService} from '../services/boutique/avatar.service';
import {AvatarDto, InventoryAvatarDto} from '../services/boutique/avatar.models';

@Component({
  selector: 'app-avatar-shop',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './avatar-shop.component.html',
  styleUrls: ['./avatar-shop.component.css']
})
export class AvatarShopComponent implements OnInit {

  private avatarService = inject(AvatarService);
  private authService = inject(AuthService);
  private walletService = inject(WalletService);

  avatars: AvatarDto[] = [];
  inventory: InventoryAvatarDto[] = [];

  balance$!: Observable<number | null>;

  loading = false;
  error: string | null = null;
  buyingId: number | null = null;
  infoMsg: string | null = null;

  ngOnInit(): void {
    this.balance$ = this.walletService.balance$;
    this.loadData();

    // Si tu veux reload l'inventaire après login:
    this.authService.loggedIn$.subscribe(() => this.loadInventoryIfLogged());
  }

  private loadData() {
    this.loading = true;
    this.error = null;
    this.avatarService.getShop().subscribe({
      next: avatars => {
        this.avatars = avatars;
        this.loading = false;
        this.loadInventoryIfLogged();
      },
      error: () => {
        this.error = 'Impossible de charger la boutique.';
        this.loading = false;
      }
    });
  }

  private loadInventoryIfLogged() {
    if (!this.isLoggedIn()) {
      this.inventory = [];
      return;
    }
    this.avatarService.getInventory().subscribe({
      next: inv => { this.inventory = inv; },
      error: () => { this.inventory = []; }
    });
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  hasAvatar(avatar: AvatarDto): boolean {
    return this.inventory.some(i => i.avatarId === avatar.id);
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

  rarityClass(r: string): string {
    return `rarity-${r.toLowerCase()}`;
  }

  canBuy(avatar: AvatarDto, solde: number | null): boolean {
    if (!this.isLoggedIn()) return false;
    if (this.hasAvatar(avatar)) return false;
    if (solde == null) return true; // on laisse tenter, le back tranchera
    return solde >= avatar.prix;
  }

  buy(avatar: AvatarDto, solde: number | null) {
    if (!this.isLoggedIn()) {
      this.info('Connecte-toi pour acheter cet avatar.');
      return;
    }
    if (this.hasAvatar(avatar)) {
      this.info('Tu possèdes déjà cet avatar.');
      return;
    }

    if (solde != null && solde < avatar.prix) {
      this.info('Solde insuffisant.');
      return;
    }

    this.buyingId = avatar.id;
    this.error = null;

    this.avatarService.buyAvatar(avatar.id).subscribe({
      next: invItem => {
        this.inventory.push(invItem);
        this.info(`Avatar "${avatar.nom}" acheté avec succès.`);
        this.buyingId = null;

        // Le SSE mettra à jour le solde, mais on peut forcer
        this.walletService.refreshBalance().subscribe();
      },
      error: err => {
        this.buyingId = null;
        this.error = err?.error?.error || 'Erreur lors de l\'achat.';
      }
    });
  }

  private info(msg: string) {
    this.infoMsg = msg;
    setTimeout(() => this.infoMsg = null, 2500);
  }
}
