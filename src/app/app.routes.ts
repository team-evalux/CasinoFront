// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { RegisterComponent } from './register/register.component';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from './guard/auth.guard';
import { GuestGuard } from './guard/guest.guard';
import { AdminGuard } from './guard/admin.guard';
import { GameHistoryComponent } from './history/game-history.component';
import {VerifyEmailComponent} from './email/verify-email.component';
import {ForgotPasswordComponent} from './email/forgot-password.component';
import {AboutComponent} from './about/about.component';
import {SupportComponent} from './support/support.component';
import {RgpdComponent} from './rgpd/rgpd.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },

  // Inscription : seulement pour invités
  { path: 'register', component: RegisterComponent, canActivate: [GuestGuard] },

  // Home accessible à tous
  { path: 'home', component: HomeComponent },

  // === JEUX : APERÇU LIBRE (AuthGuard retiré) ===
  // ⚠️ Les composants désactivent les mises quand !isLoggedIn
  { path: 'play/coinflip', loadComponent: () => import('./game/coinflip/coinflip.component').then(m => m.CoinflipComponent) },
  { path: 'play/slots',    loadComponent: () => import('./game/slot/slot-machine.component').then(m => m.SlotMachineComponent) },
  { path: 'play/roulette', loadComponent: () => import('./game/roulette/roulette.component').then(m => m.RouletteComponent) },
  { path: 'play/mines', loadComponent: () => import('./game/mines/mines.component').then(m => m.MinesComponent) },

  // src/app/app.routes.ts (ajoute les 2 lignes ci-dessous)
  { path: 'play/blackjack', loadComponent: () => import('./game/blackjack/blackjack-lobby.component').then(m => m.BlackjackLobbyComponent) },
  { path: 'play/blackjack/table/:id', loadComponent: () => import('./game/blackjack/blackjack-table.component').then(m => m.BlackjackTableComponent) },

  { path: 'verify-email', component: VerifyEmailComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent, canActivate: [GuestGuard] }, // ⬅️


  { path: 'admin/coinflip',  loadComponent: () => import('./admin/coinflip-admin.component').then(m => m.CoinflipAdminComponent),  canActivate: [AuthGuard, AdminGuard] },
  { path: 'admin/slots',     loadComponent: () => import('./admin/slots-admin.component').then(m => m.SlotsAdminComponent),        canActivate: [AuthGuard, AdminGuard] },
  { path: 'admin/roulette',  loadComponent: () => import('./admin/roulette-admin.component').then(m => m.RouletteAdminComponent),  canActivate: [AuthGuard, AdminGuard] },

  // Historique : si tu veux le laisser privé, on garde AuthGuard
  { path: 'history', component: GameHistoryComponent, canActivate: [AuthGuard] },

  // ...
  { path: 'account/delete', loadComponent: () => import('./account/delete-account.component').then(m => m.DeleteAccountComponent), canActivate: [AuthGuard] },
// ...

  { path: 'about', component: AboutComponent },
  { path: 'support', component: SupportComponent },

  { path: 'rgpd', component: RgpdComponent },

  // Fallback
  { path: '**', redirectTo: 'home' }
];
