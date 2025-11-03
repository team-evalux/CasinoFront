import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-bet-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bet-input.component.html',
  styleUrls: ['./bet-input.component.css']
})
export class BetInputComponent {
  /** Montant actuel de la mise (liaison bidirectionnelle) */
  @Input() value: number = 0;
  @Output() valueChange = new EventEmitter<number>();

  /** Solde actuel du joueur */
  @Input() solde: number = 0;

  /** Limites de table */
  @Input() min: number = 1;
  @Input() max: number | null = null;

  /** Texte du label */
  @Input() label: string = 'Mise';

  /** Mise à jour manuelle */
  onChange() {
    if (this.value < this.min) this.value = this.min;
    if (this.max && this.value > this.max) this.value = this.max;
    if (this.value > this.solde) this.value = this.solde;
    this.valueChange.emit(this.value);
  }

  multiplier(facteur: number) {
    let nouvelle = Math.floor(this.value * facteur);
    if (nouvelle < this.min) nouvelle = this.min;
    if (this.max && nouvelle > this.max) nouvelle = this.max;
    if (nouvelle > this.solde) nouvelle = this.solde;
    this.value = nouvelle;
    this.valueChange.emit(this.value);
  }

  miseMax() {
    const maxAutorise = this.max && this.max > 0 ? Math.min(this.solde, this.max) : this.solde;
    this.value = Math.floor(maxAutorise);
    this.valueChange.emit(this.value);
  }
}
