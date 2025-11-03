// src/app/interceptors/auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  // Racine de l'API (ex: https://evaluxcasino.fr/api)
  private apiRoot = environment.apiBaseUrl;

  constructor(private auth: AuthService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.auth.getToken();
    let cloned = req;

    // Ajoute Authorization sur TOUT ce qui commence par /api,
    // sauf le namespace /api/auth (login/register/forgot…)
    if (
      token &&
      req.url.startsWith(this.apiRoot) &&
      !req.url.startsWith(`${this.apiRoot}/auth`)
    ) {
      cloned = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    return next.handle(cloned).pipe(
      catchError((err: any) => {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          this.auth.logout();
          this.router.navigate(['/home']); // ou une page de login si tu en as une
        }
        return throwError(() => err);
      })
    );
  }
}
