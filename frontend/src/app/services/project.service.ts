import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  user_id: number;
  owner_id: number;
  owner?: {
    id: number;
    email: string;
  };
  shared_users?: SharedUser[];
  is_shared?: boolean;
}

export interface Document {
  id: number;
  name: string;
  content: string;
  file_path: string;
  project_id: number;
  folder_id: number | null;
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
  private apiUrl = environment.apiUrl;

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

  uploadDocument(projectId: number, file: File, folder_id?: number | null): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (folder_id !== undefined && folder_id !== null) {
      formData.append('folder_id', folder_id.toString());
    }
    return this.http.post(`${this.apiUrl}/projects/${projectId}/documents`, formData);
  }

  getDocuments(projectId: number): Observable<Document[]> {
    return this.http.get<Document[]>(`${this.apiUrl}/projects/${projectId}/documents`);
  }

  askQuestion(contextId: number, question: string, contextType: 'project' | 'folder'): Observable<any> {
    const data = {
      question: question,
      context_type: contextType
    };
    
    return this.http.post(
      `${this.apiUrl}/${contextType}s/${contextId}/ask`,
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