import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards/auth.guards';

export const routes: Routes = [
  {
    path: '',
    title: 'ResumeStudio — Resume Builder, ATS Checker & PDF Editor',
    loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'login',
    title: 'Log in — ResumeStudio',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth-page').then((m) => m.AuthPage),
    data: { mode: 'login', preload: true },
  },
  {
    path: 'register',
    title: 'Create account — ResumeStudio',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth-page').then((m) => m.AuthPage),
    data: { mode: 'register', preload: true },
  },
  {
    path: 'templates',
    title: 'Resume Templates — ResumeStudio',
    loadComponent: () => import('./pages/templates/templates-page').then((m) => m.TemplatesPage),
    data: { public: true, preload: true },
  },
  {
    path: 'app',
    canActivate: [authGuard],
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
    canActivate: [authGuard],
    loadComponent: () => import('./pages/builder/builder').then((m) => m.Builder),
    data: { preload: 'signed-in' },
  },
  {
    path: 'editor/:id',
    title: 'Document Editor — ResumeStudio',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/editor/doc-editor').then((m) => m.DocEditor),
  },
  { path: '**', redirectTo: '' },
];
