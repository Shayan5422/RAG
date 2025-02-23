import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-8 transform transition-all duration-300 hover:shadow-xl" [@fadeIn]>
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold text-gray-800 mb-2">Welcome Back</h2>
          <p class="text-gray-600">Sign in to your account</p>
        </div>
        
        <form (ngSubmit)="login()" #loginForm="ngForm" class="space-y-6">
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 block">Username</label>
            <div class="relative">
              <input type="text" 
                     [(ngModel)]="credentials.username" 
                     name="username"
                     required
                     class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 outline-none"
                     [class.border-red-500]="loginForm.form.get('username')?.invalid && loginForm.form.get('username')?.touched">
            </div>
          </div>
          
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 block">Password</label>
            <div class="relative">
              <input type="password" 
                     [(ngModel)]="credentials.password" 
                     name="password"
                     required
                     class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 outline-none"
                     [class.border-red-500]="loginForm.form.get('password')?.invalid && loginForm.form.get('password')?.touched">
            </div>
          </div>

          <div *ngIf="error" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center animate-fade-in">
            {{error}}
          </div>
          
          <button type="submit"
                  [disabled]="!loginForm.form.valid || isLoading"
                  class="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 px-4 rounded-lg font-medium
                         hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                         transform transition-all duration-200 hover:scale-[1.02]
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
            <span *ngIf="!isLoading">Sign In</span>
            <span *ngIf="isLoading" class="flex items-center justify-center">
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          </button>
        </form>

        <div class="mt-6 text-center">
          <a routerLink="/register" 
             class="text-blue-600 hover:text-blue-800 font-medium transition duration-200">
            Don't have an account? Sign up
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fade-in 0.3s ease-out;
    }
  `]
})
export class LoginComponent {
  credentials = {
    username: '',
    password: ''
  };
  error: string = '';
  isLoading: boolean = false;

  constructor(
    private http: HttpClient,
    private router: Router
  ) { }

  login() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    const formData = new FormData();
    formData.append('username', this.credentials.username);
    formData.append('password', this.credentials.password);

    this.http.post<{access_token: string}>('http://localhost:8000/token', formData)
      .subscribe({
        next: (response) => {
          localStorage.setItem('token', response.access_token);
          this.isLoading = false;
          this.router.navigate(['/projects']);
          this.error = '';
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Login error:', error);
          this.error = error.error?.detail || 'Invalid username or password';
        }
      });
  }
} 