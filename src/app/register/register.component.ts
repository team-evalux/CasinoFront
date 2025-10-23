import { Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit {
  formulaire: FormGroup;
  enCours = false;
  messageSucces: string | null = null;
  messageErreur: string | null = null;

  showPassword = false; // 👈 toggle d’affichage

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

  get f() { return this.formulaire.controls; }

  envoyer() {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }

    this.enCours = true;
    this.messageErreur = null;
    this.messageSucces = null;

    const email = this.f['email'].value as string;
    const pseudo = this.f['pseudo'].value as string;
    const motDePasse = this.f['motDePasse'].value as string;

    this.authService.inscriptionSendCode({ email, pseudo }).subscribe({
      next: (res) => {
        sessionStorage.setItem(this.PENDING_KEY, JSON.stringify({ email, pseudo, motDePasse }));
        this.enCours = false;
        this.zone.run(() => {
          this.router.navigate(['/verify-email'], { queryParams: { email } });
        });
      },
      error: (err) => {
        this.enCours = false;
        if (err?.error?.error) this.messageErreur = err.error.error;
        else if (typeof err?.error === 'string') this.messageErreur = err.error;
        else this.messageErreur = 'Erreur réseau ou serveur';
      }
    });
  }
}
