import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { interval } from 'rxjs';
import {environment} from '../environments/environment';
import {AuthService} from '../app/services/auth.service';


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
export class ChatComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService); // ✅
  base = `${environment.apiBaseUrl}/chat`;
  ouvert = false;
  messages: ChatMessage[] = [];
  nouveauMessage = '';
  chargement = false;
  isAdmin = false; // ✅

  ngOnInit() {
    this.refresh();
    interval(5000).subscribe(() => this.refresh());
    this.isAdmin = this.auth.hasRole && this.auth.hasRole('ADMIN'); // ✅ si méthode exists
  }

  toggle() {
    this.ouvert = !this.ouvert;
    document.body.classList.toggle('chat-ouvert', this.ouvert);
  }


  refresh() {
    this.http.get<ChatMessage[]>(this.base).subscribe(r => this.messages = r);
  }

  envoyer() {
    if (!this.nouveauMessage.trim()) return;
    const contenu = this.nouveauMessage.trim().slice(0, 150);
    this.chargement = true;
    this.http.post(this.base, { contenu }).subscribe({
      next: () => {
        this.nouveauMessage = '';
        this.refresh();
        this.chargement = false;
      },
      error: () => this.chargement = false
    });
  }

  viderChat() {
    if (confirm("Vider le chat ?")) {
      this.http.delete(`${this.base}/clear`).subscribe(() => this.refresh());
    }
  }
}

