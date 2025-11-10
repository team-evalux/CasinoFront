import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {AvatarAdminPayload, AvatarService} from '../services/boutique/avatar.service';
import {AvatarDto} from '../services/boutique/avatar.models';


@Component({
  selector: 'app-avatar-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './avatar-admin.component.html',
  styleUrls: ['./avatar-admin.component.css']
})
export class AvatarAdminComponent implements OnInit {

  private avatarService = inject(AvatarService);

  avatars: AvatarDto[] = [];

  // formulaire création
  form: AvatarAdminPayload = {
    code: '',
    nom: '',
    rarete: 'COMMUN',
    prix: 0,
    imageUrl: '/assets/avatars/',
    actif: true,
    defaut: false
  };

  loading = false;
  loadingList = false;
  message: string | null = null;
  error: string | null = null;

  ngOnInit(): void {
    this.loadAvatars();
  }

  loadAvatars() {
    this.loadingList = true;
    this.avatarService.getAdminAvatars().subscribe({
      next: list => {
        this.avatars = list;
        this.loadingList = false;
      },
      error: () => {
        this.error = 'Impossible de charger la liste des avatars.';
        this.loadingList = false;
      }
    });
  }

  resetForm() {
    this.form = {
      code: '',
      nom: '',
      rarete: 'COMMUN',
      prix: 0,
      imageUrl: '/assets/avatars/',
      actif: true,
      defaut: false
    };
  }

  create() {
    this.error = null;
    this.message = null;
    this.loading = true;

    this.avatarService.createAvatar(this.form).subscribe({
      next: (avatar) => {
        this.message = `Avatar "${avatar.nom}" créé.`;
        this.avatars.push(avatar);
        this.loading = false;
        this.resetForm();
      },
      error: (err) => {
        this.error = err?.error?.error || 'Erreur lors de la création.';
        this.loading = false;
      }
    });
  }

  toggleActive(av: AvatarDto) {
    const target = !av.actif;
    this.error = null;
    this.message = null;

    this.avatarService.setActive(av.id, target).subscribe({
      next: updated => {
        this.avatars = this.avatars.map(a => a.id === updated.id ? updated : a);
        this.message = target
          ? `Avatar "${updated.nom}" réactivé.`
          : `Avatar "${updated.nom}" désactivé.`;
      },
      error: err => {
        this.error = err?.error?.error || 'Erreur lors du changement de statut.';
      }
    });
  }


  disable(av: AvatarDto) {
    if (!confirm(`Désactiver l'avatar "${av.nom}" ?`)) return;

    this.avatarService.disableAvatar(av.id).subscribe({
      next: () => {
        this.message = `Avatar "${av.nom}" désactivé.`;
        this.avatars = this.avatars.map(a =>
          a.id === av.id ? { ...a, actif: false } : a
        );
      },
      error: (err) => {
        this.error = err?.error?.error || 'Erreur lors de la désactivation.';
      }
    });
  }
}
