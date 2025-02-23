import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Chat, ChatMessage, ChatResponse } from '../models/chat.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly API_URL = 'https://api.neurocorengine.com';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  sendMessage(message: ChatMessage): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.API_URL}/chat`, message, {
      headers: this.getHeaders()
    });
  }

  getChatHistory(): Observable<Chat[]> {
    return this.http.get<Chat[]>(`${this.API_URL}/chat-history`, {
      headers: this.getHeaders()
    });
  }

  uploadDocument(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.API_URL}/upload`, formData, {
      headers: this.getHeaders()
    });
  }

  getDocuments(): Observable<string[]> {
    return this.http.get<string[]>(`${this.API_URL}/documents`, {
      headers: this.getHeaders()
    });
  }

  askQuestion(file: File, question: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('question', question);
    return this.http.post(`${this.API_URL}/ask`, formData, {
      headers: this.getHeaders()
    });
  }
} 