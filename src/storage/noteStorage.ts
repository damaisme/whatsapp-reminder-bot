import fs from 'fs/promises';
import path from 'path';
import { Note } from '../types/note';

// Use ./data for storage
const DATA_DIR = path.join('.', 'data');
const NOTES_DIR = path.join(DATA_DIR, 'notes');

// Ensure directories exist
async function ensureDirectories() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(NOTES_DIR, { recursive: true });
        console.log('Directories created/verified:', { DATA_DIR, NOTES_DIR });
    } catch (error) {
        console.error('Error creating directories:', error);
        throw error;
    }
}

export async function saveNote(note: Note): Promise<void> {
    console.log('Starting saveNote with:', { note });
    
    try {
        await ensureDirectories();
        
        const filePath = path.join(NOTES_DIR, `${note.id}.json`);
        console.log('Saving note to:', filePath);
        
        await fs.writeFile(filePath, JSON.stringify(note, null, 2), 'utf8');
        console.log('Note saved successfully');
    } catch (error) {
        console.error('Error in saveNote:', error);
        throw error;
    }
}

export async function getNotes(chat: string, sender: string): Promise<Note[]> {
    console.log('Getting notes for:', { chat, sender, NOTES_DIR });
    
    try {
        await ensureDirectories();
        
        const files = await fs.readdir(NOTES_DIR);
        console.log('Found files:', files);
        
        const notes: Note[] = [];
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            try {
                const filePath = path.join(NOTES_DIR, file);
                const content = await fs.readFile(filePath, 'utf8');
                const note = JSON.parse(content) as Note;
                
                console.log('Reading note:', {
                    id: note.id,
                    sender: note.sender,
                    chat: note.chat,
                    matches: {
                        senderMatch: note.sender === sender,
                        chatMatch: note.chat === chat
                    }
                });
                
                if (note.sender === sender && note.chat === chat) {
                    notes.push(note);
                    console.log('Added note to list:', note.id);
                }
            } catch (error) {
                console.error('Error reading note file:', file, error);
            }
        }
        
        console.log(`Found ${notes.length} notes for sender`);
        return notes.sort((a, b) => b.created - a.created);
    } catch (error) {
        console.error('Error in getNotes:', error);
        return [];
    }
}

export async function getNote(id: string, sender: string, chat: string): Promise<Note | null> {
    console.log('Getting note:', { id, sender, chat });
    
    try {
        const filePath = path.join(NOTES_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf8');
        const note = JSON.parse(content) as Note;
        
        // Verify ownership
        if (note.sender === sender && note.chat === chat) {
            return note;
        }
        
        return null;
    } catch (error) {
        console.error('Error getting note:', error);
        return null;
    }
}

export async function deleteNote(id: string, chat: string, sender: string): Promise<boolean> {
    const notes = await getNotes(chat, sender);
    const initialLength = notes.length;
    const filteredNotes = notes.filter(n => !(n.id === id && n.chat === chat && n.sender === sender));
    
    if (filteredNotes.length === initialLength) {
        return false;
    }
    
    await saveNote(filteredNotes[0]);
    return true;
}

export async function searchNotes(chat: string, sender: string, query: string): Promise<Note[]> {
    const notes = await getNotes(chat, sender);
    const searchTerm = query.toLowerCase();
    
    return notes.filter(note => 
        note.title.toLowerCase().includes(searchTerm) ||
        note.content.toLowerCase().includes(searchTerm) ||
        note.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
    );
} 