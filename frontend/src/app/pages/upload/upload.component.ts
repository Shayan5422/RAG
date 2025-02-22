import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadModule } from 'primeng/fileupload';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { RagService } from '../../services/rag.service';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FileUploadModule, ButtonModule, ToastModule],
  providers: [MessageService],
  template: `
    <div class="min-h-screen bg-gray-50 py-12">
      <div class="container">
        <div class="card max-w-3xl mx-auto">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">Upload Documents</h2>
          
          <p-toast></p-toast>
          
          <p-fileUpload
            #fileUpload
            [multiple]="true"
            accept=".pdf,.doc,.docx,.txt"
            [maxFileSize]="10000000"
            [customUpload]="true"
            (uploadHandler)="onUpload($event)"
            [auto]="true"
            chooseLabel="Choose Files"
            class="w-full"
            [showUploadButton]="false"
            [showCancelButton]="false"
          >
            <ng-template pTemplate="content">
              <div class="flex flex-col items-center justify-center py-8 px-4">
                <i class="pi pi-upload text-4xl text-primary-600 mb-4"></i>
                <p class="text-gray-600 text-center mb-2">
                  Drag and drop files here or click to browse
                </p>
                <p class="text-sm text-gray-500">
                  Supported formats: PDF, DOC, DOCX, TXT (max 10MB)
                </p>
              </div>
            </ng-template>
          </p-fileUpload>

          <div class="mt-8">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Upload Guidelines</h3>
            <ul class="list-disc list-inside text-gray-600 space-y-2">
              <li>Make sure your documents are in supported format</li>
              <li>Files should not exceed 10MB in size</li>
              <li>Ensure documents are readable and not password protected</li>
              <li>You can upload multiple files at once</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class UploadComponent {
  constructor(
    private messageService: MessageService,
    private ragService: RagService
  ) {}

  onUpload(event: any) {
    const files = event.files;
    console.log('Uploading files:', files); // Debug log
    
    // Upload each file
    files.forEach((file: File) => {
      console.log('Uploading file:', file.name); // Debug log
      this.ragService.uploadDocument(file).subscribe({
        next: (response) => {
          console.log('Upload response:', response); // Debug log
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: `${file.name} uploaded successfully`
          });
        },
        error: (error) => {
          console.error('Upload error:', error); // Debug log
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: `Failed to upload ${file.name}: ${error.message}`
          });
        }
      });
    });
  }
} 