import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import {AvatarDto, EquippedAvatarDto, InventoryAvatarDto} from './avatar.models';
import {environment} from '../../../environments/environment';

export interface AvatarAdminPayload {
  code: string;
  nom: string;
  rarete: 'COMMUN' | 'RARE' | 'EPIQUE' | 'LEGENDAIRE';
  prix: number;
  imageUrl?: string;
  actif: boolean;
  defaut: boolean;
}


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

  getEquipped() {
    return this.http.get<EquippedAvatarDto | null>(`${this.baseUrl}/inventory/avatars/equipped`)
      .pipe(tap(av => this.equippedSubject.next(av)));
  }


  // === Actions ===

  buyAvatar(avatarId: number): Observable<InventoryAvatarDto> {
    return this.http.post<InventoryAvatarDto>(
      `${this.baseUrl}/inventory/avatars/${avatarId}/buy`,
      {}
    ).pipe(
      tap(dto => {
        // Si le back décide que cet avatar devient équipé (ex: 1er avatar),
        // on met immédiatement à jour l'état global pour le header.
        if (dto && dto.equipe) {
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


  equipAvatar(avatarId: number): Observable<InventoryAvatarDto> {
    return this.http.post<InventoryAvatarDto>(
      `${this.baseUrl}/inventory/avatars/${avatarId}/equip`,
      {}
    ).pipe(
      tap(dto => {
        // 🔥 ICI : on met à jour le BehaviorSubject
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

  // ===== ADMIN =====

  getAdminAvatars() {
    return this.http.get<AvatarDto[]>(`${this.baseUrl}/admin/avatars`);
  }

  createAvatar(payload: AvatarAdminPayload) {
    return this.http.post<AvatarDto>(`${this.baseUrl}/admin/avatars`, payload);
  }

  updateAvatar(id: number, payload: AvatarAdminPayload) {
    return this.http.put<AvatarDto>(`${this.baseUrl}/admin/avatars/${id}`, payload);
  }

  disableAvatar(id: number) {
    return this.http.delete(`${this.baseUrl}/admin/avatars/${id}`);
  }

  setActive(id: number, actif: boolean) {
    return this.http.patch<AvatarDto>(`${this.baseUrl}/admin/avatars/${id}/active`, { actif });
  }

}
