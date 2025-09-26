// src/app/services/friends.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface Friend {
  id: number;
  friendEmail: string;
  online: boolean;
  lastSeen: string;
}

export interface FriendRequest {
  id: number;
  fromEmail: string;
  toEmail: string;
  status: 'PENDING' | 'ACCEPTED' | 'REFUSED';
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class FriendsService {
  private baseUrl = 'http://localhost:8080/api/friends';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private authHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  listFriends(): Observable<Friend[]> {
    return this.http.get<Friend[]>(`${this.baseUrl}`, { headers: this.authHeaders() });
  }

  addFriend(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/add`, { email }, { headers: this.authHeaders() });
  }

  sendCredits(to: string, amount: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/send-credits`, { to, amount }, { headers: this.authHeaders() });
  }

  listRequests(): Observable<FriendRequest[]> {
    return this.http.get<FriendRequest[]>(`${this.baseUrl}/requests`, { headers: this.authHeaders() });
  }

  acceptRequest(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/accept/${id}`, {}, { headers: this.authHeaders() });
  }

  refuseRequest(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/refuse/${id}`, {}, { headers: this.authHeaders() });
  }

  setOnline(status: boolean): Observable<any> {
    return this.http.post(`${this.baseUrl}/status`, { online: status }, { headers: this.authHeaders() });
  }
}
