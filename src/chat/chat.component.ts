import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';

import { AuthService } from '../app/services/auth.service';
import { WalletService } from '../app/services/wallet.service';
import { environment } from '../environments/environment';

interface ChatMessage {
  id: number;
  pseudo: string;
  contenu: string;
  date: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy {

  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private wallet = inject(WalletService);

  base = `${environment.apiBaseUrl}/chat`;

  messages: ChatMessage[] = [];
  nouveauMessage = '';
  ouvert = false;
  chargement = false;
  isLogged = false;
  isAdmin = false;

  // Pseudo utilisateur récupéré comme dans HomeComponent
  currentPseudo = '';
  currentSolde: number | null = null;

  maxReceivable = 0;
  tipMontant = 0;
  tipMsg = '';
  popupVisible = false;
  targetPseudo = '';

  private pollSub?: Subscription;
  private loginSub?: Subscription;
  private soldeSub?: Subscription;

  @ViewChild('scrollZone') scrollZone!: ElementRef<HTMLDivElement>;

  constructor() {

    // ⭐ Récupération du pseudo identique à HomeComponent
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        const obj = JSON.parse(stored);
        this.currentPseudo = obj?.pseudo?.trim() ?? '';
      } catch {}
    }
  }

  ngOnInit() {

    this.soldeSub = this.wallet.balance$.subscribe(solde => {
      if (solde !== null) this.currentSolde = solde;
    });

    this.loginSub = this.auth.loggedIn$.subscribe(isLogged => {
      this.isLogged = isLogged;

      if (isLogged) {
        this.isAdmin = this.auth.hasRole('ADMIN');
        this.wallet.refreshBalance().subscribe();
      } else {
        this.isAdmin = false;
        this.currentSolde = null;
      }
    });

    this.refresh();
    this.pollSub = interval(5000).subscribe(() => {
      if (this.isLogged) {
        this.refresh();
      }
    });
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
    this.loginSub?.unsubscribe();
    this.soldeSub?.unsubscribe();
  }


  onTipInput(e: any) {
    const raw = e.target.value;

    // Ne garder que les chiffres
    let cleaned = raw.replace(/\D+/g, "");

    if (cleaned === "") {
      this.tipMontant = 0;
      return;
    }

    // Convertir en entier
    let value = parseInt(cleaned, 10);

    // Minimum = 1
    if (value < 1) value = 1;

    // Maximum = maxReceivable
    if (value > this.maxReceivable) value = this.maxReceivable;

    this.tipMontant = value;

    // Mise à jour dans le champ
    e.target.value = value;
  }




  toggle() {
    this.ouvert = !this.ouvert;
    if (this.ouvert) setTimeout(() => this.scrollBas(), 80);
  }

  refresh() {
    if (!this.isLogged) {
      this.messages = []; // optionnel : vider l'affichage
      return;
    }

    this.http.get<ChatMessage[]>(this.base).subscribe(r => {
      this.messages = r;
      this.scrollBas();
    });
  }

  envoyer() {
    if (!this.isLogged || !this.nouveauMessage.trim()) return;

    const contenu = this.nouveauMessage.trim().slice(0, 150);

    this.chargement = true;
    this.http.post(this.base, { contenu }).subscribe({
      next: () => {
        this.nouveauMessage = '';
        this.chargement = false;
        this.refresh();
      }
    });
  }

  supprimerMessage(id: number) {
    if (!this.isAdmin) return;
    if (!confirm("Supprimer ce message ?")) return;

    this.http.delete(`${this.base}/${id}`).subscribe(() => this.refresh());
  }

  viderChat() {
    if (!this.isAdmin) return;
    if (!confirm("Vider le chat ?")) return;

    this.http.delete(`${this.base}/clear`).subscribe(() => this.refresh());
  }

  private scrollBas() {
    if (!this.scrollZone) return;
    setTimeout(() => {
      this.scrollZone.nativeElement.scrollTop =
        this.scrollZone.nativeElement.scrollHeight;
    }, 30);
  }

  // --- TIP ---
  openTipPopup(pseudo: string) {
    if (!this.isLogged) return;

    // ❌ Interdiction totale auto-tip
    if (pseudo.trim().toLowerCase() === this.currentPseudo.trim().toLowerCase())
      return;

    this.targetPseudo = pseudo;
    this.tipMontant = 0;
    this.tipMsg = '';

    this.http.get<any>(`${environment.apiBaseUrl}/tip/max-receivable?pseudo=${pseudo}`)
      .subscribe({
        next: res => {
          this.maxReceivable = res.maxReceivable;
          this.popupVisible = true;
        },
        error: () => {
          this.maxReceivable = 0;
          this.tipMsg = "Impossible de récupérer le maximum autorisé.";
        }
      });
  }

  closeTipPopup() {
    this.popupVisible = false;
  }

  envoyerTip() {
    if (!this.tipMontant || this.tipMontant <= 0) {
      this.tipMsg = "Montant invalide.";
      return;
    }

    if (this.tipMontant > this.maxReceivable) {
      this.tipMsg = `Ce joueur ne peut recevoir que ${this.maxReceivable} crédits aujourd’hui.`;
      return;
    }

    if (this.currentSolde !== null && this.tipMontant > this.currentSolde) {
      this.tipMsg = "Solde insuffisant.";
      return;
    }

    this.tipMsg = "Envoi...";

    this.http.post(`${environment.apiBaseUrl}/tip`, {
      pseudo: this.targetPseudo,
      montant: this.tipMontant
    }).subscribe({
      next: () => {

        // 🔥 1) Message succès
        this.tipMsg = "✔ Tip envoyé !";

        // 🔥 2) Rafraîchir le solde de l’utilisateur
        this.wallet.refreshBalance().subscribe();

        // 🔥 3) Rafraîchir le max receivable dans la popup
        this.http.get<any>(
          `${environment.apiBaseUrl}/tip/max-receivable?pseudo=${this.targetPseudo}`
        ).subscribe(r => {
          this.maxReceivable = r.maxReceivable;

          // Si le montant saisi dépasse le nouveau max -> ajuster
          if (this.tipMontant > this.maxReceivable) {
            this.tipMontant = this.maxReceivable;
          }
        });

      },
      error: err => {
        this.tipMsg = err.error?.error || "Erreur.";
      }
    });
  }

}
