import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService, Project, Document } from '../../services/project.service';
import { TextService, UserText } from '../../services/text.service';
import { SafeUrlPipe } from '../../pipes/safe-url.pipe';

interface ProjectWithStats extends Project {
  documentCount: number;
}

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe],
  template: `
    <div class="min-h-screen bg-gray-50 flex">
      <!-- Two-level Sidebar -->
      <div class="w-64 bg-white shadow-lg flex flex-col h-screen sticky top-0">
        <!-- Project Selection or Back Navigation -->
        <div class="p-4 border-b flex-shrink-0">
          <ng-container *ngIf="!selectedProject">
            <h1 class="text-xl font-bold text-gray-800 mb-4">Projects</h1>
            
            <button (click)="showCreateProject = true"
                    class="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-4">
              <i class="pi pi-plus mr-2"></i>Create Project
            </button>

            <div class="space-y-2 overflow-y-auto">
              <ng-container *ngFor="let proj of projects; trackBy: trackByProjectId">
                <div (click)="selectProject(proj)"
                     class="p-3 rounded cursor-pointer hover:bg-gray-100 flex items-center"
                     [class.bg-blue-100]="isProjectSelected(proj)">
                  <i class="pi pi-folder mr-2 text-blue-500"></i>
                  {{proj.name}}
                </div>
              </ng-container>
            </div>
          </ng-container>

          <ng-container *ngIf="selectedProject">
            <div class="flex items-center mb-4">
              <button (click)="deselectProject()"
                      class="text-gray-600 hover:text-gray-900 mr-2">
                <i class="pi pi-arrow-left"></i>
              </button>
              <h1 class="text-xl font-bold text-gray-800 truncate">{{selectedProject.name}}</h1>
            </div>
          </ng-container>
        </div>

        <!-- Files and Texts List -->
        <div class="flex-1 overflow-y-auto" *ngIf="selectedProject">
          <!-- Files List -->
          <div class="p-4 space-y-2">
            <ng-container *ngFor="let item of getAllItems()">
              <div (click)="toggleItem(item, $event)"
                   class="p-2 rounded cursor-pointer hover:bg-gray-100 flex items-center gap-2"
                   [class.bg-blue-100]="selectedItems.includes(item.id)"
                   [class.bg-green-100]="isItemSelected(item)">
                <i [class]="getItemIcon(item)" 
                   [class.text-red-500]="isDocument(item)"
                   [class.text-green-500]="!isDocument(item)"></i>
                <span class="truncate text-sm">{{getItemName(item)}}</span>
                <span *ngIf="selectedItems.includes(item.id)" class="text-xs text-blue-600 ml-auto">
                  Selected for Chat
                </span>
              </div>
            </ng-container>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="p-4 border-t flex-shrink-0" *ngIf="selectedProject">
          <div class="space-y-2">
            <button (click)="showCreateText = true"
                    class="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center justify-center">
              <i class="pi pi-file mr-2"></i>New Text
            </button>
            <button (click)="showUploadFile = true"
                    class="w-full bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 flex items-center justify-center">
              <i class="pi pi-upload mr-2"></i>Upload File
            </button>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 p-6 overflow-y-auto">
        <!-- Project Header -->
        <div *ngIf="selectedProject" class="mb-6">
          <h2 class="text-2xl font-bold">{{selectedProject.name}}</h2>
          <p class="text-gray-600">{{selectedProject.description}}</p>
        </div>

        <!-- Content Area -->
        <ng-container *ngIf="selectedProject">
          <!-- Document Viewer -->
          <div *ngIf="selectedDocument" class="bg-white rounded-lg shadow-sm p-6">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-xl font-bold">{{selectedDocument.name}}</h3>
              <button (click)="viewDocument(selectedDocument)"
                      class="text-blue-500 hover:text-blue-700">
                Open PDF
              </button>
            </div>
          </div>

          <!-- Text Viewer -->
          <div *ngIf="selectedText" class="bg-white rounded-lg shadow-sm p-6">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-xl font-bold">{{selectedText.title}}</h3>
              <div class="space-x-2">
                <button (click)="editText(selectedText)"
                        class="text-blue-500 hover:text-blue-700">
                  Edit
                </button>
                <button (click)="deleteText(selectedText.id)"
                        class="text-red-500 hover:text-red-700">
                  Delete
                </button>
              </div>
            </div>
            <p class="text-gray-600 whitespace-pre-wrap">{{selectedText.content}}</p>
          </div>

          <!-- Chat Interface -->
          <div *ngIf="!selectedDocument && !selectedText" class="bg-white rounded-lg shadow-sm p-6">
            <h3 class="text-xl font-bold mb-4">Chat</h3>
            
            <!-- Selected Items Summary -->
            <div class="mb-4 p-4 bg-gray-50 rounded-lg" *ngIf="selectedItems.length > 0">
              <h4 class="font-semibold mb-2">Selected Items:</h4>
              <div class="space-y-2">
                <div *ngFor="let itemId of selectedItems" class="flex items-center justify-between">
                  <span>{{getItemNameById(itemId)}}</span>
                  <button (click)="removeFromSelection(itemId)" 
                          class="text-red-500 hover:text-red-700">
                    <i class="pi pi-times"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="mb-4">
              <textarea [(ngModel)]="question"
                       placeholder="Ask a question..."
                       rows="3"
                       class="w-full p-3 border rounded-lg"></textarea>
            </div>
            
            <div class="flex justify-between items-center">
              <div class="text-sm text-gray-500">
                Selected items: {{selectedItems.length}}
              </div>
              <button (click)="askQuestion()"
                      [disabled]="!question || selectedItems.length === 0"
                      class="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400">
                Ask
              </button>
            </div>

            <div *ngIf="answer" class="mt-4 p-4 bg-gray-50 rounded-lg">
              <p class="whitespace-pre-wrap">{{answer}}</p>
            </div>
          </div>
        </ng-container>
      </div>
    </div>

    <!-- Create Project Modal -->
    <div *ngIf="showCreateProject" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-96">
        <h2 class="text-xl font-bold mb-4">Create New Project</h2>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">Project Name</label>
          <input type="text" [(ngModel)]="newProject.name"
                 class="w-full px-3 py-2 border rounded">
        </div>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">Description</label>
          <textarea [(ngModel)]="newProject.description"
                   rows="3"
                   class="w-full px-3 py-2 border rounded"></textarea>
        </div>
        <div class="flex justify-end gap-2">
          <button (click)="showCreateProject = false"
                  class="px-4 py-2 border rounded">
            Cancel
          </button>
          <button (click)="createProject()"
                  class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            Create
          </button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Text Modal -->
    <div *ngIf="showCreateText || editingText" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-full max-w-2xl">
        <h2 class="text-xl font-bold mb-4">
          {{editingText ? 'Edit Text' : 'Create New Text'}}
        </h2>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">Title</label>
          <input type="text" [(ngModel)]="currentText.title"
                 class="w-full px-3 py-2 border rounded">
        </div>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">Content</label>
          <textarea [(ngModel)]="currentText.content"
                   rows="10"
                   class="w-full px-3 py-2 border rounded"></textarea>
        </div>
        <div class="flex justify-end gap-2">
          <button (click)="cancelTextEdit()"
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

    <!-- Upload File Modal -->
    <div *ngIf="showUploadFile" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-96">
        <h2 class="text-xl font-bold mb-4">Upload Document</h2>
        <div class="mb-4">
          <input type="file" 
                 (change)="onFileSelected($event)"
                 accept=".pdf,.doc,.docx,.txt"
                 class="w-full">
        </div>
        <div class="flex justify-end gap-2">
          <button (click)="showUploadFile = false"
                  class="px-4 py-2 border rounded">
            Cancel
          </button>
          <button (click)="uploadFile()"
                  [disabled]="!selectedFile"
                  class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400">
            Upload
          </button>
        </div>
      </div>
    </div>

    <!-- PDF Viewer Modal -->
    <div *ngIf="showPdfViewer" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-full max-w-4xl h-[90vh] flex flex-col">
        <div class="flex justify-between items-center mb-4">
          <div>
            <h2 class="text-xl font-bold">{{viewingDocument?.name}}</h2>
            <p class="text-sm text-gray-500">{{pdfUrl}}</p>
          </div>
          <div class="flex items-center gap-2">
            <a [href]="pdfUrl" 
               target="_blank" 
               class="text-blue-500 hover:text-blue-700">
              Open in New Tab
            </a>
            <button (click)="showPdfViewer = false"
                    class="text-gray-500 hover:text-gray-700">
              Close
            </button>
          </div>
        </div>
        <div class="flex-1 bg-gray-100 relative">
          <iframe [src]="pdfUrl | safeUrl" 
                  class="w-full h-full"
                  *ngIf="pdfUrl"
                  (error)="handlePdfError($event)"
                  type="application/pdf"></iframe>
          <div *ngIf="!pdfUrl" class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <p class="text-gray-500 mb-2">Unable to load PDF file.</p>
              <p class="text-sm text-gray-400">Try opening the file in a new tab.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class ProjectListComponent implements OnInit {
  projects: Project[] = [];
  projectsWithStats: ProjectWithStats[] = [];
  showCreateProject = false;
  newProject = { name: '', description: '' };

  selectedProject: Project | null = null;
  projectTexts: UserText[] = [];
  showCreateText = false;
  editingText: UserText | null = null;
  currentText = { title: '', content: '' };

  projectDocuments: Document[] = [];
  showUploadFile = false;
  selectedFile: File | null = null;

  showPdfViewer = false;
  viewingDocument: Document | null = null;
  pdfUrl: string = '';

  activeTab = 'chat';
  question = '';
  answer = '';
  selectedItems: number[] = [];

  selectedDocument: Document | null = null;
  selectedText: UserText | null = null;

  constructor(
    private projectService: ProjectService,
    private textService: TextService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.projectService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
        this.loadProjectStats();
      },
      error: (error) => {
        if (error.status === 401) {
          this.router.navigate(['/login']);
        } else {
          console.error('Error loading projects:', error);
        }
      }
    });
  }

  loadProjectStats(): void {
    this.projectsWithStats = [];
    this.projects.forEach(project => {
      this.projectService.getDocuments(project.id).subscribe({
        next: (documents) => {
          this.projectsWithStats.push({
            ...project,
            documentCount: documents.length
          });
        },
        error: (error) => {
          console.error(`Error loading documents for project ${project.id}:`, error);
          this.projectsWithStats.push({
            ...project,
            documentCount: 0
          });
        }
      });
    });
  }

  selectProject(project: Project): void {
    this.selectedProject = project;
    this.selectedDocument = null;
    this.selectedText = null;
    this.selectedItems = [];
    this.question = '';
    this.answer = '';
    this.loadProjectContent();
  }

  loadProjectContent(): void {
    if (!this.selectedProject) return;

    this.textService.getTexts(this.selectedProject.id).subscribe({
      next: (texts) => {
        this.projectTexts = texts;
      },
      error: (error) => {
        console.error('Error loading texts:', error);
      }
    });

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

  viewDocument(doc: Document): void {
    this.viewingDocument = doc;
    const baseUrl = 'http://localhost:8000';
    const filePath = doc.file_path.startsWith('/') ? doc.file_path : `/${doc.file_path}`;
    this.pdfUrl = `${baseUrl}${filePath}`;
    this.showPdfViewer = true;
    
    console.log('Opening PDF URL:', this.pdfUrl);
    
    fetch(this.pdfUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log('PDF is accessible');
      })
      .catch(error => {
        console.error('Error accessing PDF:', error);
        this.handlePdfError(error);
      });
  }

  deleteDocument(id: number): void {
    // Implement document deletion
  }

  askQuestion(): void {
    if (!this.selectedProject || !this.question) return;

    this.projectService.askQuestion(
      this.selectedProject.id,
      this.question,
      this.selectedItems
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

  toggleItem(item: Document | UserText, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      // اگر کلید Ctrl یا Command (در مک) نگه داشته شده، برای چت انتخاب می‌کنیم
      const itemId = item.id;
      const index = this.selectedItems.indexOf(itemId);
      if (index === -1) {
        this.selectedItems.push(itemId);
      } else {
        this.selectedItems.splice(index, 1);
      }
    } else {
      // کلیک عادی برای نمایش/ویرایش
      if (this.isDocument(item)) {
        this.toggleDocument(item);
      } else {
        this.toggleText(item);
      }
    }
  }

  handlePdfError(event: any): void {
    console.error('Error loading PDF:', event);
    this.pdfUrl = '';
    alert('Unable to load the PDF file. Please make sure the file exists and is accessible.');
  }

  toggleDocument(doc: Document): void {
    if (this.selectedDocument?.id === doc.id) {
      this.selectedDocument = null;
    } else {
      this.selectedDocument = doc;
      this.selectedText = null;
    }
  }

  toggleText(text: UserText): void {
    if (this.selectedText?.id === text.id) {
      this.selectedText = null;
    } else {
      this.selectedText = text;
      this.selectedDocument = null;
    }
  }

  deselectProject(): void {
    this.selectedProject = null;
    this.selectedDocument = null;
    this.selectedText = null;
    this.selectedItems = [];
    this.question = '';
    this.answer = '';
  }

  isDocument(item: Document | UserText): item is Document {
    return 'file_path' in item;
  }

  isUserText(item: Document | UserText): item is UserText {
    return 'content' in item;
  }

  getItemName(item: Document | UserText): string {
    if (this.isDocument(item)) {
      return item.name;
    } else {
      return item.title;
    }
  }

  getItemIcon(item: Document | UserText): string {
    if (this.isDocument(item)) {
      if (item.name.toLowerCase().endsWith('.pdf')) {
        return 'pi pi-file-pdf';
      }
      return 'pi pi-file';
    }
    return 'pi pi-file-edit';
  }

  isItemSelected(item: Document | UserText): boolean {
    if (this.isDocument(item)) {
      return this.selectedDocument?.id === item.id;
    }
    return this.selectedText?.id === item.id;
  }

  getAllItems(): (Document | UserText)[] {
    return [...this.projectDocuments, ...this.projectTexts];
  }

  trackByProjectId(index: number, project: Project): number {
    return project.id;
  }

  isProjectSelected(project: Project): boolean {
    return this.selectedProject !== null && this.selectedProject.id === project.id;
  }

  getItemNameById(id: number): string {
    const item = this.getAllItems().find(i => this.isDocument(i) ? i.id === id : i.id === id);
    return item ? this.getItemName(item) : '';
  }

  removeFromSelection(id: number): void {
    const index = this.selectedItems.indexOf(id);
    if (index !== -1) {
      this.selectedItems.splice(index, 1);
    }
  }
} 