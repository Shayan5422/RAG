import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule],
  template: `
    <div class="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <div class="container py-16">
        <div class="text-center">
          <h1 class="text-4xl font-bold text-gray-900 sm:text-6xl">
            RAG Document Assistant
          </h1>
          <p class="mt-6 text-lg text-gray-600">
            Upload your documents and chat with an AI that understands your content
          </p>
          <div class="mt-10 flex gap-4 justify-center">
            <a routerLink="/upload" pButton class="p-button-primary" label="Upload Documents"></a>
            <a routerLink="/chat" pButton class="p-button-outlined" label="Start Chatting"></a>
          </div>
        </div>

        <div class="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div class="card">
            <i class="pi pi-upload text-4xl text-primary-600 mb-4"></i>
            <h3 class="text-xl font-semibold text-gray-900">Easy Upload</h3>
            <p class="mt-2 text-gray-600">
              Upload your documents in various formats including PDF, DOC, and TXT.
            </p>
          </div>

          <div class="card">
            <i class="pi pi-comments text-4xl text-primary-600 mb-4"></i>
            <h3 class="text-xl font-semibold text-gray-900">Interactive Chat</h3>
            <p class="mt-2 text-gray-600">
              Chat naturally with an AI that understands your documents' context.
            </p>
          </div>

          <div class="card">
            <i class="pi pi-search text-4xl text-primary-600 mb-4"></i>
            <h3 class="text-xl font-semibold text-gray-900">Smart Search</h3>
            <p class="mt-2 text-gray-600">
              Get accurate answers and insights from your document collection.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class HomeComponent {} 