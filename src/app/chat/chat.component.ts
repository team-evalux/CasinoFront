import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { WalletService } from '../services/wallet.service';
import { environment } from '../../environments/environment';
import { Client, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

interface ChatMessage {
  id: number;
  pseudo: string;
  contenu: string;
  date: string;
}

type ChatEventType = 'MESSAGE' | 'DELETE' | 'CLEAR';

interface ChatEvent {
  type: ChatEventType;
  message?: ChatMessage;
  id?: number;
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

  private loginSub?: Subscription;
  private soldeSub?: Subscription;
  private stompClient?: Client;
  private chatSub?: StompSubscription;


  @ViewChild('scrollZone') scrollZone!: ElementRef<HTMLDivElement>;

  constructor() {
    this.syncCurrentPseudoFromAuth();
  }


  ngOnInit() {
    this.soldeSub = this.wallet.balance$.subscribe(solde => {
      if (solde !== null) this.currentSolde = solde;
    });

    this.loginSub = this.auth.loggedIn$.subscribe(isLogged => {
      this.isLogged = isLogged;

      if (isLogged) {
        // 🔥 on resynchronise le pseudo dès qu’on est loggé
        this.syncCurrentPseudoFromAuth();

        this.isAdmin = this.auth.hasRole('ADMIN');
        this.wallet.refreshBalance().subscribe();

        // 🔥 connexion WS + historique une seule fois
        this.connectWs();
        this.refresh();
      } else {
        this.isAdmin = false;
        this.currentSolde = null;
        this.currentPseudo = '';      // reset propre
        this.disconnectWs();
        this.messages = [];
      }
    });
  }

  ngOnDestroy() {
    this.loginSub?.unsubscribe();
    this.soldeSub?.unsubscribe();
    this.disconnectWs();
  }


  private buildWsUrl(token: string): string {
    // apiBaseUrl = ex: "http://localhost:8080/api"
    const apiBase = environment.apiBaseUrl;
    const httpBase = apiBase.replace(/\/api\/?$/, '');
    return `${httpBase}/ws?token=${encodeURIComponent(token)}`;
  }

  private connectWs() {
    const token = this.auth.getToken();
    if (!token) return;

    // Si déjà connecté, on ne refait rien
    if (this.stompClient?.active) return;

    const wsUrl = this.buildWsUrl(token);

    const client = new Client({
      webSocketFactory: () => new SockJS(wsUrl),
      reconnectDelay: 5000,
      connectHeaders: {
        Authorization: `Bearer ${token}`
      },
      debug: () => {} // ou console.log si tu veux voir les logs STOMP
    });

    client.onConnect = () => {
      this.chatSub = client.subscribe('/topic/chat', msg => {
        const event = JSON.parse(msg.body) as ChatEvent;
        this.handleChatEvent(event);
      });
    };

    client.onStompError = frame => {
      console.error('STOMP error', frame.headers['message'], frame.body);
    };

    client.activate();
    this.stompClient = client;
  }

  private disconnectWs() {
    if (this.chatSub) {
      this.chatSub.unsubscribe();
      this.chatSub = undefined;
    }
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = undefined;
    }
  }

  private handleChatEvent(ev: ChatEvent) {
    if (ev.type === 'MESSAGE' && ev.message) {
      // Ton GET renvoie du plus ancien au plus récent,
      // donc on ajoute le nouveau à la fin.
      this.messages = [...this.messages, ev.message];
      this.scrollBas();
    } else if (ev.type === 'DELETE' && ev.id != null) {
      this.messages = this.messages.filter(m => m.id !== ev.id);
    } else if (ev.type === 'CLEAR') {
      this.messages = [];
    }
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
      }
    });
  }

  private syncCurrentPseudoFromAuth() {
    const user = this.auth.getCurrentUser();
    this.currentPseudo = user?.pseudo?.trim() ?? '';
  }

  isSelf(pseudo: string | null | undefined): boolean {
    if (!pseudo) return false;

    const p = pseudo.trim().toLowerCase();
    const me = (this.currentPseudo || '').trim().toLowerCase();

    return !!me && p === me;
  }


  supprimerMessage(id: number) {
    if (!this.isAdmin) return;
    if (!confirm("Supprimer ce message ?")) return;

    this.http.delete(`${this.base}/${id}`).subscribe();
    // Le ChatEvent.DELETE fera la mise à jour côté client
  }

  viderChat() {
    if (!this.isAdmin) return;
    if (!confirm("Vider le chat ?")) return;

    this.http.delete(`${this.base}/clear`).subscribe();
    // Le ChatEvent.CLEAR videra le tableau
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

    // ❌ Interdiction totale auto-tip (safety front)
    if (this.isSelf(pseudo)) return;

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
