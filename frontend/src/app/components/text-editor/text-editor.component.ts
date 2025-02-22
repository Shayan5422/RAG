import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TextService, UserText } from '../../services/text.service';
import { ProjectService, Project } from '../../services/project.service';

@Component({
  selector: 'app-text-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto px-4 py-8">
      <!-- Text List -->
      <div class="mb-8">
        <div class="flex justify-between items-center mb-6">
          <h1 class="text-2xl font-bold">My Texts</h1>
          <button (click)="showCreateForm = true" 
                  class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            Create New Text
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div *ngFor="let text of texts" 
               class="border rounded-lg p-4 bg-white shadow-sm">
            <h3 class="text-xl font-semibold mb-2">{{text.title}}</h3>
            <p class="text-gray-600 mb-4 line-clamp-3">{{text.content}}</p>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-500">
                Updated: {{text.updated_at | date:'short'}}
              </span>
              <div class="space-x-2">
                <button (click)="editText(text)"
                        class="text-blue-500 hover:text-blue-700">
                  Edit
                </button>
                <button (click)="deleteText(text.id)"
                        class="text-red-500 hover:text-red-700">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Create/Edit Form -->
      <div *ngIf="showCreateForm || editingText" 
           class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
        <div class="bg-white rounded-lg p-6 w-full max-w-2xl">
          <h2 class="text-xl font-bold mb-4">
            {{editingText ? 'Edit Text' : 'Create New Text'}}
          </h2>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">Title</label>
            <input type="text" 
                   [(ngModel)]="currentText.title"
                   class="w-full px-3 py-2 border rounded">
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">Content</label>
            <textarea [(ngModel)]="currentText.content"
                      rows="10"
                      class="w-full px-3 py-2 border rounded"></textarea>
          </div>

          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              Associate with Projects
            </label>
            <div class="space-y-2">
              <div *ngFor="let project of projects" 
                   class="flex items-center">
                <input type="checkbox"
                       [checked]="isProjectSelected(project.id)"
                       (change)="toggleProject(project.id)"
                       class="mr-2">
                <span>{{project.name}}</span>
              </div>
            </div>
          </div>
          
          <div class="flex justify-end gap-2">
            <button (click)="cancelEdit()"
                    class="px-4 py-2 border rounded">
              Cancel
            </button>
            <button (click)="saveText()"
                    class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class TextEditorComponent implements OnInit {
  texts: UserText[] = [];
  projects: Project[] = [];
  showCreateForm = false;
  editingText: UserText | null = null;
  currentText = {
    title: '',
    content: '',
    projectIds: [] as number[]
  };

  constructor(
    private textService: TextService,
    private projectService: ProjectService
  ) { }

  ngOnInit(): void {
    this.loadTexts();
    this.loadProjects();
  }

  loadTexts(): void {
    this.textService.getTexts().subscribe({
      next: (texts) => {
        this.texts = texts;
      },
      error: (error) => {
        console.error('Error loading texts:', error);
      }
    });
  }

  loadProjects(): void {
    this.projectService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
      },
      error: (error) => {
        console.error('Error loading projects:', error);
      }
    });
  }

  editText(text: UserText): void {
    this.editingText = text;
    this.currentText = {
      title: text.title,
      content: text.content,
      projectIds: [] // You'll need to load the associated projects
    };
  }

  deleteText(id: number): void {
    if (confirm('Are you sure you want to delete this text?')) {
      this.textService.deleteText(id).subscribe({
        next: () => {
          this.texts = this.texts.filter(t => t.id !== id);
        },
        error: (error) => {
          console.error('Error deleting text:', error);
        }
      });
    }
  }

  saveText(): void {
    if (this.editingText) {
      this.textService.updateText(
        this.editingText.id,
        this.currentText.title,
        this.currentText.content,
        this.currentText.projectIds
      ).subscribe({
        next: (updatedText) => {
          const index = this.texts.findIndex(t => t.id === updatedText.id);
          if (index !== -1) {
            this.texts[index] = updatedText;
          }
          this.cancelEdit();
        },
        error: (error) => {
          console.error('Error updating text:', error);
        }
      });
    } else {
      this.textService.createText(
        this.currentText.title,
        this.currentText.content,
        this.currentText.projectIds
      ).subscribe({
        next: (newText) => {
          this.texts.push(newText);
          this.cancelEdit();
        },
        error: (error) => {
          console.error('Error creating text:', error);
        }
      });
    }
  }

  cancelEdit(): void {
    this.editingText = null;
    this.showCreateForm = false;
    this.currentText = {
      title: '',
      content: '',
      projectIds: []
    };
  }

  isProjectSelected(projectId: number): boolean {
    return this.currentText.projectIds.includes(projectId);
  }

  toggleProject(projectId: number): void {
    const index = this.currentText.projectIds.indexOf(projectId);
    if (index === -1) {
      this.currentText.projectIds.push(projectId);
    } else {
      this.currentText.projectIds.splice(index, 1);
    }
  }
} 