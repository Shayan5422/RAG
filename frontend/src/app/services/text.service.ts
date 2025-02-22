import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SharedUser } from './project.service';

export interface UserText {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  owner_id: number;
  shared_users?: SharedUser[];
}

@Injectable({
  providedIn: 'root'
})
export class TextService {
  private apiUrl = 'http://localhost:8000';

  constructor(private http: HttpClient) { }

  createText(title: string, content: string, projectIds: number[] = []): Observable<UserText> {
    return this.http.post<UserText>(`${this.apiUrl}/texts`, {
      title,
      content,
      project_ids: projectIds
    });
  }

  getTexts(projectId?: number): Observable<UserText[]> {
    const url = projectId ? 
      `${this.apiUrl}/texts?project_id=${projectId}` :
      `${this.apiUrl}/texts`;
    return this.http.get<UserText[]>(url);
  }

  getText(id: number): Observable<UserText> {
    return this.http.get<UserText>(`${this.apiUrl}/texts/${id}`);
  }

  updateText(id: number, title: string, content: string, projectIds: number[] = []): Observable<UserText> {
    return this.http.put<UserText>(`${this.apiUrl}/texts/${id}`, {
      title,
      content,
      project_ids: projectIds
    });
  }

  deleteText(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/texts/${id}`);
  }

  shareText(textId: number, email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/texts/${textId}/share`, { email });
  }

  removeTextAccess(textId: number, userId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/texts/${textId}/share/${userId}`);
  }

  getTextSharedUsers(textId: number): Observable<SharedUser[]> {
    return this.http.get<SharedUser[]>(`${this.apiUrl}/texts/${textId}/shared-users`);
  }
} 