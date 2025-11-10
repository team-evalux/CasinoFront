import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import {AvatarDto, EquippedAvatarDto, InventoryAvatarDto} from './avatar.models';
import {environment} from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AvatarService {

  private baseUrl = environment.apiBaseUrl; // ex: '/api' ou 'https://xxx/api'

  // Optionnel : état partagé pour l’avatar équipé (utile pour le header)
  private equippedSubject = new BehaviorSubject<EquippedAvatarDto | null>(null);
  equipped$ = this.equippedSubject.asObservable();

  constructor(private http: HttpClient) {}

  // === Boutique ===

  getShop(): Observable<AvatarDto[]> {
    return this.http.get<AvatarDto[]>(`${this.baseUrl}/avatars`);
  }

  // === Inventaire ===

  getInventory(): Observable<InventoryAvatarDto[]> {
    return this.http.get<InventoryAvatarDto[]>(`${this.baseUrl}/inventory/avatars`);
  }

  getEquipped(): Observable<EquippedAvatarDto | null> {
    return this.http
      .get<EquippedAvatarDto | null>(`${this.baseUrl}/inventory/avatars/equipped`)
      .pipe(tap(e => this.equippedSubject.next(e)));
  }

  // === Actions ===

  buyAvatar(avatarId: number): Observable<InventoryAvatarDto> {
    return this.http.post<InventoryAvatarDto>(
      `${this.baseUrl}/inventory/avatars/${avatarId}/buy`,
      {}
    );
  }

  equipAvatar(avatarId: number): Observable<InventoryAvatarDto> {
    return this.http.post<InventoryAvatarDto>(
      `${this.baseUrl}/inventory/avatars/${avatarId}/equip`,
      {}
    ).pipe(
      tap(dto => {
        // met à jour l'état local de l’avatar équipé
        if (dto) {
          this.equippedSubject.next({
            avatarId: dto.avatarId,
            code: dto.code,
            nom: dto.nom,
            rarete: dto.rarete,
            imageUrl: dto.imageUrl
          });
        }
      })
    );
  }

  // Pour vider l’état à la déconnexion
  clearEquipped() {
    this.equippedSubject.next(null);
  }
}
