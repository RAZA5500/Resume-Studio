import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, homeGuard, serverGuard } from './core/guards/auth.guards';
import { Landing } from './pages/landing/landing';

export const routes: Routes = [
  {
    path: '',
    title: 'ResumeStudio — Resume Builder, ATS Checker & PDF Editor',
    canActivate: [homeGuard],
    // Eager: most first visits land here, and a lazy chunk would cost one more round trip before
    // anything renders. Every other page stays lazy.
    component: Landing,
  },
  {
    // Android test builds only (no API_URL baked in): asks for the backend address.
    path: 'connect',
    title: 'Connect — ResumeStudio',
    loadComponent: () => import('./pages/connect/connect-page').then((m) => m.ConnectPage),
  },
  {
    path: 'login',
    title: 'Log in — ResumeStudio',
    canActivate: [serverGuard, guestGuard],
    loadComponent: () => import('./pages/auth/auth-page').then((m) => m.AuthPage),
    data: { mode: 'login', preload: true },
  },
  {
    path: 'register',
    title: 'Create account — ResumeStudio',
    canActivate: [serverGuard, guestGuard],
    loadComponent: () => import('./pages/auth/auth-page').then((m) => m.AuthPage),
    data: { mode: 'register', preload: true },
  },
  {
    // Google / Apple sign-in comes back here (through the API); open whether signed in or not.
    path: 'auth/callback',
    title: 'Signing in — ResumeStudio',
    canActivate: [serverGuard],
    loadComponent: () => import('./pages/auth/oauth-callback').then((m) => m.OAuthCallback),
  },
  {
    path: 'templates',
    title: 'Resume Templates — ResumeStudio',
    canActivate: [serverGuard],
    loadComponent: () => import('./pages/templates/templates-page').then((m) => m.TemplatesPage),
    data: { public: true, preload: true },
  },
  {
    path: 'app',
    canActivate: [serverGuard, authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    data: { preload: 'signed-in' },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard — ResumeStudio',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
        data: { preload: 'signed-in' },
      },
      {
        path: 'templates',
        title: 'Templates — ResumeStudio',
        loadComponent: () => import('./pages/templates/templates-page').then((m) => m.TemplatesPage),
        data: { preload: 'signed-in' },
      },
      {
        path: 'ats',
        title: 'ATS Checker — ResumeStudio',
        loadComponent: () => import('./pages/ats/ats-page').then((m) => m.AtsPage),
        data: { preload: 'signed-in' },
      },
      {
        path: 'ats/:reportId',
        title: 'ATS Report — ResumeStudio',
        loadComponent: () => import('./pages/ats/ats-page').then((m) => m.AtsPage),
        data: { preload: 'signed-in' },
      },
      {
        path: 'documents',
        title: 'Documents — ResumeStudio',
        loadComponent: () => import('./pages/documents/documents-page').then((m) => m.DocumentsPage),
        data: { preload: 'signed-in' },
      },
      {
        path: 'cover-letter',
        title: 'Cover Letter — ResumeStudio',
        loadComponent: () => import('./pages/cover-letter/cover-letter-page').then((m) => m.CoverLetterPage),
        data: { preload: 'signed-in' },
      },
      {
        path: 'profile',
        title: 'Profile — ResumeStudio',
        loadComponent: () => import('./pages/profile/profile-page').then((m) => m.ProfilePage),
        data: { preload: 'signed-in' },
      },
      {
        path: 'billing',
        title: 'Plan & billing — ResumeStudio',
        loadComponent: () => import('./pages/billing/billing-page').then((m) => m.BillingPage),
        data: { preload: 'signed-in' },
      },
      {
        path: 'admin',
        title: 'Admin — ResumeStudio',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/admin-page').then((m) => m.AdminPage),
      },
    ],
  },
  {
    path: 'builder/:id',
    title: 'Resume Builder — ResumeStudio',
    canActivate: [serverGuard, authGuard],
    loadComponent: () => import('./pages/builder/builder').then((m) => m.Builder),
    data: { preload: 'signed-in' },
  },
  {
    path: 'editor/:id',
    title: 'Document Editor — ResumeStudio',
    canActivate: [serverGuard, authGuard],
    loadComponent: () => import('./pages/editor/doc-editor').then((m) => m.DocEditor),
  },
  {
    // Full-page checkout outside the app shell: online gateway first, the QR code as the alternative.
    path: 'checkout',
    title: 'Checkout — ResumeStudio',
    canActivate: [serverGuard, authGuard],
    loadComponent: () => import('./pages/checkout/checkout-page').then((m) => m.CheckoutPage),
    data: { preload: 'signed-in' },
  },
  {
    // The gateway returns the buyer here (through the API); public, see CheckoutResult.
    path: 'checkout/result',
    title: 'Payment status — ResumeStudio',
    canActivate: [serverGuard],
    loadComponent: () => import('./pages/checkout/checkout-result').then((m) => m.CheckoutResult),
  },
  { path: '**', redirectTo: '' },
];
