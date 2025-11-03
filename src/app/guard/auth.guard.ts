  import { Injectable } from '@angular/core';
  import { CanActivate, Router } from '@angular/router';
  import { AuthService } from '../services/auth.service';

  @Injectable({
    providedIn: 'root'
  })
  export class AuthGuard implements CanActivate {

    constructor(private authService: AuthService, private router: Router) {}

    // src/app/guard/auth.guard.ts (extrait)
    canActivate(): boolean {
      if (this.authService.isLoggedIn()) {
        return true;
      } else {
        // redirige vers /home (où le header propose le login)
        this.router.navigate(['/home']);
        return false;
      }
    }

  }
