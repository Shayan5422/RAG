import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService, Project, Document } from '../../services/project.service';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto px-4 py-8" *ngIf="project">
      <!-- Project Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold mb-2">{{project.name}}</h1>
          <p class="text-gray-600">{{project.description}}</p>
        </div>
        <button (click)="router.navigate(['/projects'])" 
                class="text-gray-600 hover:text-gray-900">
          ← Back to Projects
        </button>
      </div>

      <!-- Document Upload Section -->
      <div class="bg-white rounded-lg shadow-sm mb-8">
        <div class="p-6">
          <h2 class="text-xl font-bold mb-4">Upload Documents</h2>
          <div class="flex items-center gap-4">
            <input type="file" 
                   (change)="onFileSelected($event)" 
                   accept=".pdf,.doc,.docx,.txt"
                   class="border p-2 rounded flex-grow">
            <button (click)="uploadDocument()" 
                    [disabled]="!selectedFile"
                    class="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 whitespace-nowrap">
              Upload Document
            </button>
          </div>
          <p class="text-sm text-gray-500 mt-2">
            Supported formats: PDF, DOC, DOCX, TXT
          </p>
        </div>
      </div>

      <!-- Documents List -->
      <div class="bg-white rounded-lg shadow-sm mb-8">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold">Project Documents</h2>
            <span class="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded">
              {{documents.length}} Documents
            </span>
          </div>
          
          <div class="mb-4" *ngIf="documents.length > 0">
            <div class="flex justify-between items-center mb-2">
              <span class="text-sm text-gray-600">Select documents to ask questions about:</span>
              <button (click)="toggleAllDocuments()" 
                      class="text-blue-600 text-sm hover:text-blue-800">
                {{allDocumentsSelected ? 'Deselect All' : 'Select All'}}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div *ngFor="let doc of documents" 
                 class="border rounded-lg p-4 transition-all duration-200"
                 [class.border-blue-500]="selectedDocuments.includes(doc.id)"
                 [class.bg-blue-50]="selectedDocuments.includes(doc.id)">
              <div class="flex justify-between items-start">
                <div class="flex-grow">
                  <h3 class="font-semibold mb-2">{{doc.name}}</h3>
                  <p class="text-sm text-gray-500">
                    Uploaded: {{doc.created_at | date:'medium'}}
                  </p>
                </div>
                <input type="checkbox" 
                       [checked]="selectedDocuments.includes(doc.id)"
                       (change)="toggleDocument(doc.id)"
                       class="ml-4 mt-1">
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div *ngIf="documents.length === 0" class="text-center py-8">
            <p class="text-gray-500">No documents uploaded yet.</p>
            <p class="text-sm text-gray-400 mt-2">Upload documents to start asking questions.</p>
          </div>
        </div>
      </div>

      <!-- Question Section -->
      <div class="bg-white rounded-lg shadow-sm mb-8">
        <div class="p-6">
          <h2 class="text-xl font-bold mb-4">Ask Questions</h2>
          <div class="mb-4">
            <textarea [(ngModel)]="question" 
                      placeholder="Type your question here..."
                      class="w-full p-4 border rounded-lg"
                      [class.border-red-300]="showError && !question"
                      rows="3"></textarea>
            <p *ngIf="showError && !question" class="text-red-500 text-sm mt-1">
              Please enter your question
            </p>
            <p *ngIf="showError && selectedDocuments.length === 0" class="text-red-500 text-sm mt-1">
              Please select at least one document
            </p>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-500">
              Selected Documents: {{selectedDocuments.length}}
            </span>
            <button (click)="askQuestion()" 
                    [disabled]="!question || selectedDocuments.length === 0"
                    class="bg-green-500 text-white px-8 py-3 rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed">
              Ask Question
            </button>
          </div>
        </div>
      </div>

      <!-- Answer Section -->
      <div *ngIf="answer" class="bg-white rounded-lg shadow-sm">
        <div class="p-6">
          <h2 class="text-xl font-bold mb-4">Answer</h2>
          <div class="bg-gray-50 rounded-lg p-4">
            <p class="whitespace-pre-wrap">{{answer}}</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class ProjectDetailComponent implements OnInit {
  project: Project | null = null;
  documents: Document[] = [];
  selectedFile: File | null = null;
  selectedDocuments: number[] = [];
  question: string = '';
  answer: string = '';
  showError: boolean = false;

  get allDocumentsSelected(): boolean {
    return this.documents.length > 0 && 
           this.selectedDocuments.length === this.documents.length;
  }

  constructor(
    private route: ActivatedRoute,
    private projectService: ProjectService,
    public router: Router
  ) { }

  ngOnInit(): void {
    const projectId = this.route.snapshot.params['id'];
    this.loadProject(projectId);
    this.loadDocuments(projectId);
  }

  loadProject(projectId: number): void {
    this.projectService.getProject(projectId).subscribe({
      next: (project) => {
        this.project = project;
      },
      error: (error) => {
        console.error('Error loading project:', error);
      }
    });
  }

  loadDocuments(projectId: number): void {
    this.projectService.getDocuments(projectId).subscribe({
      next: (documents) => {
        this.documents = documents;
      },
      error: (error) => {
        console.error('Error loading documents:', error);
      }
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  uploadDocument(): void {
    if (!this.selectedFile || !this.project) return;

    this.projectService.uploadDocument(this.project.id, this.selectedFile).subscribe({
      next: () => {
        this.selectedFile = null;
        this.loadDocuments(this.project!.id);
        // Reset file input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      },
      error: (error) => {
        console.error('Error uploading document:', error);
      }
    });
  }

  toggleDocument(documentId: number): void {
    const index = this.selectedDocuments.indexOf(documentId);
    if (index === -1) {
      this.selectedDocuments.push(documentId);
    } else {
      this.selectedDocuments.splice(index, 1);
    }
    this.showError = false;
  }

  toggleAllDocuments(): void {
    if (this.allDocumentsSelected) {
      this.selectedDocuments = [];
    } else {
      this.selectedDocuments = this.documents.map(doc => doc.id);
    }
    this.showError = false;
  }

  askQuestion(): void {
    this.showError = !this.question || this.selectedDocuments.length === 0;
    if (this.showError) return;

    if (!this.project || !this.question || this.selectedDocuments.length === 0) return;

    // Log the data being sent
    console.log('Sending question:', {
      projectId: this.project.id,
      question: this.question,
      documentIds: this.selectedDocuments
    });

    this.projectService.askQuestion(this.project.id, this.question, this.selectedDocuments)
      .subscribe({
        next: (response) => {
          console.log('Response received:', response);
          this.answer = response.answer;
          this.question = '';
        },
        error: (error) => {
          console.error('Error asking question:', error);
          console.log('Error details:', error.error);
          if (error.error?.detail) {
            this.answer = `Error: ${error.error.detail}`;
          } else {
            this.answer = 'Sorry, there was an error processing your question. Please try again.';
          }
        }
      });
  }
} 