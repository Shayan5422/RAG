import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <nav class="bg-white shadow-sm">
        <div class="container mx-auto px-4 py-3">
          <div class="flex justify-between items-center">
            <a routerLink="/" class="text-xl font-bold text-gray-800">
              Project Management System
            </a>
            <div class="flex items-center gap-4">
              <a routerLink="/projects" 
                 routerLinkActive="text-blue-500"
                 class="text-gray-600 hover:text-gray-900">
                Projects
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main class="container mx-auto py-6">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: []
})
export class AppComponent {
  title = 'Project Management System';
}
