import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div style="max-width:460px;margin:30px auto;border:1px solid #eee;padding:16px;border-radius:8px;">
      <h2>Vérifier l'email</h2>
      <p>Un code à 4 chiffres a été envoyé à <strong>{{ email }}</strong>.</p>

      <form [formGroup]="form" (ngSubmit)="valider()">
        <label>Code</label>
        <input type="text" maxlength="4" formControlName="code"
               style="width:120px;padding:8px;border:1px solid #ccc;border-radius:6px;margin:6px 0;">
        <div *ngIf="form.get('code')?.touched && form.get('code')?.invalid" style="color:#b00020">
          Code requis (4 chiffres)
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-top:10px;">
          <button type="submit" [disabled]="form.invalid || loading"
                  style="padding:8px 12px;border:none;border-radius:6px;background:#1976d2;color:#fff;cursor:pointer;">
            {{ loading ? 'Vérification...' : 'Valider et créer le compte' }}
          </button>
          <button type="button" (click)="renvoyer()" [disabled]="loading"
                  style="padding:8px 12px;border:1px solid #999;border-radius:6px;background:#fff;cursor:pointer;">
            Renvoyer le code
          </button>
        </div>

        <p *ngIf="error" style="color:#b00020;margin-top:8px;">{{ error }}</p>
        <p *ngIf="message" style="color:#059669;margin-top:8px;">{{ message }}</p>
      </form>
    </div>
  `
})
export class VerifyEmailComponent {

  email = '';
  pseudo = '';
  loading = false;
  error: string | null = null;
  message: string | null = null;
  private PENDING_KEY = 'register.pending';

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService
  ) {
    this.email = this.route.snapshot.queryParamMap.get('email') || '';

    // ✅ Initialisation du form ici (après injection)
    this.form = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{4}$/)]]
    });
  }

  private readPending() {
    try { return JSON.parse(sessionStorage.getItem(this.PENDING_KEY) || 'null'); }
    catch { return null; }
  }

  valider() {
    if (this.form.invalid) return;
    const pending = this.readPending();
    if (!pending || !pending.email || !pending.pseudo || !pending.motDePasse || pending.email !== this.email) {
      this.error = 'Données d’inscription manquantes. Reprends depuis “Créer un compte”.';
      return;
    }

    this.loading = true; this.error = null; this.message = null;
    this.auth.inscriptionComplete({
      email: pending.email,
      pseudo: pending.pseudo,
      motDePasse: pending.motDePasse,
      code: this.form.value.code!
    }).subscribe({
      next: () => {
        this.loading = false;
        sessionStorage.removeItem(this.PENDING_KEY);
        this.router.navigate(['/home']);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error || 'Code invalide ou expiré.';
      }
    });
  }

  renvoyer() {
    if (!this.email) return;

    // 🔍 On relit aussi le pseudo stocké au moment de l'inscription
    const pending = this.readPending();
    const pseudo = pending?.pseudo || this.pseudo;

    this.loading = true;
    this.error = null;
    this.message = null;

    // ✅ Envoi sous forme d’objet { email, pseudo }
    this.auth.inscriptionSendCode({ email: this.email, pseudo }).subscribe({
      next: () => {
        this.loading = false;
        this.message = 'Code renvoyé.';
      },
      error: (err) => {
        this.loading = false;
        if (err?.error?.error) {
          this.error = err.error.error;
        } else if (typeof err?.error === 'string') {
          this.error = err.error;
        } else {
          this.error = 'Erreur lors de l’envoi.';
        }
      }
    });
  }

}
