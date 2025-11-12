import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';
import { AuthService } from '../app/services/auth.service';
import { environment } from '../environments/environment';

interface ChatMessage {
  id: number;
  pseudo: string;
  contenu: string;
  date: string;
}

interface UserInfo {
  pseudo: string;
  solde: number;
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

  base = `${environment.apiBaseUrl}/chat`;
  ouvert = false;
  messages: ChatMessage[] = [];
  nouveauMessage = '';
  chargement = false;
  isAdmin = false;
  isLogged = false;
  currentPseudo = '';
  currentSolde = 0;

  private pollSub?: Subscription;
  private loginSub?: Subscription;

  // --- Popup de tip ---
  popupVisible = false;
  targetPseudo = '';
  tipMontant = 0;
  tipMsg = '';

  @ViewChild('scrollZone') scrollZone!: ElementRef<HTMLDivElement>;

  ngOnInit() {
    // 🔁 Surveille la connexion / déconnexion
    this.loginSub = this.auth.loggedIn$.subscribe(isLogged => {
      this.isLogged = isLogged;
      if (isLogged) {
        this.isAdmin = this.auth.hasRole && this.auth.hasRole('ADMIN');
        this.chargerInfosUtilisateur(); // récupère pseudo + solde du connecté
      } else {
        this.isAdmin = false;
        this.ouvert = false;
        this.currentPseudo = '';
        this.currentSolde = 0;
      }
    });

    // 🔁 Chargement initial du chat
    this.refresh();
    this.pollSub = interval(5000).subscribe(() => this.refresh());
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
    this.loginSub?.unsubscribe();
  }

  toggle() {
    this.ouvert = !this.ouvert;
    document.body.classList.toggle('chat-ouvert', this.ouvert);
    if (this.ouvert) setTimeout(() => this.scrollBas(), 80);
  }

  refresh() {
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
      },
      error: () => (this.chargement = false)
    });
  }

  supprimerMessage(id: number) {
    if (!this.isAdmin) return;
    if (!confirm('Supprimer ce message ?')) return;
    this.http.delete(`${this.base}/${id}`).subscribe(() => this.refresh());
  }

  viderChat() {
    if (!this.isAdmin) return;
    if (confirm('Vider complètement le chat ?')) {
      this.http.delete(`${this.base}/clear`).subscribe(() => this.refresh());
    }
  }

  private scrollBas() {
    if (!this.scrollZone) return;
    setTimeout(() => {
      const el = this.scrollZone.nativeElement;
      el.scrollTop = el.scrollHeight;
    }, 30);
  }

  /** 🔹 Récupère le pseudo + solde du joueur connecté */
  private chargerInfosUtilisateur() {
    this.http.get<UserInfo>(`${environment.apiBaseUrl}/user/me`).subscribe({
      next: (res) => {
        this.currentPseudo = res.pseudo;
        this.currentSolde = res.solde ?? 0;
      },
      error: () => {
        this.currentPseudo = '';
        this.currentSolde = 0;
      }
    });
  }

  // --- Gestion du Tip ---
  openTipPopup(pseudo: string) {
    if (!this.isLogged) return;

    // 🚫 Empêche de se tip soi-même
    if (pseudo.trim().toLowerCase() === this.currentPseudo.trim().toLowerCase()) return;

    this.targetPseudo = pseudo;
    this.tipMontant = 0;
    this.tipMsg = '';
    this.popupVisible = true;
  }

  closeTipPopup() {
    this.popupVisible = false;
  }

  envoyerTip() {
    if (!this.tipMontant || this.tipMontant <= 0) {
      this.tipMsg = "Montant invalide.";
      return;
    }

    this.tipMsg = "Envoi...";
    this.http.post(`${environment.apiBaseUrl}/tip`, {
      pseudo: this.targetPseudo,
      montant: this.tipMontant
    }).subscribe({
      next: (res: any) => {
        this.tipMsg = res.success || "Tip envoyé !";
        // 🔁 Mets à jour le solde instantanément après un tip
        this.chargerInfosUtilisateur();
        setTimeout(() => this.closeTipPopup(), 1000);
      },
      error: (err) => {
        this.tipMsg = err.error?.error || "Erreur d’envoi.";
      }
    });
  }
}
