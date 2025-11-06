import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-rgpd',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './rgpd.component.html',
  styleUrls: ['./rgpd.component.css']
})
export class RgpdComponent {
  // Date de dernière mise à jour affichée dans la page
  derniereMAJ = '6 novembre 2025';
}
