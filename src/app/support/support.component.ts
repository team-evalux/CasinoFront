// src/app/support/support.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.css']
})
export class SupportComponent {

  email = '';
  sujet = '';
  message = '';
  successMsg: string | null = null;
  errorMsg: string | null = null;
  sending = false;

  constructor(private http: HttpClient) {}

  envoyer() {
    this.successMsg = this.errorMsg = null;

    if (!this.email || !this.message) {
      this.errorMsg = 'Veuillez remplir tous les champs requis.';
      return;
    }

    this.sending = true;
    this.http.post(`${environment.apiBaseUrl}/support`, {
      email: this.email,
      sujet: this.sujet,
      message: this.message
    }).subscribe({
      next: (res: any) => {
        this.successMsg = res.message || 'Message envoyé avec succès.';
        this.sending = false;
        this.email = this.sujet = this.message = '';
      },
      error: (err) => {
        this.errorMsg = err?.error?.error || 'Erreur lors de l’envoi.';
        this.sending = false;
      }
    });
  }
}
