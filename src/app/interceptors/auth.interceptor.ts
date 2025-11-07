// src/app/interceptors/auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService, private router: Router) {}

  private needsAuth(url: string): boolean {
    // absolue ?
    if (/^https?:\/\//i.test(url)) {
      try {
        const u = new URL(url);
        return u.pathname.startsWith('/api') && !u.pathname.startsWith('/api/auth');
      } catch { return false; }
    }
    // relative
    return url.startsWith('/api') && !url.startsWith('/api/auth');
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.auth.getToken();
    const addAuth = token && this.needsAuth(req.url);

    const cloned = addAuth
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

    return next.handle(cloned).pipe(
      catchError((err: any) => {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          this.auth.logout();
          this.router.navigate(['/home']);
        }
        return throwError(() => err);
      })
    );
  }
}
