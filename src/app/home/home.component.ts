import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import {HistoryWidgetComponent} from '../history/history-widget.component';
import { FriendsComponent } from '../friends/friends.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, HistoryWidgetComponent,FriendsComponent],
  templateUrl: './home.component.html'
})
export class HomeComponent {
  pseudo: string | null = null;
  userObj: { email?: string; pseudo?: string } | null = null;
  tokenPresent = false;

  constructor(private authService: AuthService, private router: Router) {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        this.userObj = JSON.parse(user);
        this.pseudo = this.userObj?.pseudo ?? null;
      } catch {
        this.userObj = null;
      }
    }
    this.tokenPresent = !!localStorage.getItem('jwt');
  }

  logout() {
    this.authService.logout();
    // navigation via Router
    this.router.navigate(['/login']);
  }
}
