import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextarea } from 'primeng/inputtextarea';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AvatarModule } from 'primeng/avatar';
import { RagService } from '../../services/rag.service';

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
    <div class="min-h-screen bg-gray-50">
      <div class="container py-8">
        <div class="max-w-4xl mx-auto">
          <div class="card mb-4">
            <div class="flex items-center gap-4 mb-6">
              <i class="pi pi-comments text-2xl text-primary-600"></i>
              <h2 class="text-2xl font-bold text-gray-900">Chat with Your Documents</h2>
            </div>

            <!-- Chat Messages -->
            <div class="bg-white rounded-lg p-4 h-[500px] overflow-y-auto mb-4 border border-gray-200">
              <div class="space-y-4">
                @for (message of messages; track message) {
                  <div [class]="message.isUser ? 'flex justify-end' : 'flex justify-start'">
                    <div [class]="message.isUser ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-900'"
                         class="max-w-[80%] rounded-lg px-4 py-2">
                      @if (!message.isUser) {
                        <div class="flex items-center gap-2 mb-1">
                          <p-avatar icon="pi pi-robot" shape="circle" size="normal" styleClass="bg-primary-200"></p-avatar>
                          <span class="text-sm font-medium">AI Assistant</span>
                        </div>
                      }
                      <p class="whitespace-pre-wrap">{{ message.content }}</p>
                      <div [class]="message.isUser ? 'text-primary-200' : 'text-gray-500'"
                           class="text-xs mt-1">
                        {{ message.timestamp | date:'shortTime' }}
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Input Area -->
            <div class="flex gap-2">
              <textarea pInputTextarea
                        [(ngModel)]="newMessage"
                        placeholder="Type your message..."
                        class="flex-1 w-full"
                        [rows]="1"
                        [autoResize]="true"
                        (keydown.enter)="onEnter($event)">
              </textarea>
              <button pButton
                      icon="pi pi-send"
                      [disabled]="!newMessage.trim()"
                      (click)="sendMessage()"
                      class="p-button-primary">
                Send
              </button>
            </div>
          </div>

          <!-- Document Context -->
          <div class="card">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Active Documents</h3>
            <div class="space-y-2">
              @for (doc of activeDocuments; track doc) {
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <i class="pi pi-file text-primary-600"></i>
                    <span class="text-gray-700">{{ doc }}</span>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class ChatComponent implements OnInit {
  messages: Message[] = [
    {
      content: "Hello! I'm your document assistant. I can help you understand and analyze your uploaded documents. What would you like to know?",
      isUser: false,
      timestamp: new Date()
    }
  ];

  activeDocuments: string[] = [];
  newMessage = '';

  constructor(private ragService: RagService) {}

  ngOnInit() {
    this.loadActiveDocuments();
  }

  loadActiveDocuments() {
    this.ragService.getActiveDocuments().subscribe({
      next: (documents) => {
        this.activeDocuments = documents;
      },
      error: (error) => {
        console.error('Failed to load documents:', error);
      }
    });
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;

    // Add user message
    this.messages.push({
      content: this.newMessage,
      isUser: true,
      timestamp: new Date()
    });

    const messageToSend = this.newMessage;
    this.newMessage = '';

    // Send to backend
    this.ragService.sendMessage(messageToSend).subscribe({
      next: (response) => {
        this.messages.push({
          content: response.answer,
          isUser: false,
          timestamp: new Date()
        });
      },
      error: (error) => {
        this.messages.push({
          content: 'Sorry, I encountered an error while processing your request. Please try again.',
          isUser: false,
          timestamp: new Date()
        });
        console.error('Chat error:', error);
      }
    });
  }

  onEnter(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
} 