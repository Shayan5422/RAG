import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService, Project, Document } from '../../services/project.service';
import { TextService, UserText } from '../../services/text.service';
import { SafeUrlPipe } from '../../pipes/safe-url.pipe';
import { QuillModule } from 'ngx-quill';
import 'quill/dist/quill.core.css';
import 'quill/dist/quill.snow.css';
import 'quill/dist/quill.bubble.css';
import { QUILL_CONFIG_TOKEN } from 'ngx-quill';
import { HttpClient } from '@angular/common/http';
import { QuillEditorComponent } from 'ngx-quill';
import { environment } from '../../../environments/environment';

interface ProjectWithStats extends Project {
  documentCount: number;
}

interface SharedUser {
  id: number;
  email: string;
}

interface ProjectSuggestion {
  project_id: number;
  name: string;
  description: string;
  similarity: number;
}

interface ProjectSuggestionResponse {
  suggestions: ProjectSuggestion[];
  new_project: {
    name: string;
    description: string;
  };
}

interface Folder {
  id: number;
  name: string;
  project_id: number;
  parent_folder_id: number | null;
  created_at: string;
  updated_at: string;
}

interface FolderWithItems extends Folder {
  folders: FolderWithItems[];
  documents: Document[];
  texts: UserText[];
  isExpanded?: boolean;
}

interface SelectedItem {
  id: number;
  type: 'document' | 'text';
}

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe, QuillModule],
  providers: [{
    provide: QUILL_CONFIG_TOKEN,
    useValue: {
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          ['blockquote', 'code-block'],
          [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          [{ 'indent': '-1'}, { 'indent': '+1' }],
          [{ 'direction': 'rtl' }],
          [{ 'align': [] }],
          [{ 'color': [] }, { 'background': [] }],
          ['link', 'image'],
          ['clean']
        ]
      },
      theme: 'snow'
    }
  }],
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
                <div class="flex items-center group">
                  <div (click)="selectProject(proj)"
                       class="flex-1 p-3 rounded cursor-pointer hover:bg-gray-100 flex items-center"
                       [class.bg-blue-100]="isProjectSelected(proj)">
                    <i class="pi pi-folder mr-2 text-blue-500"></i>
                    <div class="flex flex-col">
                      <span>{{proj.name}}</span>
                      <span *ngIf="proj.is_shared" class="text-xs text-gray-500">
                        Shared by: {{proj.owner?.email}}
                      </span>
                    </div>
                  </div>
                  <div class="hidden group-hover:flex items-center gap-1 px-2">
                    <button (click)="editProject(proj, $event)" 
                            class="text-gray-500 hover:text-blue-500 p-1"
                            *ngIf="proj.user_id === currentUserId">
                      <i class="pi pi-pencil"></i>
                    </button>
                    <button (click)="deleteProject(proj, $event)" 
                            class="text-gray-500 hover:text-red-500 p-1"
                            *ngIf="proj.user_id === currentUserId || proj.owner_id === currentUserId">
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
                  <button (click)="exportProjectContent(proj.id, $event)" 
                          class="text-gray-500 hover:text-green-500 p-1"
                          [disabled]="isExporting">
                    <i class="pi pi-file-export" 
                       [class.animate-pulse]="isExporting"
                       [title]="isExporting ? 'Exporting...' : 'Export to PDF'">
                    </i>
                  </button>
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
          <!-- Create Folder Button -->
          <div class="p-4 border-b">
            <button (click)="showCreateFolder = true"
                    class="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
              <i class="pi pi-folder-plus mr-2"></i>Create Folder
            </button>
          </div>

          <!-- Breadcrumb Navigation with Back and Forward -->
          <div class="p-4 border-b flex items-center gap-2 text-sm" *ngIf="currentFolder">
            <button (click)="currentFolder = null; folderBackStack = []; folderForwardStack = []" class="text-blue-500 hover:text-blue-700">
              <i class="pi pi-home"></i>
            </button>
            <button *ngIf="folderBackStack.length > 0" (click)="goBackFolder()" class="text-blue-500 hover:text-blue-700">
              <i class="pi pi-arrow-left"></i>
            </button>
            <span class="text-gray-700">{{currentFolder.name}}</span>
            <button *ngIf="folderForwardStack.length > 0" (click)="goForwardFolder()" class="text-blue-500 hover:text-blue-700">
              <i class="pi pi-arrow-right"></i>
            </button>
          </div>

          <!-- Folders and Files List -->
          <div class="p-4 space-y-2">
            <!-- Root Level Items when no folder is selected -->
            <ng-container *ngIf="!currentFolder">
              <!-- Folders -->
              <ng-container *ngFor="let folder of folderStructure">
                <div class="flex items-center group">
                  <div (click)="selectFolder(folder)"
                       class="flex-1 p-2 rounded cursor-pointer hover:bg-gray-100 flex items-center">
                    <i class="pi pi-folder mr-2 text-yellow-500"></i>
                    <span class="truncate">{{folder.name}}</span>
                  </div>
                  <div class="hidden group-hover:flex items-center gap-1">
                    <button (click)="editFolder(folder)"
                            class="text-gray-500 hover:text-blue-500 p-1">
                      <i class="pi pi-pencil"></i>
                    </button>
                    <button (click)="deleteFolder(folder)"
                            class="text-gray-500 hover:text-red-500 p-1">
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
                </div>
              </ng-container>

              <!-- Root Documents -->
              <ng-container *ngFor="let doc of projectDocuments">
                <div *ngIf="!doc.folder_id" class="flex items-center group">
                  <div (click)="toggleItem(doc, $event)"
                       class="flex-1 p-2 rounded cursor-pointer hover:bg-gray-100 flex items-center">
                    <i [class]="getItemIcon(doc)" class="mr-2 text-red-500"></i>
                    <span class="truncate">{{doc.name}}</span>
                  </div>
                  <div class="hidden group-hover:flex items-center gap-1">
                    <button (click)="deleteDocument(doc.id)"
                            class="text-gray-500 hover:text-red-500 p-1">
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
                </div>
              </ng-container>

              <!-- Root Texts -->
              <ng-container *ngFor="let text of projectTexts">
                <div *ngIf="!text.folder_id" class="flex items-center group">
                  <div (click)="toggleItem(text, $event)"
                       class="flex-1 p-2 rounded cursor-pointer hover:bg-gray-100 flex items-center">
                    <i [class]="getItemIcon(text)" class="mr-2 text-green-500"></i>
                    <span class="truncate">{{text.title}}</span>
                  </div>
                  <div class="hidden group-hover:flex items-center gap-1">
                    <button (click)="deleteText(text.id)"
                            class="text-gray-500 hover:text-red-500 p-1">
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
                </div>
              </ng-container>
            </ng-container>

            <!-- Folder Contents when a folder is selected -->
            <ng-container *ngIf="currentFolder">
              <!-- Nested Folders -->
              <ng-container *ngFor="let folder of findFolderById(currentFolder.id)?.folders">
                <div class="flex items-center group">
                  <div (click)="selectFolder(folder)"
                       class="flex-1 p-2 rounded cursor-pointer hover:bg-gray-100 flex items-center">
                    <i class="pi pi-folder mr-2 text-yellow-500"></i>
                    <span class="truncate">{{folder.name}}</span>
                  </div>
                  <div class="hidden group-hover:flex items-center gap-1">
                    <button (click)="editFolder(folder)"
                            class="text-gray-500 hover:text-blue-500 p-1">
                      <i class="pi pi-pencil"></i>
                    </button>
                    <button (click)="deleteFolder(folder)"
                            class="text-gray-500 hover:text-red-500 p-1">
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
                </div>
              </ng-container>

              <!-- Folder Documents -->
              <ng-container *ngFor="let doc of findFolderById(currentFolder.id)?.documents">
                <div class="flex items-center group">
                  <div (click)="toggleItem(doc, $event)"
                       class="flex-1 p-2 rounded cursor-pointer hover:bg-gray-100 flex items-center">
                    <i [class]="getItemIcon(doc)" class="mr-2 text-red-500"></i>
                    <span class="truncate">{{doc.name}}</span>
                  </div>
                  <div class="hidden group-hover:flex items-center gap-1">
                    <button (click)="deleteDocument(doc.id)"
                            class="text-gray-500 hover:text-red-500 p-1">
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
                </div>
              </ng-container>

              <!-- Folder Texts -->
              <ng-container *ngFor="let text of findFolderById(currentFolder.id)?.texts">
                <div class="flex items-center group">
                  <div (click)="toggleItem(text, $event)"
                       class="flex-1 p-2 rounded cursor-pointer hover:bg-gray-100 flex items-center">
                    <i [class]="getItemIcon(text)" class="mr-2 text-green-500"></i>
                    <span class="truncate">{{text.title}}</span>
                  </div>
                  <div class="hidden group-hover:flex items-center gap-1">
                    <button (click)="deleteText(text.id)"
                            class="text-gray-500 hover:text-red-500 p-1">
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
                </div>
              </ng-container>
            </ng-container>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="p-4 border-t flex-shrink-0" *ngIf="selectedProject">
          <div class="grid grid-cols-3 gap-2">
            <button (click)="createText()"
                    class="bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 flex items-center justify-center group relative">
              <i class="pi pi-file-edit"></i>
              <span class="absolute bottom-full mb-2 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                New Text
              </span>
            </button>
            <button (click)="showUploadFile = true"
                    class="bg-purple-500 text-white p-3 rounded-lg hover:bg-purple-600 flex items-center justify-center group relative">
              <i class="pi pi-upload"></i>
              <span class="absolute bottom-full mb-2 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Upload File
              </span>
            </button>
            <button (click)="isSummarizing ? cancelSummarize() : summarizeContent()"
                    [class.bg-red-500]="isSummarizing"
                    [class.hover:bg-red-600]="isSummarizing"
                    [class.bg-orange-500]="!isSummarizing"
                    [class.hover:bg-orange-600]="!isSummarizing"
                    class="text-white p-3 rounded-lg flex items-center justify-center group relative">
              <i class="pi" [ngClass]="{'pi-times': isSummarizing, 'pi-comment': !isSummarizing}"></i>
              <span class="absolute bottom-full mb-2 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {{isSummarizing ? 'Cancel Summarization' : 'Summarize Content'}}
              </span>
            </button>
          </div>
          <div *ngIf="summarizeStatus" class="mt-2 text-sm" [ngClass]="{
            'text-blue-600': summarizeStatus.includes('Processing'),
            'text-green-600': summarizeStatus.includes('Completed'),
            'text-red-600': summarizeStatus.includes('Error') || summarizeStatus.includes('cancelled')
          }">
            {{ summarizeStatus }}
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 p-6 overflow-y-auto">
        <ng-container *ngIf="!selectedProject">
          <!-- New Text Creation Section -->
          <div *ngIf="showNewTextCreation" class="bg-white rounded-lg shadow-sm mb-6">
            <div class="flex justify-between items-center p-4 bg-white border-b">
              <div class="flex flex-col flex-grow">
                <input [(ngModel)]="newTextContent.title" 
                       placeholder="Enter title..."
                       class="text-2xl font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 w-full mr-4">
              </div>
              <div class="flex items-center gap-4">
                <div class="flex items-center gap-2">
                  <div class="flex items-center min-w-[100px] justify-end">
                    <span *ngIf="isRecording" class="text-red-500 animate-pulse">
                      Recording...
                    </span>
                    <span *ngIf="isTranscribing" class="text-blue-500 animate-pulse">
                      Transcribing...
                    </span>
                  </div>
                  <button (click)="toggleRecording()"
                          [class.bg-red-500]="isRecording"
                          [class.hover:bg-red-600]="isRecording"
                          [class.bg-blue-500]="!isRecording"
                          [class.hover:bg-blue-600]="!isRecording"
                          class="text-white px-4 py-2 rounded-lg flex items-center gap-2">
                    <i [class.pi-microphone]="!isRecording"
                       [class.pi-stop-circle]="isRecording"
                       class="pi"></i>
                    {{isRecording ? 'Stop Recording' : 'Record Audio'}}
                  </button>
                </div>
              </div>
            </div>
            <div class="relative">
              <quill-editor [(ngModel)]="newTextContent.content"
                            #newTextEditor
                            [styles]="{height: '400px'}"
                            [readOnly]="isTranscribing"
                            placeholder="Start writing or recording..."
                            class="editor-container">
              </quill-editor>
            </div>
            <div class="p-4 border-t flex justify-between items-center">
              <button (click)="cancelNewText()"
                      class="px-4 py-2 text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <div class="flex items-center gap-2">
                <button (click)="suggestProjectForText()"
                        [disabled]="!newTextContent.content || isProcessingAISuggestion"
                        class="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 disabled:bg-gray-400 flex items-center gap-2">
                  <i class="pi pi-brain"></i>
                  {{isProcessingAISuggestion ? 'Analyzing...' : 'Suggest Project'}}
                </button>
                <button (click)="saveNewText()"
                        [disabled]="!newTextContent.content"
                        class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400">
                  Save Text
                </button>
              </div>
            </div>
          </div>

          <!-- Create Text Button -->
          <div *ngIf="!showNewTextCreation" class="text-center py-12">
            <button (click)="showNewTextCreation = true"
                    class="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 flex items-center gap-2 mx-auto">
              <i class="pi pi-plus"></i>
              Create New Text
            </button>
          </div>
        </ng-container>

        <!-- Existing Project Content -->
        <ng-container *ngIf="selectedProject">
          <!-- Project Header -->
          <div class="mb-6">
            <div class="flex justify-between items-start">
              <div>
                <h2 class="text-2xl font-bold">{{selectedProject.name}}</h2>
                <p class="text-gray-600">{{selectedProject.description}}</p>
              </div>
              <button (click)="showShareProject = true"
                      class="bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 flex items-center justify-center group relative">
                <i class="pi pi-share-alt text-xl"></i>
                <span class="absolute bottom-full mb-2 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Share Project
                </span>
              </button>
            </div>
          </div>

          <!-- Content Area -->
          <ng-container *ngIf="selectedProject">
            <!-- Document Viewer -->
            <div *ngIf="selectedDocument" class="bg-white rounded-lg shadow-sm h-[calc(100vh-8rem)] flex flex-col">
              <div class="flex justify-between items-center p-4 bg-white border-b">
                <h3 class="text-xl font-bold">{{selectedDocument.name}}</h3>
                <div class="space-x-2">
                  <a [href]="getPdfUrl(selectedDocument)" 
                     target="_blank" 
                     class="text-blue-500 hover:text-blue-700">
                    <i class="pi pi-external-link mr-1"></i>
                    Open in New Tab
                  </a>
                  <button (click)="deleteDocument(selectedDocument.id)"
                          class="text-red-500 hover:text-red-700 px-4 py-2 rounded-lg border border-red-200 hover:bg-red-50">
                    <i class="pi pi-trash mr-1"></i>
                    Delete
                  </button>
                </div>
              </div>
              <div class="flex-1 bg-gray-100">
                <iframe [src]="getPdfUrl(selectedDocument) | safeUrl" 
                       class="w-full h-full"
                       type="application/pdf"></iframe>
              </div>
            </div>

            <!-- Text Viewer with professional rich text editor -->
            <div *ngIf="selectedText" class="bg-white rounded-lg shadow-sm h-[calc(100vh-8rem)] flex flex-col">
              <div class="flex justify-between items-center p-4 bg-white border-b">
                <div class="flex flex-col flex-grow">
                  <input [(ngModel)]="selectedText.title" 
                         (ngModelChange)="autoSaveText()"
                         class="text-2xl font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 w-full mr-4"
                         [class.border-gray-300]="selectedText.title === ''">
                  <span *ngIf="selectedText.is_shared" class="text-sm text-gray-500 mt-1">
                    Shared by: {{selectedText.owner?.email}}
                  </span>
                </div>
                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-2">
                    <div class="flex items-center min-w-[100px] justify-end">
                      <span *ngIf="isRecording" class="text-red-500 animate-pulse">
                        Recording...
                      </span>
                      <span *ngIf="isTranscribing" class="text-blue-500 animate-pulse">
                        Transcribing...
                      </span>
                    </div>
                    <button (click)="toggleRecording()"
                            [class.bg-red-500]="isRecording"
                            [class.hover:bg-red-600]="isRecording"
                            [class.bg-blue-500]="!isRecording"
                            [class.hover:bg-blue-600]="!isRecording"
                            class="text-white px-4 py-2 rounded-lg flex items-center gap-2">
                      <i [class.pi-microphone]="!isRecording"
                         [class.pi-stop-circle]="isRecording"
                         class="pi"></i>
                      {{isRecording ? 'Stop Recording' : 'Record Audio'}}
                    </button>
                  </div>
                  <div class="flex items-center gap-2 border-l pl-4">
                    <button (click)="showShareText = true"
                            class="text-blue-500 hover:text-blue-700 px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-50">
                      <i class="pi pi-share-alt mr-1"></i>
                      Share
                    </button>
                    <button (click)="deleteText(selectedText.id)"
                            class="text-red-500 hover:text-red-700 px-4 py-2 rounded-lg border border-red-200 hover:bg-red-50">
                      <i class="pi pi-trash mr-1"></i>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
              <div class="flex-1 relative">
                <quill-editor [(ngModel)]="selectedText.content"
                              (ngModelChange)="autoSaveText()"
                              [styles]="{height: '100%'}"
                              [readOnly]="isTranscribing"
                              class="h-full editor-container">
                </quill-editor>
                <div *ngIf="isTranscribing" 
                     class="absolute inset-0 bg-black bg-opacity-10 flex items-center justify-center">
                  <div class="bg-white p-4 rounded-lg shadow-lg">
                    <i class="pi pi-spin pi-spinner text-2xl text-blue-500 mr-2"></i>
                    Transcribing audio...
                  </div>
                </div>
              </div>
            </div>

            <!-- Chat Interface -->
            <div *ngIf="!selectedDocument && !selectedText" class="bg-white rounded-lg shadow-sm p-6">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold">Chat</h3>
                <div class="text-sm text-gray-500">
                  <span *ngIf="currentFolder">
                    Asking about folder: {{currentFolder.name}}
                  </span>
                  <span *ngIf="!currentFolder">
                    Asking about project: {{selectedProject.name}}
                  </span>
                </div>
              </div>

              <div class="mb-4">
                <textarea [(ngModel)]="question"
                         placeholder="Ask a question about the current context..."
                         rows="3"
                         class="w-full p-3 border rounded-lg"></textarea>
              </div>
              
              <div class="flex justify-end">
                <button (click)="askQuestion()"
                        [disabled]="!question"
                        class="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400">
                  Ask
                </button>
              </div>

              <div *ngIf="answer" class="mt-4 p-4 bg-gray-50 rounded-lg">
                <p class="whitespace-pre-wrap">{{answer}}</p>
              </div>
            </div>
          </ng-container>
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
    <div *ngIf="showCreateText || editingText"></div>

    <!-- Upload File Modal -->
    <div *ngIf="showUploadFile" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-[500px] max-w-full mx-4">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-bold">Upload Document</h2>
          <button (click)="showUploadFile = false" class="text-gray-500 hover:text-gray-700">
            <i class="pi pi-times"></i>
          </button>
        </div>

        <!-- Drag & Drop Area -->
        <div
          class="border-2 border-dashed rounded-lg p-8 mb-6 text-center transition-all duration-200"
          [class.border-blue-400]="!isDragging"
          [class.border-blue-600]="isDragging"
          [class.bg-blue-50]="isDragging"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)">
          
          <div class="flex flex-col items-center justify-center space-y-4">
            <i class="pi pi-cloud-upload text-4xl" [class.text-blue-400]="!isDragging" [class.text-blue-600]="isDragging"></i>
            
            <div class="text-gray-600">
              <p class="text-lg mb-2">Drag & drop your file here</p>
              <p class="text-sm">or</p>
            </div>

            <label class="cursor-pointer bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors">
              Browse Files
              <input type="file" 
                     (change)="onFileSelected($event)"
                     accept=".pdf,.doc,.docx,.txt"
                     class="hidden">
            </label>

            <p class="text-sm text-gray-500">
              Supported files: PDF, DOC, DOCX, TXT (max 50MB)
            </p>
          </div>
        </div>

        <!-- Selected File Preview -->
        <div *ngIf="selectedFile" class="mb-6 p-4 bg-gray-50 rounded-lg">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <i class="pi" [class.pi-file-pdf]="selectedFile.name.toLowerCase().endsWith('.pdf')"
                         [class.pi-file-word]="selectedFile.name.toLowerCase().endsWith('.doc') || selectedFile.name.toLowerCase().endsWith('.docx')"
                         [class.pi-file-text]="selectedFile.name.toLowerCase().endsWith('.txt')"></i>
              <div>
                <p class="font-medium truncate">{{selectedFile.name}}</p>
                <p class="text-sm text-gray-500">{{(selectedFile.size / 1024 / 1024).toFixed(2)}} MB</p>
              </div>
            </div>
            <button (click)="selectedFile = null" class="text-red-500 hover:text-red-700">
              <i class="pi pi-times"></i>
            </button>
          </div>
        </div>

        <!-- Error Message -->
        <div *ngIf="uploadError" class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <div class="flex items-center space-x-2">
            <i class="pi pi-exclamation-circle"></i>
            <p>{{uploadError}}</p>
          </div>
        </div>

        <!-- Upload Progress -->
        <div *ngIf="uploadProgress > 0 && uploadProgress < 100" class="mb-6">
          <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full bg-blue-500 transition-all duration-300"
                 [style.width.%]="uploadProgress"></div>
          </div>
          <p class="text-sm text-gray-600 mt-2 text-center">Uploading... {{uploadProgress}}%</p>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-end gap-2">
          <button (click)="showUploadFile = false"
                  class="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button (click)="uploadFile()"
                  [disabled]="!selectedFile || uploadProgress > 0"
                  class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2">
            <i class="pi pi-upload"></i>
            <span>Upload</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Share Project Modal -->
    <div *ngIf="showShareProject" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-[500px]">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Share Project</h2>
          <button (click)="showShareProject = false" class="text-gray-500 hover:text-gray-700">
            <i class="pi pi-times"></i>
          </button>
        </div>
        
        <div class="mb-6">
          <div class="flex gap-2 mb-4">
            <input type="email" [(ngModel)]="shareEmail" 
                   placeholder="Enter email address"
                   class="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500">
            <button (click)="shareProjectWithUser()"
                    [disabled]="!shareEmail"
                    class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400">
              Share
            </button>
          </div>
          
          <div class="space-y-2" *ngIf="projectSharedUsers.length > 0">
            <h3 class="font-semibold text-gray-700">Shared with:</h3>
            <div *ngFor="let user of projectSharedUsers" 
                 class="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span>{{user.email}}</span>
              <button (click)="removeProjectAccess(user.id)"
                      class="text-red-500 hover:text-red-700">
                <i class="pi pi-times"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Share Text Modal -->
    <div *ngIf="showShareText" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-[500px]">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Share Text</h2>
          <button (click)="showShareText = false" class="text-gray-500 hover:text-gray-700">
            <i class="pi pi-times"></i>
          </button>
        </div>
        
        <div class="mb-6">
          <div class="flex gap-2 mb-4">
            <input type="email" [(ngModel)]="shareEmail" 
                   placeholder="Enter email address"
                   class="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500">
            <button (click)="shareTextWithUser()"
                    [disabled]="!shareEmail"
                    class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400">
              Share
            </button>
          </div>
          
          <div class="space-y-2" *ngIf="textSharedUsers.length > 0">
            <h3 class="font-semibold text-gray-700">Shared with:</h3>
            <div *ngFor="let user of textSharedUsers" 
                 class="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span>{{user.email}}</span>
              <button (click)="removeTextAccess(user.id)"
                      class="text-red-500 hover:text-red-700">
                <i class="pi pi-times"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Project Modal -->
    <div *ngIf="showEditProject" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-96">
        <h2 class="text-xl font-bold mb-4">Edit Project</h2>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">Project Name</label>
          <input type="text" [(ngModel)]="editingProject.name"
                 class="w-full px-3 py-2 border rounded">
        </div>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">Description</label>
          <textarea [(ngModel)]="editingProject.description"
                   rows="3"
                   class="w-full px-3 py-2 border rounded"></textarea>
        </div>
        <div class="flex justify-end gap-2">
          <button (click)="cancelProjectEdit()"
                  class="px-4 py-2 border rounded">
            Cancel
          </button>
          <button (click)="saveProjectEdit()"
                  class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            Save
          </button>
        </div>
      </div>
    </div>

    <!-- Project Suggestions Modal -->
    <div *ngIf="showProjectSuggestions" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Project Suggestions</h2>
          <button (click)="showProjectSuggestions = false" class="text-gray-500 hover:text-gray-700">
            <i class="pi pi-times"></i>
          </button>
        </div>

        <!-- Existing Projects Suggestions -->
        <div class="mb-6" *ngIf="projectSuggestions.length > 0">
          <h3 class="font-semibold text-gray-700 mb-3">Similar Projects Found:</h3>
          <div class="space-y-3">
            <div *ngFor="let suggestion of projectSuggestions" 
                 class="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <h4 class="font-medium text-gray-900">{{suggestion.name}}</h4>
                  <p class="text-sm text-gray-600">{{suggestion.description}}</p>
                </div>
                <span class="text-sm font-medium text-blue-600">
                  {{(suggestion.similarity * 100).toFixed(1)}}% match
                </span>
              </div>
              <button (click)="selectSuggestedProject(suggestion)"
                      class="mt-2 w-full text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                Add to this project
              </button>
            </div>
          </div>
        </div>

        <!-- New Project Suggestion -->
        <div *ngIf="suggestedNewProject" class="border-t pt-6">
          <h3 class="font-semibold text-gray-700 mb-3">Create New Project:</h3>
          <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 class="font-medium text-gray-900 mb-2">{{suggestedNewProject.name}}</h4>
            <p class="text-sm text-gray-600 mb-3">{{suggestedNewProject.description}}</p>
            <button (click)="createSuggestedProject()"
                    class="w-full bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg">
              Create New Project
            </button>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button (click)="showProjectSuggestions = false"
                  class="text-gray-600 hover:text-gray-800 px-4 py-2">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Create Folder Modal -->
    <div *ngIf="showCreateFolder" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-96">
        <h2 class="text-xl font-bold mb-4">Create New Folder</h2>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">Folder Name</label>
          <input type="text" [(ngModel)]="newFolder.name"
                 class="w-full px-3 py-2 border rounded">
        </div>
        <div class="mb-4" *ngIf="flattenedFolders.length > 0">
          <label class="block text-gray-700 text-sm font-bold mb-2">Parent Folder (Optional)</label>
          <select [(ngModel)]="newFolder.parent_folder_id"
                  class="w-full px-3 py-2 border rounded">
            <option [ngValue]="null">None (Root Level)</option>
            <option *ngFor="let folder of folderStructure" [value]="folder.id">
              {{folder.name}}
            </option>
          </select>
        </div>
        <div class="flex justify-end gap-2">
          <button (click)="showCreateFolder = false"
                  class="px-4 py-2 border rounded">
            Cancel
          </button>
          <button (click)="createFolder()"
                  [disabled]="!newFolder.name"
                  class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400">
            Create
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Folder Modal -->
    <div *ngIf="showEditFolder" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div class="bg-white rounded-lg p-6 w-96">
        <h2 class="text-xl font-bold mb-4">Edit Folder</h2>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">Folder Name</label>
          <input type="text" [(ngModel)]="editingFolder.name"
                 class="w-full px-3 py-2 border rounded">
        </div>
        <div class="mb-4" *ngIf="folderStructure.length > 0">
          <label class="block text-gray-700 text-sm font-bold mb-2">Parent Folder (Optional)</label>
          <select [(ngModel)]="editingFolder.parent_folder_id"
                  class="w-full px-3 py-2 border rounded">
            <option [ngValue]="null">None (Root Level)</option>
            <option *ngFor="let folder of folderStructure" 
                    [value]="folder.id"
                    [disabled]="isEditingFolderDisabled(folder.id)">
              {{folder.name}}
            </option>
          </select>
        </div>
        <div class="flex justify-end gap-2">
          <button (click)="showEditFolder = false"
                  class="px-4 py-2 border rounded">
            Cancel
          </button>
          <button (click)="saveEditedFolder()"
                  [disabled]="!editingFolder.name"
                  class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400">
            Save
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host ::ng-deep .editor-container {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .ql-container {
      font-size: 1.1rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .ql-toolbar {
      border: none;
      padding: 12px;
      background: white;
      border-bottom: 1px solid #e2e8f0;
    }

    :host ::ng-deep .ql-editor {
      flex: 1;
      padding: 2rem;
      font-size: 1.1rem;
      line-height: 1.6;
      background: white;
    }

    :host ::ng-deep .ql-editor p {
      margin-bottom: 1rem;
    }

    :host ::ng-deep .ql-snow .ql-toolbar button,
    :host ::ng-deep .ql-snow .ql-picker {
      height: 24px;
    }

    :host ::ng-deep .ql-snow .ql-toolbar button:hover,
    :host ::ng-deep .ql-snow .ql-toolbar button.ql-active {
      color: #3b82f6;
    }

    :host ::ng-deep .ql-snow .ql-toolbar button:hover .ql-stroke,
    :host ::ng-deep .ql-snow .ql-toolbar button.ql-active .ql-stroke {
      stroke: #3b82f6;
    }

    :host ::ng-deep .ql-snow .ql-toolbar button:hover .ql-fill,
    :host ::ng-deep .ql-snow .ql-toolbar button.ql-active .ql-fill {
      fill: #3b82f6;
    }

    :host ::ng-deep .ql-container.ql-snow {
      border: none;
      height: 100%;
    }
  `]
})
export class ProjectListComponent implements OnInit {
  @ViewChild(QuillEditorComponent) editor!: QuillEditorComponent;
  @ViewChild('newTextEditor') newTextEditor!: QuillEditorComponent;
  projects: Project[] = [];
  projectsWithStats: ProjectWithStats[] = [];
  showCreateProject = false;
  newProject = { name: '', description: '' };

  selectedItems: SelectedItem[] = [];
  selectedProject: Project | null = null;
  projectTexts: UserText[] = [];
  showCreateText = false;
  editingText: UserText | null = null;
  currentText = { title: '', content: '' };

  projectDocuments: Document[] = [];
  showUploadFile = false;
  selectedFile: File | null = null;

  activeTab = 'chat';
  question = '';
  answer = '';

  selectedDocument: Document | null = null;
  selectedText: UserText | null = null;

  showShareProject = false;
  showShareText = false;
  shareEmail = '';
  projectSharedUsers: SharedUser[] = [];
  textSharedUsers: SharedUser[] = [];

  autoSaveTimeout: any;

  isRecording = false;
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];

  isTranscribing = false;

  showEditProject = false;
  editingProject: Project = {
    id: 0,
    name: '',
    description: '',
    created_at: '',
    updated_at: '',
    user_id: 0,
    owner_id: 0
  };

  currentUserId: number = 0;

  showNewTextCreation = false;
  newTextContent = {
    title: '',
    content: ''
  };
  isProcessingAISuggestion = false;

  projectSuggestions: ProjectSuggestion[] = [];
  showProjectSuggestions = false;
  suggestedNewProject: { name: string; description: string } | null = null;

  // Folder-related properties
  currentFolder: Folder | null = null;
  folderStructure: FolderWithItems[] = [];
  showCreateFolder = false;
  newFolder = { name: '', parent_folder_id: null as number | null };
  showEditFolder = false;
  editingFolder: Folder = {
    id: 0,
    name: '',
    project_id: 0,
    parent_folder_id: null,
    created_at: '',
    updated_at: ''
  };

  // File upload properties
  isDragging = false;
  uploadProgress = 0;
  uploadError: string | null = null;
  allowedFileTypes = ['.pdf', '.doc', '.docx', '.txt'];

  // Add these properties to the component class
  isSummarizing: boolean = false;
  summarizeStatus: string = '';
  currentSummarizeTaskId: string | null = null;
  statusCheckInterval: any;

  private apiUrl = environment.apiUrl;
  isExporting = false;

  // Getter to provide a flattened list of folders with indentation level
  get flattenedFolders(): { folder: FolderWithItems, level: number }[] {
    const result: { folder: FolderWithItems, level: number }[] = [];
    const traverse = (folders: FolderWithItems[], level: number) => {
      for (const folder of folders) {
        result.push({ folder, level });
        if (folder.folders && folder.folders.length > 0) {
          traverse(folder.folders, level + 1);
        }
      }
    };
    traverse(this.folderStructure, 0);
    return result;
  }

  // Added folder navigation properties and methods
  folderBackStack: Folder[] = [];
  folderForwardStack: Folder[] = [];

  constructor(
    private projectService: ProjectService,
    private textService: TextService,
    private router: Router,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadProjects();
  }

  loadCurrentUser(): void {
    this.http.get<any>(`${this.apiUrl}/me`).subscribe({
      next: (user) => {
        this.currentUserId = user.id;
      },
      error: (error) => {
        console.error('Error loading current user:', error);
        if (error.status === 401) {
          this.router.navigate(['/login']);
        }
      }
    });
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
    this.question = '';
    this.answer = '';
    this.loadProjectContent();
    this.loadProjectSharedUsers();
  }

  loadProjectContent(): void {
    if (!this.selectedProject) return;

    this.textService.getTexts(this.selectedProject.id).subscribe({
      next: (texts) => {
        this.projectTexts = texts;
        this.organizeFolderContents();
      },
      error: (error) => {
        console.error('Error loading texts:', error);
      }
    });

    this.projectService.getDocuments(this.selectedProject.id).subscribe({
      next: (documents) => {
        this.projectDocuments = documents;
        this.organizeFolderContents();
      },
      error: (error) => {
        console.error('Error loading documents:', error);
      }
    });

    this.loadFolderStructure();
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

  createText(): void {
    if (!this.selectedProject) return;

    this.textService.createText(
      'Untitled',
      ' ',
      [this.selectedProject.id],
      this.currentFolder?.id
    ).subscribe({
      next: (newText) => {
        this.refreshProjectContent();
        // Select the newly created text after refresh
        setTimeout(() => {
          const text = this.projectTexts.find(t => t.id === newText.id);
          if (text) {
            this.selectedText = text;
            this.selectedDocument = null;
            this.loadTextSharedUsers();
          }
        }, 100);
      },
      error: (error) => {
        console.error('Error creating text:', error);
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
          if (this.selectedText?.id === id) {
            this.selectedText = null;
          }
          this.refreshProjectContent();
        },
        error: (error) => {
          console.error('Error deleting text:', error);
        }
      });
    }
  }

  onFileSelected(event: any): void {
    const files = event.target.files;
    if (files.length > 0) {
      this.handleFileSelection(files[0]);
    }
  }

  handleFileSelection(file: File): void {
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!this.allowedFileTypes.includes(fileExtension)) {
      this.uploadError = `Invalid file type. Allowed types: ${this.allowedFileTypes.join(', ')}`;
      this.selectedFile = null;
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      this.uploadError = 'File size must be less than 50MB';
      this.selectedFile = null;
      return;
    }

    this.selectedFile = file;
    this.uploadError = null;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFileSelection(files[0]);
    }
  }

  uploadFile(): void {
    if (!this.selectedFile || !this.selectedProject) return;

    const formData = new FormData();
    formData.append('file', this.selectedFile);
    if (this.currentFolder) {
      formData.append('folder_id', this.currentFolder.id.toString());
    }

    // Reset progress and error
    this.uploadProgress = 0;
    this.uploadError = null;

    // Create HTTP request with progress tracking
    const upload$ = this.projectService.uploadDocument(
      this.selectedProject.id,
      this.selectedFile,
      this.currentFolder?.id
    );

    // Subscribe to the upload
    upload$.subscribe({
      next: () => {
        this.showUploadFile = false;
        this.selectedFile = null;
        this.uploadProgress = 0;
        this.refreshProjectContent();
      },
      error: (error) => {
        console.error('Error uploading document:', error);
        this.uploadError = 'Failed to upload file. Please try again.';
        this.uploadProgress = 0;
      }
    });
  }

  askQuestion(): void {
    if (!this.selectedProject || !this.question) return;

    const contextId = this.currentFolder ? this.currentFolder.id : this.selectedProject.id;
    const contextType = this.currentFolder ? 'folder' : 'project';

    this.projectService.askQuestion(
      contextId,
      this.question,
      contextType
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
    const itemId = item.id;
    const isDoc = this.isDocument(item);

    // Handle normal click for viewing/editing
    if (isDoc) {
      // Clicking on a document
      if (this.selectedDocument?.id === itemId) {
        // If clicking the same document, deselect it
        this.selectedDocument = null;
      } else {
        // If clicking a different document, select it and clear text selection
        this.selectedDocument = item as Document;
        this.selectedText = null;
      }
    } else {
      // Clicking on a text
      if (this.selectedText?.id === itemId) {
        // If clicking the same text, deselect it
        this.selectedText = null;
      } else {
        // If clicking a different text, select it and clear document selection
        this.selectedText = item as UserText;
        this.selectedDocument = null;
      }
    }
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
      this.textSharedUsers = [];
    } else {
      this.selectedText = text;
      this.selectedDocument = null;
      if (text.id) {  // Only load shared users if text has an ID
        this.loadTextSharedUsers();
      }
    }
  }

  deselectProject(): void {
    this.selectedProject = null;
    this.selectedDocument = null;
    this.selectedText = null;
    this.question = '';
    this.answer = '';
    this.folderBackStack = [];
    this.folderForwardStack = [];
    this.currentFolder = null;
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

  autoSaveText(): void {
    if (!this.selectedText?.id || !this.selectedProject?.id) {
      console.warn('Cannot save text: missing text ID or project');
      return;
    }

    // Store references to avoid null checks in the timeout
    const textId = this.selectedText.id;
    const projectId = this.selectedProject.id;
    const title = this.selectedText.title || 'Untitled';
    const content = this.selectedText.content || ' ';
    const folderId = this.selectedText.folder_id;

    // Add debounce to prevent too many requests
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.textService.updateText(
        textId,
        title,
        content,
        [projectId],
        folderId
      ).subscribe({
        next: () => {
          this.refreshProjectContent();
        },
        error: (error) => {
          console.error('Error updating text:', error);
        }
      });
    }, 1000); // Wait 1 second after last change before saving
  }

  getPdfUrl(doc: Document): string {
    return `${this.apiUrl}${doc.file_path}`;
  }

  shareProjectWithUser(): void {
    if (!this.selectedProject || !this.shareEmail) return;

    this.projectService.shareProject(this.selectedProject.id, this.shareEmail)
      .subscribe({
        next: () => {
          this.loadProjectSharedUsers();
          this.shareEmail = '';
        },
        error: (error) => {
          console.error('Error sharing project:', error);
        }
      });
  }

  shareTextWithUser(): void {
    if (!this.selectedText || !this.shareEmail) return;

    this.textService.shareText(this.selectedText.id, this.shareEmail)
      .subscribe({
        next: () => {
          this.loadTextSharedUsers();
          this.shareEmail = '';
        },
        error: (error) => {
          console.error('Error sharing text:', error);
        }
      });
  }

  removeProjectAccess(userId: number): void {
    if (!this.selectedProject) return;

    this.projectService.removeProjectAccess(this.selectedProject.id, userId)
      .subscribe({
        next: () => {
          this.loadProjectSharedUsers();
        },
        error: (error) => {
          console.error('Error removing project access:', error);
        }
      });
  }

  removeTextAccess(userId: number): void {
    if (!this.selectedText) return;

    this.textService.removeTextAccess(this.selectedText.id, userId)
      .subscribe({
        next: () => {
          this.loadTextSharedUsers();
        },
        error: (error) => {
          console.error('Error removing text access:', error);
        }
      });
  }

  loadProjectSharedUsers(): void {
    if (!this.selectedProject) return;

    this.projectService.getProjectSharedUsers(this.selectedProject.id)
      .subscribe({
        next: (users) => {
          this.projectSharedUsers = users;
        },
        error: (error) => {
          console.error('Error loading shared users:', error);
        }
      });
  }

  loadTextSharedUsers(): void {
    if (!this.selectedText?.id) {
      return;  // Don't try to load shared users if no text is selected or ID is undefined
    }

    this.textService.getTextSharedUsers(this.selectedText.id)
      .subscribe({
        next: (users) => {
          this.textSharedUsers = users;
        },
        error: (error) => {
          console.error('Error loading shared users:', error);
        }
      });
  }

  deleteDocument(id: number): void {
    if (!this.selectedProject) return;
    
    if (confirm('Are you sure you want to delete this document?')) {
      this.projectService.deleteDocument(this.selectedProject.id, id).subscribe({
        next: () => {
          if (this.selectedDocument?.id === id) {
            this.selectedDocument = null;
          }
          this.refreshProjectContent();
        },
        error: (error) => {
          console.error('Error deleting document:', error);
        }
      });
    }
  }

  async toggleRecording() {
    if (!this.isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          this.transcribeAudio(audioBlob);
        };

        this.mediaRecorder.start();
        this.isRecording = true;
      } catch (err) {
        console.error('Error accessing microphone:', err);
        // Show error message to user
      }
    } else {
      if (this.mediaRecorder) {
        this.mediaRecorder.stop();
        this.isRecording = false;
        
        // Stop all tracks in the stream
        const stream = this.mediaRecorder.stream;
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }

  transcribeAudio(audioBlob: Blob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.wav');
    
    // Add text_id only if we're editing an existing text
    if (this.selectedText?.id) {
      formData.append('text_id', this.selectedText.id.toString());
    }

    this.isTranscribing = true;

    this.http.post<any>(`${this.apiUrl}/transcribe-audio`, formData)
      .subscribe({
        next: (response) => {
          if (this.selectedText) {
            // Update existing text
            if (this.editor) {
              const quill = this.editor.quillEditor;
              const newTranscribedText = response.content || '';
              
              // Get current cursor position
              const range = quill.getSelection();
              const position = range ? range.index : quill.getLength() - 1;
              
              // Insert text at cursor position or end
              if (position > 0) {
                quill.insertText(position, '\n\n' + newTranscribedText);
              } else {
                quill.setText(newTranscribedText);
              }
              
              // Update the text content
              this.selectedText.content = quill.getText();
              
              // Update the text in the project texts array
              const index = this.projectTexts.findIndex(t => t.id === this.selectedText?.id);
              if (index !== -1) {
                this.projectTexts[index] = {
                  ...this.projectTexts[index],
                  content: this.selectedText.content
                };
              }
              
              // Save the changes
              this.autoSaveText();
            }
          } else {
            // New text creation
            if (this.newTextEditor) {
              const quill = this.newTextEditor.quillEditor;
              const newTranscribedText = response.content || '';
              
              // Get current cursor position
              const range = quill.getSelection();
              const position = range ? range.index : quill.getLength() - 1;
              
              // Insert text at cursor position or end
              if (position > 0) {
                quill.insertText(position, '\n\n' + newTranscribedText);
              } else {
                quill.setText(newTranscribedText);
              }
              
              // Update the content
              this.newTextContent.content = quill.getText();
            }
          }
          
          // Scroll to bottom in either case
          setTimeout(() => {
            const editor = this.selectedText ? this.editor : this.newTextEditor;
            if (editor) {
              const quill = editor.quillEditor;
              quill.focus();
              
              // Move cursor to end
              const length = quill.getLength();
              quill.setSelection(length, 0);
              
              // Scroll editor to bottom
              const editorElement = quill.container.querySelector('.ql-editor');
              if (editorElement) {
                editorElement.scrollTop = editorElement.scrollHeight;
              }
            }
          }, 100);
          
          this.isTranscribing = false;
        },
        error: (error) => {
          console.error('Error transcribing audio:', error);
          this.isTranscribing = false;
          alert('Failed to transcribe audio. Please try again.');
        }
      });
  }

  // Add method to handle editor state
  isEditorReadOnly(): boolean {
    return this.isTranscribing;
  }

  deleteProject(project: Project, event: Event): void {
    event.stopPropagation(); // Prevent project selection
    
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      this.projectService.deleteProject(project.id).subscribe({
        next: () => {
          this.projects = this.projects.filter(p => p.id !== project.id);
          if (this.selectedProject?.id === project.id) {
            this.deselectProject();
          }
        },
        error: (error) => {
          let errorMessage = 'An error occurred while deleting the project.';
          
          if (error.status === 404) {
            errorMessage = 'Project not found. It may have been already deleted.';
          } else if (error.status === 403) {
            errorMessage = 'You do not have permission to delete this project.';
          } else if (error.error?.detail) {
            errorMessage = error.error.detail;
          }
          
          console.error('Error deleting project:', error);
          alert(errorMessage);
        }
      });
    }
  }

  editProject(project: Project, event: Event): void {
    event.stopPropagation(); // Prevent project selection
    this.editingProject = { 
      id: project.id,
      name: project.name,
      description: project.description,
      created_at: project.created_at,
      updated_at: project.updated_at,
      user_id: project.user_id,
      owner_id: project.owner_id
    };
    this.showEditProject = true;
  }

  saveProjectEdit(): void {
    this.projectService.updateProject(
      this.editingProject.id,
      this.editingProject.name,
      this.editingProject.description
    ).subscribe({
      next: (updatedProject) => {
        const index = this.projects.findIndex(p => p.id === updatedProject.id);
        if (index !== -1) {
          this.projects[index] = updatedProject;
          if (this.selectedProject?.id === updatedProject.id) {
            this.selectedProject = updatedProject;
          }
        }
        this.showEditProject = false;
        this.editingProject = {
          id: 0,
          name: '',
          description: '',
          created_at: '',
          updated_at: '',
          user_id: 0,
          owner_id: 0
        };
      },
      error: (error) => {
        console.error('Error updating project:', error);
      }
    });
  }

  cancelProjectEdit(): void {
    this.showEditProject = false;
    this.editingProject = {
      id: 0,
      name: '',
      description: '',
      created_at: '',
      updated_at: '',
      user_id: 0,
      owner_id: 0
    };
  }

  cancelNewText(): void {
    if (this.newTextContent.content && !confirm('Are you sure you want to discard this text?')) {
      return;
    }
    this.showNewTextCreation = false;
    this.newTextContent = { title: '', content: '' };
  }

  async suggestProjectForText(): Promise<void> {
    if (!this.newTextContent.content) return;

    this.isProcessingAISuggestion = true;
    try {
      const response = await this.http.post<ProjectSuggestionResponse>(`${this.apiUrl}/suggest-project`, {
        title: this.newTextContent.title,
        content: this.newTextContent.content
      }).toPromise();

      if (response) {
        this.projectSuggestions = response.suggestions;
        this.suggestedNewProject = response.new_project;
        this.showProjectSuggestions = true;
      }

    } catch (error) {
      console.error('Error getting project suggestion:', error);
      alert('Failed to get project suggestions. Please try again or save manually.');
    } finally {
      this.isProcessingAISuggestion = false;
    }
  }

  async selectSuggestedProject(suggestion: ProjectSuggestion): Promise<void> {
    const project = this.projects.find(p => p.id === suggestion.project_id);
    if (project) {
      if (confirm(`Would you like to add this text to project "${project.name}"? (${Math.round(suggestion.similarity * 100)}% similar)`)) {
        this.saveNewText([project.id]);
      }
    }
  }

  async createSuggestedProject(): Promise<void> {
    if (!this.suggestedNewProject) return;

    if (confirm(`Would you like to create a new project "${this.suggestedNewProject.name}" for this text?`)) {
      this.projectService.createProject(
        this.suggestedNewProject.name,
        this.suggestedNewProject.description
      ).subscribe({
        next: (newProject) => {
          this.projects.push(newProject);
          this.saveNewText([newProject.id]);
        },
        error: (error) => {
          console.error('Error creating suggested project:', error);
          alert('Failed to create new project. Please try again.');
        }
      });
    }
  }

  saveNewText(projectIds: number[] = []): void {
    if (!this.newTextContent.content) return;

    // If projectIds are provided, save directly
    if (projectIds.length > 0) {
      this.textService.createText(
        this.newTextContent.title || 'Untitled',
        this.newTextContent.content,
        projectIds
      ).subscribe({
        next: (newText) => {
          const project = this.projects.find(p => p.id === projectIds[0]);
          if (project) {
            this.selectProject(project);
            setTimeout(() => {
              const text = this.projectTexts.find(t => t.id === newText.id);
              if (text) {
                this.toggleText(text);
              }
            }, 100);
          }
          this.showNewTextCreation = false;
          this.newTextContent = { title: '', content: '' };
          this.showProjectSuggestions = false;
        },
        error: (error: any) => {
          console.error('Error creating text:', error);
          alert('Failed to save text. Please try again.');
        }
      });
    } else {
      // If no projectIds provided, show suggestions modal
      this.suggestProjectForText();
    }
  }

  // Folder-related methods
  createFolder(): void {
    if (!this.selectedProject || !this.newFolder.name) return;

    // Set parent_folder_id based on currently selected folder (if any)
    if (this.currentFolder) {
      this.newFolder.parent_folder_id = this.currentFolder.id;
    } else {
      this.newFolder.parent_folder_id = null;
    }

    this.http.post<Folder>(
      `${this.apiUrl}/projects/${this.selectedProject.id}/folders`,
      this.newFolder
    ).subscribe({
      next: () => {
        this.showCreateFolder = false;
        this.newFolder = { name: '', parent_folder_id: null };
        this.refreshProjectContent();
      },
      error: (error) => {
        console.error('Error creating folder:', error);
      }
    });
  }

  loadFolderStructure(): void {
    if (!this.selectedProject) return;

    this.http.get<Folder[]>(
      `${this.apiUrl}/projects/${this.selectedProject.id}/folders`
    ).subscribe({
      next: (folders) => {
        // Build folder tree structure
        this.folderStructure = this.buildFolderTree(folders);
        this.organizeFolderContents();
      },
      error: (error) => {
        console.error('Error loading folders:', error);
      }
    });
  }

  buildFolderTree(folders: Folder[]): FolderWithItems[] {
    const folderMap = new Map<number, FolderWithItems>();
    const rootFolders: FolderWithItems[] = [];

    // First pass: create FolderWithItems objects
    folders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        folders: [],
        documents: [],
        texts: [],
        isExpanded: false
      });
    });

    // Second pass: build tree structure
    folders.forEach(folder => {
      const folderWithItems = folderMap.get(folder.id)!;
      if (folder.parent_folder_id === null) {
        rootFolders.push(folderWithItems);
      } else {
        const parentFolder = folderMap.get(folder.parent_folder_id);
        if (parentFolder) {
          parentFolder.folders.push(folderWithItems);
        }
      }
    });

    return rootFolders;
  }

  organizeFolderContents(): void {
    if (!this.selectedProject) return;

    // Reset all folder contents
    const resetFolderContents = (folder: FolderWithItems) => {
      folder.documents = [];
      folder.texts = [];
      folder.folders.forEach(resetFolderContents);
    };
    this.folderStructure.forEach(resetFolderContents);

    // Organize documents by folder
    this.projectDocuments.forEach(doc => {
      if (doc.folder_id) {
        const folder = this.findFolderById(doc.folder_id);
        if (folder) {
          folder.documents.push(doc);
        }
      }
    });

    // Organize texts by folder
    this.projectTexts.forEach(text => {
      if (text.folder_id) {
        const folder = this.findFolderById(text.folder_id);
        if (folder) {
          folder.texts.push(text);
        }
      }
    });
  }

  findFolderById(folderId: number): FolderWithItems | null {
    const searchInFolders = (folders: FolderWithItems[]): FolderWithItems | null => {
      for (const folder of folders) {
        if (folder.id === folderId) {
          return folder;
        }
        const found = searchInFolders(folder.folders);
        if (found) {
          return found;
        }
      }
      return null;
    };
    return searchInFolders(this.folderStructure);
  }

  toggleFolder(folder: FolderWithItems): void {
    folder.isExpanded = !folder.isExpanded;
  }

  selectFolder(folder: Folder): void {
    if (this.currentFolder) {
      this.folderBackStack.push(this.currentFolder);
    }
    this.currentFolder = folder;
    this.folderForwardStack = [];
  }

  editFolder(folder: Folder): void {
    this.editingFolder = { ...folder };
    this.showEditFolder = true;
  }

  saveEditedFolder(): void {
    if (!this.selectedProject) return;

    this.http.put<Folder>(
      `${this.apiUrl}/projects/${this.selectedProject.id}/folders/${this.editingFolder.id}`,
      this.editingFolder
    ).subscribe({
      next: () => {
        this.showEditFolder = false;
        this.editingFolder = {
          id: 0,
          name: '',
          project_id: 0,
          parent_folder_id: null,
          created_at: '',
          updated_at: ''
        };
        this.refreshProjectContent();
      },
      error: (error) => {
        console.error('Error updating folder:', error);
      }
    });
  }

  deleteFolder(folder: Folder): void {
    if (!this.selectedProject) return;

    if (confirm('Are you sure you want to delete this folder and move its contents to root?')) {
      this.http.delete(
        `${this.apiUrl}/projects/${this.selectedProject.id}/folders/${folder.id}`
      ).subscribe({
        next: () => {
          if (this.currentFolder?.id === folder.id) {
            this.currentFolder = null;
          }
          this.refreshProjectContent();
        },
        error: (error) => {
          console.error('Error deleting folder:', error);
        }
      });
    }
  }

  // Add refreshProjectContent method
  refreshProjectContent(): void {
    if (!this.selectedProject) return;

    // Store current selections
    const currentTextId = this.selectedText?.id;
    const currentDocId = this.selectedDocument?.id;
    const currentFolderId = this.currentFolder?.id;

    // Reload all content
    this.textService.getTexts(this.selectedProject.id).subscribe({
      next: (texts) => {
        this.projectTexts = texts;
        // Restore text selection if it exists
        if (currentTextId) {
          this.selectedText = texts.find(t => t.id === currentTextId) || null;
          if (this.selectedText) {
            this.loadTextSharedUsers();
          }
        }
      },
      error: (error) => {
        console.error('Error loading texts:', error);
      }
    });

    this.projectService.getDocuments(this.selectedProject.id).subscribe({
      next: (documents) => {
        this.projectDocuments = documents;
        // Restore document selection if it exists
        if (currentDocId) {
          this.selectedDocument = documents.find(d => d.id === currentDocId) || null;
        }
      },
      error: (error) => {
        console.error('Error loading documents:', error);
      }
    });

    // Reload folder structure
    this.http.get<Folder[]>(
      `${this.apiUrl}/projects/${this.selectedProject.id}/folders`
    ).subscribe({
      next: (folders) => {
        this.folderStructure = this.buildFolderTree(folders);
        // Restore folder selection if it exists
        if (currentFolderId) {
          this.currentFolder = folders.find(f => f.id === currentFolderId) || null;
        }
        this.organizeFolderContents();
      },
      error: (error) => {
        console.error('Error loading folders:', error);
      }
    });
  }

  // Add these methods before the constructor
  isItemSelectedForChat(id: number, type: 'document' | 'text'): boolean {
    return this.selectedItems.some((item: SelectedItem) => item.id === id && item.type === type);
  }

  getItemNameById(id: number): string {
    const item = [...this.projectDocuments, ...this.projectTexts].find(i => i.id === id);
    if (!item) return '';
    return this.isDocument(item) ? item.name : item.title;
  }

  removeFromSelection(id: number, type: 'document' | 'text'): void {
    this.selectedItems = this.selectedItems.filter(item => !(item.id === id && item.type === type));
  }

  isEditingFolderDisabled(folderId: number): boolean {
    return folderId === this.editingFolder.id;
  }

  // Added folder navigation methods
  goBackFolder(): void {
    if (this.folderBackStack.length > 0) {
      if (this.currentFolder) {
        this.folderForwardStack.push(this.currentFolder);
      }
      this.currentFolder = this.folderBackStack.pop()!;
    }
  }

  goForwardFolder(): void {
    if (this.folderForwardStack.length > 0) {
      if (this.currentFolder) {
        this.folderBackStack.push(this.currentFolder);
      }
      this.currentFolder = this.folderForwardStack.pop()!;
    }
  }

  summarizeContent(): void {
    if (!this.selectedProject) return;
    
    this.isSummarizing = true;
    this.summarizeStatus = "Starting summarization process...";
    
    const payload: any = { 
      project_id: this.selectedProject.id 
    };
    if (this.currentFolder) {
      payload.folder_id = this.currentFolder.id;
    }

    // Start the summarization process
    this.http.post<any>(`${this.apiUrl}/summarize`, payload).subscribe({
      next: (response) => {
        if (response.task_id) {
          this.currentSummarizeTaskId = response.task_id;
          this.checkSummarizeStatus();
        } else {
          this.handleError("No task ID received");
        }
      },
      error: (error) => this.handleError(error)
    });
  }

  // Add method to check summarization status
  private checkSummarizeStatus(): void {
    if (!this.currentSummarizeTaskId) return;

    this.statusCheckInterval = setInterval(() => {
      this.http.get<any>(`${this.apiUrl}/summarize/${this.currentSummarizeTaskId}/status`).subscribe({
        next: (response) => {
          if (response.status === 'processing') {
            this.summarizeStatus = "Processing files...";
          } else if (response.status === 'completed' || response.error || response.pdf_url) {
            clearInterval(this.statusCheckInterval);
            this.handleSummarizeComplete(response);
          }
        },
        error: (error) => {
          clearInterval(this.statusCheckInterval);
          this.handleError(error);
        }
      });
    }, 2000); // Check every 2 seconds
  }

  // Add method to cancel summarization
  cancelSummarize(): void {
    if (this.currentSummarizeTaskId) {
      this.http.delete<any>(`${this.apiUrl}/summarize/${this.currentSummarizeTaskId}`).subscribe({
        next: () => {
          clearInterval(this.statusCheckInterval);
          this.summarizeStatus = "Summarization cancelled.";
          this.isSummarizing = false;
          this.currentSummarizeTaskId = null;
        },
        error: (error) => this.handleError(error)
      });
    }
  }

  // Add method to handle completion
  private handleSummarizeComplete(response: any): void {
    this.isSummarizing = false;
    this.currentSummarizeTaskId = null;

    if (response.error) {
      this.summarizeStatus = "Error: " + response.error;
      return;
    }

    this.summarizeStatus = `Completed summarizing ${response.summarized_files} of ${response.total_files} files`;

    // Create a modal to show options and preview
    if (response.pdf_url) {
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.backgroundColor = 'rgba(0,0,0,0.7)';
      modal.style.zIndex = '1000';
      modal.style.display = 'flex';
      modal.style.flexDirection = 'column';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';

      const contentBox = document.createElement('div');
      contentBox.style.backgroundColor = 'white';
      contentBox.style.padding = '20px';
      contentBox.style.borderRadius = '8px';
      contentBox.style.maxWidth = '600px';
      contentBox.style.width = '90%';
      contentBox.style.textAlign = 'center';

      const title = document.createElement('h2');
      title.textContent = 'Summary Generated Successfully';
      title.style.marginBottom = '20px';

      const message = document.createElement('p');
      message.textContent = 'The summary has been saved to your project and can be accessed like any other document.';
      message.style.marginBottom = '20px';
      message.style.color = '#4a5568';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'center';
      buttonContainer.style.gap = '10px';
      buttonContainer.style.marginBottom = '20px';

      // Open in New Tab button
      const openButton = document.createElement('button');
      openButton.textContent = 'Open in New Tab';
      openButton.className = 'bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600';
      openButton.onclick = () => {
        window.open(`${this.apiUrl}${response.pdf_url}`, '_blank');
      };

      // Download button
      const downloadButton = document.createElement('button');
      downloadButton.textContent = 'Download PDF';
      downloadButton.className = 'bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600';
      downloadButton.onclick = () => {
        const link = document.createElement('a');
        link.href = `${this.apiUrl}${response.pdf_url}`;
        link.download = response.pdf_url.split('/').pop() || 'summary.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

      // Close button
      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.className = 'bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600';
      closeButton.onclick = () => {
        document.body.removeChild(modal);
        // Refresh the project content to show the new summary document
        this.refreshProjectContent();
      };

      buttonContainer.appendChild(openButton);
      buttonContainer.appendChild(downloadButton);
      buttonContainer.appendChild(closeButton);

      contentBox.appendChild(title);
      contentBox.appendChild(message);
      contentBox.appendChild(buttonContainer);
      modal.appendChild(contentBox);
      document.body.appendChild(modal);
    }
  }

  // Add error handling method
  private handleError(error: any): void {
    console.error("Error in summarization:", error);
    this.summarizeStatus = "Error: " + (error.error?.detail || error.message || "Unknown error");
    this.isSummarizing = false;
    this.currentSummarizeTaskId = null;
    clearInterval(this.statusCheckInterval);
  }

  exportProjectContent(projectId: number, event: Event): void {
    event.stopPropagation(); // Prevent project selection when clicking export
    if (this.isExporting) return;
    
    this.isExporting = true;
    
    this.http.post(`${this.apiUrl}/projects/${projectId}/export`, {}, { 
      responseType: 'blob' 
    }).subscribe({
      next: (response: Blob) => {
        // Create blob link to download
        const url = window.URL.createObjectURL(response);
        const link = document.createElement('a');
        link.href = url;
        link.download = `project-export-${new Date().getTime()}.pdf`;
        
        // Add link to document and trigger download
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        this.isExporting = false;
      },
      error: (error) => {
        console.error('Error exporting project:', error);
        this.isExporting = false;
        // Show error message to user
        alert('Failed to export project content. Please try again.');
      }
    });
  }
} 