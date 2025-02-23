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
                            *ngIf="proj.user_id === currentUserId">
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
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
          <div class="grid grid-cols-2 gap-2">
            <button (click)="createText()"
                    class="bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 flex items-center justify-center group relative">
              <i class="pi pi-file-edit text-xl"></i>
              <span class="absolute bottom-full mb-2 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                New Text
              </span>
            </button>
            <button (click)="showUploadFile = true"
                    class="bg-purple-500 text-white p-3 rounded-lg hover:bg-purple-600 flex items-center justify-center group relative">
              <i class="pi pi-upload text-xl"></i>
              <span class="absolute bottom-full mb-2 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Upload File
              </span>
            </button>
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
  selectedItems: number[] = [];

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
    this.http.get<any>('http://localhost:8000/me').subscribe({
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
    this.selectedItems = [];
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

  createText(): void {
    if (!this.selectedProject) return;

    this.textService.createText(
      'Untitled',  // Default title
      ' ',         // Non-empty content string to satisfy backend validation
      [this.selectedProject.id]
    ).subscribe({
      next: (newText) => {
        // Add the new text to the project texts array
        this.projectTexts.push(newText);
        
        // Set as selected text with all required properties
        this.selectedText = {
          id: newText.id,
          title: newText.title || 'Untitled',
          content: newText.content || ' ',
          created_at: newText.created_at,
          updated_at: newText.updated_at,
          user_id: newText.user_id,
          owner_id: newText.owner_id,
          is_shared: newText.is_shared ?? false
        };
        
        this.selectedDocument = null;
        
        // Load shared users for the new text
        this.loadTextSharedUsers();
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
      this.loadTextSharedUsers();
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

    // Add debounce to prevent too many requests
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.textService.updateText(
        textId,
        title,
        content,
        [projectId]
      ).subscribe({
        next: (updatedText) => {
          const index = this.projectTexts.findIndex(t => t.id === updatedText.id);
          if (index !== -1) {
            this.projectTexts[index] = updatedText;
          }
        },
        error: (error) => {
          console.error('Error updating text:', error);
        }
      });
    }, 1000); // Wait 1 second after last change before saving
  }

  getPdfUrl(doc: Document): string {
    const baseUrl = 'http://localhost:8000';
    const filePath = doc.file_path.startsWith('/') ? doc.file_path : `/${doc.file_path}`;
    return `${baseUrl}${filePath}`;
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
    if (!this.selectedText) return;

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
          this.projectDocuments = this.projectDocuments.filter(d => d.id !== id);
          this.selectedDocument = null;
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

    this.http.post<any>('http://localhost:8000/transcribe-audio', formData)
      .subscribe({
        next: (response) => {
          if (this.selectedText) {
            // Update existing text
            if (this.editor) {
              const quill = this.editor.quillEditor;
              const existingContent = this.selectedText.content || '';
              const newTranscribedText = response.content || '';
              
              let textToAdd = newTranscribedText;
              if (existingContent && !existingContent.endsWith('\n')) {
                textToAdd = '\n' + textToAdd;
              }
              
              const length = quill.getLength();
              quill.insertText(length - 1, textToAdd);
              
              this.selectedText.content = quill.getText();
              
              // Update the text in the project texts array
              const index = this.projectTexts.findIndex(t => t.id === this.selectedText?.id);
              if (index !== -1) {
                this.projectTexts[index] = {
                  ...this.projectTexts[index],
                  content: this.selectedText.content
                };
              }
            }
          } else {
            // New text creation
            if (this.newTextEditor) {
              const quill = this.newTextEditor.quillEditor;
              const existingContent = this.newTextContent.content || '';
              const newTranscribedText = response.content || '';
              
              let textToAdd = newTranscribedText;
              if (existingContent && !existingContent.endsWith('\n')) {
                textToAdd = '\n' + textToAdd;
              }
              
              const length = quill.getLength();
              quill.insertText(length - 1, textToAdd);
              
              this.newTextContent.content = quill.getText();
            }
          }
          
          // Scroll to bottom in either case
          setTimeout(() => {
            const editor = this.selectedText ? this.editor : this.newTextEditor;
            if (editor) {
              const quill = editor.quillEditor;
              const newLength = quill.getLength();
              quill.setSelection(newLength - 1, 0);
              const editorElement = document.querySelector('.ql-editor');
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
      const response = await this.http.post<ProjectSuggestionResponse>('http://localhost:8000/suggest-project', {
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
} 