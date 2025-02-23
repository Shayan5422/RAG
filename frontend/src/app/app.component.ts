import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProjectService, Project } from './services/project.service';
import { TextService, UserText } from './services/text.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSignInAlt, faUserPlus, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, FontAwesomeModule],
  template: `
    <!-- Navigation Bar -->
    <nav class="bg-white shadow-lg">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <a routerLink="/" class="text-xl font-bold text-gray-800">
              Project Management
            </a>
          </div>
          <div class="flex items-center">
            <ng-container *ngIf="!isLoggedIn()">
              <a routerLink="/login" 
                 class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mr-2 flex items-center"
                 title="Login">
                <fa-icon [icon]="faSignInAlt" size="lg"></fa-icon>
              </a>
              <a routerLink="/register" 
                 class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                 title="Register">
                <fa-icon [icon]="faUserPlus" size="lg"></fa-icon>
              </a>
            </ng-container>
            <button *ngIf="isLoggedIn()" 
                    (click)="logout()"
                    class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center"
                    title="Logout">
              <fa-icon [icon]="faSignOutAlt" size="lg"></fa-icon>
            </button>
          </div>
        </div>
      </div>
    </nav>

    <router-outlet></router-outlet>
  `,
  styles: []
})
export class AppComponent implements OnInit {
  // Font Awesome Icons
  faSignInAlt = faSignInAlt;
  faUserPlus = faUserPlus;
  faSignOutAlt = faSignOutAlt;

  // Projects
  projects: Project[] = [];
  selectedProject: Project | null = null;
  showCreateProject = false;
  newProject = { name: '', description: '' };

  // Texts
  projectTexts: UserText[] = [];
  showCreateText = false;
  editingText: UserText | null = null;
  currentText = { title: '', content: '' };

  // Documents
  projectDocuments: any[] = [];
  showUploadFile = false;
  selectedFile: File | null = null;

  // PDF Viewer
  showPdfViewer = false;
  viewingDocument: any = null;
  pdfUrl: any = null;

  // Chat
  activeTab = 'chat';
  question = '';
  answer = '';
  selectedItems: number[] = [];

  constructor(
    private projectService: ProjectService,
    private textService: TextService,
    private router: Router
  ) { }

  ngOnInit(): void {
    if (this.isLoggedIn()) {
      this.loadProjects();
    } else {
      this.router.navigate(['/login']);
    }
  }

  loadProjects(): void {
    if (!this.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    this.projectService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
      },
      error: (error) => {
        if (error.status === 401) {
          this.logout();
        } else {
          console.error('Error loading projects:', error);
        }
      }
    });
  }

  selectProject(project: Project): void {
    this.selectedProject = project;
    this.loadProjectContent();
  }

  loadProjectContent(): void {
    if (!this.selectedProject) return;

    // Load texts
    this.textService.getTexts(this.selectedProject.id).subscribe({
      next: (texts) => {
        this.projectTexts = texts;
      },
      error: (error) => {
        console.error('Error loading texts:', error);
      }
    });

    // Load documents
    this.projectService.getDocuments(this.selectedProject.id).subscribe({
      next: (documents) => {
        this.projectDocuments = documents;
      },
      error: (error) => {
        console.error('Error loading documents:', error);
      }
    });
  }

  createProject(): void {
    if (!this.newProject.name) return;

    this.projectService.createProject(
      this.newProject.name,
      this.newProject.description
    ).subscribe({
      next: (project) => {
        this.projects.push(project);
        this.showCreateProject = false;
        this.newProject = { name: '', description: '' };
      },
      error: (error) => {
        console.error('Error creating project:', error);
      }
    });
  }

  // Text Management
  editText(text: UserText): void {
    this.editingText = text;
    this.currentText = {
      title: text.title,
      content: text.content
    };
    this.showCreateText = true;
  }

  saveText(): void {
    if (!this.selectedProject) return;

    if (this.editingText) {
      this.textService.updateText(
        this.editingText.id,
        this.currentText.title,
        this.currentText.content,
        [this.selectedProject.id]
      ).subscribe({
        next: (updatedText) => {
          const index = this.projectTexts.findIndex(t => t.id === updatedText.id);
          if (index !== -1) {
            this.projectTexts[index] = updatedText;
          }
          this.cancelTextEdit();
        },
        error: (error) => {
          console.error('Error updating text:', error);
        }
      });
    } else {
      this.textService.createText(
        this.currentText.title,
        this.currentText.content,
        [this.selectedProject.id]
      ).subscribe({
        next: (newText) => {
          this.projectTexts.push(newText);
          this.cancelTextEdit();
        },
        error: (error) => {
          console.error('Error creating text:', error);
        }
      });
    }
  }

  cancelTextEdit(): void {
    this.editingText = null;
    this.showCreateText = false;
    this.currentText = { title: '', content: '' };
  }

  deleteText(id: number): void {
    if (confirm('Are you sure you want to delete this text?')) {
      this.textService.deleteText(id).subscribe({
        next: () => {
          this.projectTexts = this.projectTexts.filter(t => t.id !== id);
        },
        error: (error) => {
          console.error('Error deleting text:', error);
        }
      });
    }
  }

  // File Management
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  uploadFile(): void {
    if (!this.selectedFile || !this.selectedProject) return;

    this.projectService.uploadDocument(
      this.selectedProject.id,
      this.selectedFile
    ).subscribe({
      next: () => {
        this.loadProjectContent();
        this.showUploadFile = false;
        this.selectedFile = null;
      },
      error: (error) => {
        console.error('Error uploading document:', error);
      }
    });
  }

  viewDocument(doc: any): void {
    this.viewingDocument = doc;
    this.pdfUrl = `https://api.neurocorengine.com${doc.file_path}`;
    this.showPdfViewer = true;
  }

  deleteDocument(id: number): void {
    // Implement document deletion
  }

  // Chat
  askQuestion(): void {
    if (!this.selectedProject || !this.question) return;

    this.projectService.askQuestion(
      this.selectedProject.id,
      this.question,
      'project'
    ).subscribe({
      next: (response) => {
        this.answer = response.answer;
        this.question = '';
      },
      error: (error) => {
        console.error('Error asking question:', error);
      }
    });
  }

  toggleItem(id: number): void {
    const index = this.selectedItems.indexOf(id);
    if (index === -1) {
      this.selectedItems.push(id);
    } else {
      this.selectedItems.splice(index, 1);
    }
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  logout(): void {
    localStorage.removeItem('token');
    this.router.navigate(['/login']);
    this.selectedProject = null;
    this.projects = [];
    this.projectTexts = [];
    this.projectDocuments = [];
  }
}
