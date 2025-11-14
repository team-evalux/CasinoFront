import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgForOf } from '@angular/common';

interface RoadmapEvent {
  id: number;
  date: string;
  label: string;
  details: string[];
}

@Component({
  selector: 'app-about',
  standalone: true,
  templateUrl: './about.component.html',
  imports: [RouterLink, NgForOf],
  styleUrls: ['./about.component.css']
})
export class AboutComponent {

  events: ({
    details: string[];
    id: number;
    label: string
  })[] = [
    {
      id: 1,
      label: "Début du projet",
      details: [
        "Création de la structure du projet",
        "Mise en place du back-end Spring Boot",
        "Début du design du front Angular",
        "Architecture du système de comptes"
      ]
    },
    {
      id: 2,
      label: "Sortie de la V1",
      details: [
        "Jeux Pile ou Face, Machines à Sous, Mines,BlackJack multijoueur",
        "Chat global semi temps réel",
        "Tips entre joueurs",
        "Bonus horaire automatique",
        "Historique complet",
        "Authentification sécurisée"
      ]
    },
    {
      id: 3,
      label: "V2 + application mobile",
      details: [
        "Sortie de l'application  mobile",
        "Boutique d'avatar",
        "Nouveau jeu"
      ]
    }
  ];

  selectedId = 1;

  get progressionPercent() {
    return ((this.selectedId - 1) / (this.events.length - 1)) * 100;
  }

  getDotPosition(i: number) {
    return (i / (this.events.length - 1)) * 100;
  }

  selectDot(id: number) {
    this.selectedId = id;
  }

  get selectedEvent() {
    return this.events.find(e => e.id === this.selectedId)!;
  }
}
