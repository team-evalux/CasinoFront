import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Item {
  id: number;
  nom: string;
  imagePath: string;
  prix: number;
  rarete: 'COMMUN' | 'RARE' | 'EPIQUE' | 'LEGENDAIRE';
}

export interface UserItem {
  id: number;
  item: Item;
  actif: boolean;
}

@Injectable({ providedIn: 'root' })
export class BoutiqueService {
  private baseUrl = `${environment.apiBaseUrl}/boutique`;

  constructor(private http: HttpClient) {}

  getAllItems(): Observable<Item[]> {
    return this.http.get<Item[]>(`${this.baseUrl}/items`);
  }

  getUserCollection(userId: number): Observable<UserItem[]> {
    return this.http.get<UserItem[]>(`${this.baseUrl}/collection/${userId}`);
  }

  acheterItem(userId: number, itemId: number): Observable<string> {
    return this.http.post(`${this.baseUrl}/acheter?userId=${userId}&itemId=${itemId}`, {}, { responseType: 'text' });
  }

  setAvatar(userId: number, userItemId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/avatar?userId=${userId}&userItemId=${userItemId}`, {});
  }

  getAvatar(userId: number): Observable<UserItem> {
    return this.http.get<UserItem>(`${this.baseUrl}/avatar/${userId}`);
  }
}
