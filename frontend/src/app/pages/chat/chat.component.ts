import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextarea } from 'primeng/inputtextarea';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AvatarModule } from 'primeng/avatar';
import { RagService } from '../../services/rag.service';
import { ChatService } from '../../services/chat.service';
import { ActivatedRoute } from '@angular/router';

interface Message {
  content: string;
  isUser: boolean;
  timestamp: Date;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InputTextarea,
    ButtonModule,
    CardModule,
    AvatarModule
  ],
  template: `
    <div class="container mx-auto px-4 py-8">
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-lg shadow-lg p-6">
          <h2 class="text-2xl font-bold mb-6">Chat with Document</h2>
          
          <div class="mb-6" *ngIf="selectedDocument">
            <p class="text-gray-600">Selected document: {{ selectedDocument }}</p>
          </div>

          <div class="space-y-4 mb-6">
            <div *ngFor="let message of chatHistory" class="p-4 rounded-lg" 
                [ngClass]="{'bg-gray-100': message.isUser, 'bg-blue-50': !message.isUser}">
              <p class="font-semibold mb-2">{{ message.isUser ? 'You' : 'AI' }}</p>
              <p class="text-gray-700">{{ message.text }}</p>
            </div>
          </div>

          <div *ngIf="error" class="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
            {{ error }}
          </div>

          <div class="flex space-x-4">
            <textarea
              pTextarea
              [(ngModel)]="currentMessage"
              [rows]="3"
              placeholder="Type your message here..."
              class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            ></textarea>
            <button
              pButton
              type="button"
              [disabled]="!currentMessage.trim() || isLoading"
              (click)="sendMessage()"
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {{ isLoading ? 'Sending...' : 'Send' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class ChatComponent implements OnInit {
  selectedDocument: string | null = null;
  currentMessage: string = '';
  chatHistory: Array<{ text: string; isUser: boolean }> = [];
  isLoading: boolean = false;
  error: string | null = null;

  constructor(
    private chatService: ChatService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.selectedDocument = params['document'];
    });
  }

  sendMessage() {
    if (!this.currentMessage.trim() || this.isLoading) return;

    this.isLoading = true;
    this.error = null;
    const messageText = this.currentMessage;
    this.chatHistory.push({ text: messageText, isUser: true });
    this.currentMessage = '';

    this.chatService.sendMessage({ message: messageText }).subscribe({
      next: (response) => {
        this.chatHistory.push({ text: response.answer, isUser: false });
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Chat error:', error);
        this.isLoading = false;
        if (error.status === 401) {
          this.error = 'Your session has expired. Please log in again.';
        } else if (error.status === 0) {
          this.error = 'Unable to connect to server. Please check your connection.';
        } else {
          this.error = 'An error occurred while sending your message. Please try again.';
        }
      }
    });
  }
} 