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
  owner_id: number;
  shared_users?: SharedUser[];
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

export interface SharedUser {
  id: number;
  email: string;
  shared_at: string;
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

  shareProject(projectId: number, email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/projects/${projectId}/share`, { email });
  }

  removeProjectAccess(projectId: number, userId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/projects/${projectId}/share/${userId}`);
  }

  getProjectSharedUsers(projectId: number): Observable<SharedUser[]> {
    return this.http.get<SharedUser[]>(`${this.apiUrl}/projects/${projectId}/shared-users`);
  }

  deleteDocument(projectId: number, documentId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/projects/${projectId}/documents/${documentId}`);
  }

  deleteProject(projectId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/projects/${projectId}`);
  }

  updateProject(projectId: number, name: string, description: string): Observable<Project> {
    return this.http.put<Project>(`${this.apiUrl}/projects/${projectId}`, { name, description });
  }
} 