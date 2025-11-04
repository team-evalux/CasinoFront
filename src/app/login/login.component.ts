import {Component, inject, OnInit} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import {UiService} from '../services/ui.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  errorMessage = '';
  private ui = inject(UiService);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(120)
      ]],
      motDePasse: ['', [
        Validators.required,
        Validators.maxLength(128)
      ]]
    });
  }

  ngOnInit() {
    // si déjà connecté, va directement sur /home
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }
  }

  onSubmit() {
    if (this.loginForm.valid) {
      // trim pour éviter espaces en fin/début
      const email = String(this.loginForm.value.email || '').trim();
      const motDePasse = String(this.loginForm.value.motDePasse || '').trim();

      this.authService.login(email, motDePasse).subscribe({
        next: () => {
          this.ui.closeMenu(); // ✅ ferme le panneau immédiatement
          // this.router.navigate(['/home']); // optionnel
        },
        error: () => {
          this.errorMessage = 'Identifiants invalides ❌';
        }
      });
    }
  }

  protected readonly alert = alert;
}
