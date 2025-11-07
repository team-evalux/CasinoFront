// src/app/account/delete-account.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import {environment} from '../../environments/environment';

@Component({
  selector: 'app-delete-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './delete-account.component.html',
  styleUrls: ['./delete-account.component.css']
})
export class DeleteAccountComponent {
  emailAffiche: string | null = null;  // email courant affiché
  saisieEmail = '';
  enCours = false;
  messageErr: string | null = null;
  messageOk: string | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router
  ){
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const obj = JSON.parse(user);
        this.emailAffiche = obj?.email ?? null;
      } catch {}
    }
  }
  private base = `${environment.apiBaseUrl}`;


  get confirmationValide(): boolean {
    return !!this.emailAffiche && this.saisieEmail.trim().toLowerCase() === this.emailAffiche.toLowerCase();
  }

  /**
   * Orchestration côté front:
   * - On affiche "déconnexion en cours" (visuellement), mais on GARDE le token
   * - On appelle 1 seul endpoint back /api/account/me (ordre serveur garanti)
   * - Après 204, on fait la vraie déconnexion locale (suppression token) et redirection
   */
  supprimerCompte() {
    if (!this.confirmationValide) {
      this.messageErr = "L'email saisi ne correspond pas à votre compte.";
      return;
    }

    this.enCours = true;
    this.enCours = true;

    // IMPORTANT: on garde le token ici (pas de logout avant)
    this.http.request('DELETE', `${this.base}/account/me`,{
      body: { emailConfirm: this.saisieEmail.trim() }
    }).subscribe({
      next: () => {
        // succès : maintenant on se déconnecte
        this.auth.logout();
        this.router.navigate(['/home']);
      },
      error: (err) => {
        this.enCours = false;
        this.messageErr = err?.error?.error || err?.error?.message || 'Suppression impossible.';
      }
    });
  }
}
