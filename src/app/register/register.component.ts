import { Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html'
})
export class RegisterComponent implements OnInit {
  formulaire: FormGroup;
  enCours = false;
  messageSucces: string | null = null;
  messageErreur: string | null = null;

  private PENDING_KEY = 'register.pending';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private zone: NgZone
  ) {
    this.formulaire = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      pseudo: ['', [Validators.required, Validators.minLength(3)]],
      motDePasse: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }
  }

  envoyer() {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }

    this.enCours = true;
    this.messageErreur = null;
    this.messageSucces = null;

    const email = this.formulaire.get('email')!.value as string;
    const pseudo = this.formulaire.get('pseudo')!.value as string;
    const motDePasse = this.formulaire.get('motDePasse')!.value as string;

    // ✅ Envoie maintenant email + pseudo (conforme à ton backend)
    this.authService.inscriptionSendCode({ email, pseudo }).subscribe({
      next: (res) => {
        console.log('[register] code envoyé OK:', res);
        sessionStorage.setItem(this.PENDING_KEY, JSON.stringify({ email, pseudo, motDePasse }));
        this.enCours = false;

        this.zone.run(() => {
          this.router.navigate(['/verify-email'], { queryParams: { email } })
            .then(ok => console.log('[register] navigate /verify-email:', ok))
            .catch(err => console.error('[register] navigate error:', err));
        });
      },
      error: (err) => {
        console.error('[register] erreur envoi code:', err);
        this.enCours = false;

        // ✅ Gestion claire des messages d'erreur
        if (err?.error?.error) {
          this.messageErreur = err.error.error; // ex: "Pseudo déjà utilisé"
        } else if (typeof err?.error === 'string') {
          this.messageErreur = err.error; // si backend renvoie un texte brut
        } else {
          this.messageErreur = 'Erreur réseau ou serveur';
        }
      }
    });
  }
}
