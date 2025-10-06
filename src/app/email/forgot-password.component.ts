import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { AuthService } from '../services/auth.service';

type Step = 'EMAIL' | 'CODE' | 'DONE';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div style="max-width:460px;margin:30px auto;border:1px solid #eee;padding:16px;border-radius:8px;">
      <h2>Mot de passe oublié</h2>

      <ng-container [ngSwitch]="step">
        <form *ngSwitchCase="'EMAIL'" [formGroup]="emailForm" (ngSubmit)="envoyer()">
          <label>Email</label>
          <input type="email" formControlName="email" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;margin:6px 0;">
          <div *ngIf="emailForm.get('email')?.touched && emailForm.get('email')?.invalid" style="color:#b00020">Email invalide</div>
          <button [disabled]="emailForm.invalid || loading" type="submit"
                  style="padding:8px 12px;border:none;border-radius:6px;background:#1976d2;color:#fff;cursor:pointer;">
            {{ loading ? 'Envoi...' : 'Envoyer le code' }}
          </button>
          <p *ngIf="error" style="color:#b00020;margin-top:8px;">{{ error }}</p>
          <p *ngIf="message" style="color:#059669;margin-top:8px;">{{ message }}</p>
        </form>

        <form *ngSwitchCase="'CODE'" [formGroup]="codeForm" (ngSubmit)="reset()">
          <p>Un code à 4 chiffres a été envoyé à <strong>{{ emailForm.value.email }}</strong>.</p>
          <label>Code</label>
          <input type="text" maxlength="4" formControlName="code" style="width:120px;padding:8px;border:1px solid #ccc;border-radius:6px;margin:6px 0;">
          <div *ngIf="codeForm.get('code')?.touched && codeForm.get('code')?.invalid" style="color:#b00020">Code requis</div>

          <label>Nouveau mot de passe</label>
          <input type="password" formControlName="nouveauMotDePasse" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;margin:6px 0;">
          <div *ngIf="codeForm.get('nouveauMotDePasse')?.touched && codeForm.get('nouveauMotDePasse')?.invalid" style="color:#b00020">Min 6 caractères</div>

          <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
            <button [disabled]="codeForm.invalid || loading" type="submit"
                    style="padding:8px 12px;border:none;border-radius:6px;background:#10b981;color:#fff;cursor:pointer;">
              {{ loading ? 'Réinitialisation...' : 'Réinitialiser' }}
            </button>
            <button type="button" (click)="renvoyer()" [disabled]="loading"
                    style="padding:8px 12px;border:1px solid #999;border-radius:6px;background:#fff;cursor:pointer;">
              Renvoyer le code
            </button>
          </div>

          <p *ngIf="error" style="color:#b00020;margin-top:8px;">{{ error }}</p>
          <p *ngIf="message" style="color:#059669;margin-top:8px;">{{ message }}</p>
        </form>

        <div *ngSwitchCase="'DONE'">
          <p>✅ Mot de passe réinitialisé. Tu peux te connecter.</p>
        </div>
      </ng-container>
    </div>
  `
})
export class ForgotPasswordComponent {
  step: Step = 'EMAIL';
  loading = false;
  error: string | null = null;
  message: string | null = null;

  emailForm: FormGroup;
  codeForm: FormGroup;

  constructor(private fb: FormBuilder, private auth: AuthService) {
    // ✅ Initialisation ici (après injection)
    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    this.codeForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{4}$/)]],
      nouveauMotDePasse: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  envoyer() {
    if (this.emailForm.invalid) return;
    this.loading = true; this.error = null; this.message = null;
    this.auth.forgotSendCode(this.emailForm.value.email!).subscribe({
      next: () => { this.loading = false; this.step = 'CODE'; this.message = 'Code envoyé.'; },
      error: (err) => { this.loading = false; this.error = err?.error || 'Erreur lors de l’envoi du code.'; }
    });
  }

  renvoyer() {
    if (this.emailForm.invalid) return;
    this.envoyer();
  }

  reset() {
    if (this.codeForm.invalid || this.emailForm.invalid) return;
    this.loading = true; this.error = null; this.message = null;
    this.auth.forgotReset(
      this.emailForm.value.email!,
      this.codeForm.value.code!,
      this.codeForm.value.nouveauMotDePasse!
    ).subscribe({
      next: () => { this.loading = false; this.step = 'DONE'; this.message = 'Mot de passe réinitialisé.'; },
      error: (err) => { this.loading = false; this.error = err?.error || 'Code invalide ou expiré.'; }
    });
  }
}
