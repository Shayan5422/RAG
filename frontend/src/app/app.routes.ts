import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { ProjectListComponent } from './components/project-list/project-list.component';
import { ProjectDetailComponent } from './components/project-detail/project-detail.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./components/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'texts',
    loadComponent: () => import('./components/text-editor/text-editor.component').then(m => m.TextEditorComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'upload',
    loadComponent: () => import('./components/upload/upload.component').then(m => m.UploadComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'chat-history',
    loadComponent: () => import('./components/chat-history/chat-history.component').then(m => m.ChatHistoryComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'chat',
    loadComponent: () => import('./pages/chat/chat.component').then(m => m.ChatComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'projects',
    component: ProjectListComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'projects/:id',
    component: ProjectDetailComponent,
    canActivate: [AuthGuard]
  },
  { path: '', redirectTo: '/projects', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' }
];
