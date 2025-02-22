import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService, Project } from '../../services/project.service';

interface ProjectWithStats {
  id: number;
  name: string;
  description: string;
  created_at: string;
  documentCount: number;
}

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold">My Projects</h1>
        <button (click)="showCreateProject = true" 
                class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
          Create New Project
        </button>
      </div>

      <!-- Create Project Modal -->
      <div *ngIf="showCreateProject" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
        <div class="bg-white p-6 rounded-lg w-96">
          <h2 class="text-xl font-bold mb-4">Create New Project</h2>
          <form (ngSubmit)="createProject()">
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">Project Name</label>
              <input type="text" [(ngModel)]="newProject.name" name="name" 
                     class="w-full px-3 py-2 border rounded" required>
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">Description</label>
              <textarea [(ngModel)]="newProject.description" name="description" 
                        class="w-full px-3 py-2 border rounded" rows="3"></textarea>
            </div>
            <div class="flex justify-end gap-2">
              <button type="button" (click)="showCreateProject = false" 
                      class="px-4 py-2 border rounded">
                Cancel
              </button>
              <button type="submit" 
                      class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                Create
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Projects Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div *ngFor="let project of projectsWithStats" 
             class="border rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer bg-white"
             (click)="navigateToProject(project.id)">
          <div class="flex justify-between items-start mb-3">
            <h2 class="text-xl font-semibold">{{project.name}}</h2>
            <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
              {{project.documentCount}} Documents
            </span>
          </div>
          <p class="text-gray-600 mb-4">{{project.description}}</p>
          <div class="flex justify-between items-center text-sm text-gray-500">
            <span>Created: {{project.created_at | date:'medium'}}</span>
            <button class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                    (click)="navigateToProject(project.id); $event.stopPropagation();">
              Open Project
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="projectsWithStats.length === 0" 
             class="col-span-full text-center py-8">
          <p class="text-gray-500 mb-4">No projects yet. Create your first project to get started!</p>
          <button (click)="showCreateProject = true"
                  class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            Create First Project
          </button>
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
  newProject = {
    name: '',
    description: ''
  };

  constructor(
    private projectService: ProjectService,
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
        console.error('Error loading projects:', error);
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

  createProject(): void {
    if (!this.newProject.name) return;

    this.projectService.createProject(this.newProject.name, this.newProject.description).subscribe({
      next: () => {
        this.showCreateProject = false;
        this.newProject = { name: '', description: '' };
        this.loadProjects();
      },
      error: (error) => {
        console.error('Error creating project:', error);
      }
    });
  }

  navigateToProject(projectId: number): void {
    this.router.navigate(['/projects', projectId]);
  }
} 