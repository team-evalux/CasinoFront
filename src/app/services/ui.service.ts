import { Injectable, effect, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiService {
  menuOpen = signal(false);

  constructor() {
    // lock scroll quand le menu est ouvert
    effect(() => {
      const open = this.menuOpen();
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  openMenu()  { this.menuOpen.set(true); }
  closeMenu() { this.menuOpen.set(false); }
  toggleMenu(){ this.menuOpen.update(v => !v); }
}
