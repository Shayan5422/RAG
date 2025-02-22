import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../services/chat.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-3xl mx-auto">
        <div class="text-center">
          <h2 class="text-3xl font-extrabold text-gray-900 mb-8">
            Upload Documents
          </h2>
          <p class="text-lg text-gray-500 mb-8">
            Upload your PDF documents to chat with them. The documents will be processed and made available for intelligent conversations.
          </p>
        </div>

        <div class="bg-white shadow sm:rounded-lg p-6">
          <div class="space-y-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">
                Document Upload
              </label>
              <div class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md"
                   [class.bg-gray-50]="isDragging"
                   (dragover)="onDragOver($event)"
                   (dragleave)="onDragLeave($event)"
                   (drop)="onDrop($event)">
                <div class="space-y-1 text-center">
                  <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <div class="flex text-sm text-gray-600">
                    <label for="file-upload" class="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                      <span>Upload a file</span>
                      <input id="file-upload" name="file-upload" type="file" class="sr-only" accept=".pdf" (change)="onFileSelected($event)">
                    </label>
                    <p class="pl-1">or drag and drop</p>
                  </div>
                  <p class="text-xs text-gray-500">
                    PDF up to 10MB
                  </p>
                </div>
              </div>
            </div>

            <div *ngIf="uploadedFiles.length > 0" class="mt-6">
              <h3 class="text-lg font-medium text-gray-900">Uploaded Documents</h3>
              <ul class="mt-3 divide-y divide-gray-200">
                <li *ngFor="let file of uploadedFiles" class="py-3 flex justify-between items-center">
                  <div class="flex items-center">
                    <svg class="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
                    </svg>
                    <span class="ml-2 flex-1 w-0 truncate">
                      {{ file }}
                    </span>
                  </div>
                  <div class="ml-4 flex-shrink-0">
                    <button (click)="startChat(file)" class="font-medium text-indigo-600 hover:text-indigo-500">
                      Chat with this document
                    </button>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class UploadComponent {
  isDragging = false;
  uploadedFiles: string[] = [];

  constructor(
    private chatService: ChatService,
    private router: Router
  ) {
    this.loadDocuments();
  }

  loadDocuments() {
    this.chatService.getDocuments().subscribe({
      next: (files) => {
        this.uploadedFiles = files;
      },
      error: (error) => {
        console.error('Failed to load documents:', error);
      }
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFile(files[0]);
    }
  }

  onFileSelected(event: Event) {
    const element = event.target as HTMLInputElement;
    const files = element.files;
    if (files && files.length > 0) {
      this.uploadFile(files[0]);
    }
  }

  uploadFile(file: File) {
    if (!file.type.includes('pdf')) {
      alert('Please upload PDF files only');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      alert('File size should not exceed 10MB');
      return;
    }

    this.chatService.uploadDocument(file).subscribe({
      next: (response) => {
        console.log('Upload successful:', response);
        this.loadDocuments();
      },
      error: (error) => {
        console.error('Upload failed:', error);
        alert('Failed to upload file. Please try again.');
      }
    });
  }

  startChat(filename: string) {
    // Navigate to chat with the selected document
    this.router.navigate(['/chat'], { queryParams: { document: filename } });
  }
} 