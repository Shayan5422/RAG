import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, catchError } from 'rxjs';
import { User, UserCredentials, RegisterCredentials, AuthResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = 'http://localhost:8000';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    const token = localStorage.getItem('token');
    if (token) {
      this.loadCurrentUser();
    }
  }

  register(credentials: RegisterCredentials): Observable<{ message: string }> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('email', credentials.email);
    formData.append('password', credentials.password);
    
    return this.http.post<{ message: string }>(`${this.API_URL}/register`, formData);
  }

  login(credentials: UserCredentials): Observable<AuthResponse> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);
    formData.append('grant_type', 'password');

    return this.http.post<AuthResponse>(`${this.API_URL}/token`, formData).pipe(
      tap(response => {
        localStorage.setItem('token', response.access_token);
        this.loadCurrentUser();
      })
    );
  }

  private loadCurrentUser() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.currentUserSubject.next(null);
      return;
    }

    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    
    this.http.get<User>(`${this.API_URL}/me`, { headers }).subscribe({
      next: (user) => this.currentUserSubject.next(user),
      error: () => {
        localStorage.removeItem('token');
        this.currentUserSubject.next(null);
      }
    });
  }

  logout() {
    localStorage.removeItem('token');
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    return !!token;
  }
} 