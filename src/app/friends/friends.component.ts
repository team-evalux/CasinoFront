import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FriendsService, Friend, FriendRequest } from '../services/friends.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.css']
})
export class FriendsComponent implements OnInit {
  friends: Friend[] = [];
  requests: FriendRequest[] = [];
  showSidebar = false;
  showRequests = false;
  newFriendEmail = '';
  error: string | null = null;

  constructor(
    private friendsService: FriendsService,
    private auth: AuthService
  ) {}

  ngOnInit() {
    if (this.isLoggedIn) {
      this.loadFriends();
    }
  }

  get isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }

  toggleSidebar() {
    this.showSidebar = !this.showSidebar;
    if (this.showSidebar) this.loadFriends();
  }

  loadFriends() {
    this.friendsService.listFriends().subscribe({
      next: (res) => this.friends = res,
      error: () => this.error = "Impossible de charger la liste d'amis"
    });
  }

  addFriend() {
    if (!this.newFriendEmail) return;
    this.friendsService.addFriend(this.newFriendEmail).subscribe({
      next: () => {
        this.newFriendEmail = '';
        this.loadFriends();
      },
      error: (e) => alert("Erreur ajout ami: " + (e.error?.error || e.message))
    });
  }

  sendCredits(to: string) {
    const amount = Number(prompt("Montant à envoyer (max 1000):"));
    if (!amount) return;
    this.friendsService.sendCredits(to, amount).subscribe({
      next: () => alert("Crédits envoyés !"),
      error: (e) => alert("Erreur: " + (e.error?.error || e.message))
    });
  }

  toggleRequests() {
    this.showRequests = !this.showRequests;
    if (this.showRequests) {
      this.friendsService.listRequests().subscribe({
        next: (res) => this.requests = res,
        error: () => this.error = "Impossible de charger les demandes"
      });
    }
  }

  accept(id: number) {
    this.friendsService.acceptRequest(id).subscribe({
      next: () => {
        this.requests = this.requests.filter(r => r.id !== id);
        this.loadFriends();
      }
    });
  }

  refuse(id: number) {
    this.friendsService.refuseRequest(id).subscribe({
      next: () => this.requests = this.requests.filter(r => r.id !== id)
    });
  }
}
