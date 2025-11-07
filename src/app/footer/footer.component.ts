// src/app/footer/footer.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent {
  constructor(private auth: AuthService) {}

  isLoggedIn(){ return this.auth.isLoggedIn(); }

  scrollToTop(){ window.scrollTo({ top: 0, behavior: 'smooth' }); }
}
