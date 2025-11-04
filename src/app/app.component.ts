import { Component, inject } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

import { UiService } from './services/ui.service';
import { HeaderComponent } from './header/header.component';
import { FooterComponent } from './footer/footer.component';
import { LoginComponent } from './login/login.component';
import { BalanceHeaderComponent } from './header/balance-header.component'; // ✅

import { AuthService } from './services/auth.service'; // ✅

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    RouterLink,
    HeaderComponent,
    FooterComponent,
    LoginComponent,
    BalanceHeaderComponent, // ✅
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  ui = inject(UiService);
  private router = inject(Router);
  private auth = inject(AuthService); // ✅

  constructor() {
    // Ferme le drawer à chaque navigation (après login/register, etc.)
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) this.ui.closeMenu();
    });
  }

  user(): { email?: string; pseudo?: string } | null {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  }

  isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }

  logout() {
    this.auth.logout();
    this.ui.closeMenu();
    this.router.navigate(['/home']);
  }

  protected readonly localStorage = localStorage;
}
