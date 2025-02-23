import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { ProjectListComponent } from './components/project-list/project-list.component';

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
    path: 'projects',
    component: ProjectListComponent,
    canActivate: [AuthGuard]
  },
  { path: '', redirectTo: '/projects', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' }
];
