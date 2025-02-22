import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 flex items-center justify-center">
      <div class="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h2 class="text-2xl font-bold text-center mb-6">Create Account</h2>
        
        <form (ngSubmit)="register()" #registerForm="ngForm">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">Username</label>
            <input type="text" 
                   [(ngModel)]="credentials.username" 
                   name="username"
                   required
                   class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500">
          </div>

          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">Email</label>
            <input type="email" 
                   [(ngModel)]="credentials.email" 
                   name="email"
                   required
                   class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500">
          </div>
          
          <div class="mb-6">
            <label class="block text-gray-700 text-sm font-bold mb-2">Password</label>
            <input type="password" 
                   [(ngModel)]="credentials.password" 
                   name="password"
                   required
                   class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500">
          </div>

          <div *ngIf="error" class="mb-4 text-red-500 text-sm text-center">
            {{error}}
          </div>
          
          <button type="submit"
                  [disabled]="!registerForm.form.valid"
                  class="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:bg-gray-400">
            Create Account
          </button>
        </form>

        <div class="mt-4 text-center">
          <a routerLink="/login" class="text-blue-500 hover:text-blue-600">
            Already have an account? Sign in
          </a>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class RegisterComponent {
  credentials = {
    username: '',
    email: '',
    password: ''
  };
  error: string = '';

  constructor(
    private http: HttpClient,
    private router: Router
  ) { }

  register() {
    const formData = new FormData();
    formData.append('username', this.credentials.username);
    formData.append('email', this.credentials.email);
    formData.append('password', this.credentials.password);

    this.http.post('http://localhost:8000/register', formData)
      .subscribe({
        next: () => {
          this.router.navigate(['/login']);
        },
        error: (error) => {
          console.error('Registration error:', error);
          if (error.error?.detail) {
            this.error = error.error.detail;
          } else {
            this.error = 'Registration failed. Please try again.';
          }
        }
      });
  }
} 