import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../services/chat.service';
import { Chat } from '../../models/chat.model';

@Component({
  selector: 'app-chat-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container mx-auto px-4 py-8">
      <h2 class="text-2xl font-bold mb-6 text-gray-800">Chat History</h2>
      <div class="space-y-4">
        <div *ngFor="let chat of chatHistory" class="bg-white rounded-lg shadow p-4">
          <div class="mb-2">
            <p class="text-sm text-gray-500">{{ chat.created_at | date:'medium' }}</p>
            <p class="text-sm text-gray-500">Document: {{ chat.document_name }}</p>
          </div>
          <div class="space-y-2">
            <div class="bg-gray-50 p-3 rounded">
              <p class="font-semibold text-gray-700">Question:</p>
              <p class="text-gray-600">{{ chat.question }}</p>
            </div>
            <div class="bg-blue-50 p-3 rounded">
              <p class="font-semibold text-gray-700">Answer:</p>
              <p class="text-gray-600">{{ chat.answer }}</p>
            </div>
          </div>
        </div>
      </div>
      <div *ngIf="chatHistory.length === 0" class="text-center text-gray-500 mt-8">
        No chat history available yet.
      </div>
    </div>
  `,
  styles: []
})
export class ChatHistoryComponent implements OnInit {
  chatHistory: Chat[] = [];

  constructor(private chatService: ChatService) {}

  ngOnInit() {
    this.loadChatHistory();
  }

  loadChatHistory() {
    this.chatService.getChatHistory().subscribe({
      next: (history) => {
        this.chatHistory = history;
      },
      error: (error) => {
        console.error('Failed to load chat history:', error);
      }
    });
  }
} 