import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  user_id?: number;
}

export interface Document {
  id: number;
  name: string;
  content?: string;
  file_path: string;
  project_id: number;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private apiUrl = 'http://localhost:8000';

  constructor(private http: HttpClient) { }

  createProject(name: string, description: string): Observable<Project> {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    return this.http.post<Project>(`${this.apiUrl}/projects`, formData);
  }

  getProjects(): Observable<Project[]> {
    return this.http.get<Project[]>(`${this.apiUrl}/projects`);
  }

  getProject(id: number): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/projects/${id}`);
  }

  uploadDocument(projectId: number, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/projects/${projectId}/documents`, formData);
  }

  getDocuments(projectId: number): Observable<Document[]> {
    return this.http.get<Document[]>(`${this.apiUrl}/projects/${projectId}/documents`);
  }

  askQuestion(projectId: number, question: string, documentIds: number[]): Observable<any> {
    const data = {
      question: question,
      document_ids: documentIds
    };
    
    return this.http.post(
      `${this.apiUrl}/projects/${projectId}/ask`,
      data,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
} 