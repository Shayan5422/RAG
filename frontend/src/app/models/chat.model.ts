export interface Chat {
    id: number;
    question: string;
    answer: string;
    document_name: string;
    created_at: string;
}

export interface ChatMessage {
    message: string;
}

export interface ChatResponse {
    answer: string;
    sources?: string[];
} 