import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface ChatResponse {
  answer: string;
  sources?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class RagService {
  private apiUrl = 'https://api.neurocorengine.com';  // This will be proxied to the backend

  constructor(private http: HttpClient) {}

  uploadDocument(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    
    console.log('Sending request to:', `${this.apiUrl}/upload`); // Debug log
    console.log('FormData:', formData); // Debug log
    
    return this.http.post(`${this.apiUrl}/upload`, formData).pipe(
      tap(
        response => console.log('Upload success:', response),
        error => console.error('Upload error:', error)
      )
    );
  }

  sendMessage(message: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.apiUrl}/chat`, { message });
  }

  getActiveDocuments(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/documents`);
  }
} 