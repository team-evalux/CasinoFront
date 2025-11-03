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

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.auth.getToken();
    const url = req.url || '';

    // Couvre /api/ en absolu ET relatif, et exclut uniquement /api/auth/**
    const isApiCall =
      url.includes('/api/'); // suffit pour https://evaluxcasino.fr/api/... ET /api/...

    const isAuthEndpoint = url.includes('/api/auth/');

    let cloned = req;

    if (token && isApiCall && !isAuthEndpoint) {
      cloned = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
          // en bonus: un header pour vérifier visuellement dans Network que l'interceptor a tourné
          'X-Debug-Auth-Interceptor': 'on'
        }
      });
    } else {
      // Ajoute quand même un header de debug "off" pour confirmer que l’interceptor est ACTIF
      cloned = req.clone({
        setHeaders: { 'X-Debug-Auth-Interceptor': 'off' }
      });
    }

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
