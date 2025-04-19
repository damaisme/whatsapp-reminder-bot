export interface Note {
    id: string;
    sender: string;
    chat: string;
    title: string;
    content: string;
    created: number;
    updated: number;
    tags: string[];
} 