import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  template: `
    <!-- Navigation Header -->
    <nav class="bg-white shadow-sm">
      <div class="container mx-auto">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center">
            <a routerLink="/" class="flex items-center gap-2">
              <i class="pi pi-book text-2xl text-primary-600"></i>
              <span class="text-xl font-semibold text-gray-900">RAG Assistant</span>
            </a>
          </div>

          <div class="flex items-center gap-4">
            <a routerLink="/upload"
               routerLinkActive="text-primary-600"
               class="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
              Upload
            </a>
            <a routerLink="/chat"
               routerLinkActive="text-primary-600"
               class="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
              Chat
            </a>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <router-outlet></router-outlet>
  `,
  styles: []
})
export class AppComponent {
  title = 'RAG Assistant';
}
