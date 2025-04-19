import fs from 'fs/promises';
import path from 'path';
import { Note } from '../types/note';

// Use absolute path for data directory
const DATA_DIR = path.join(process.cwd(), 'data');
const NOTES_DIR = path.join(DATA_DIR, 'notes');

// Helper function to ensure directories exist
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
        // Ensure directories exist
        await ensureDirectories();
        
        // Create file path
        const filePath = path.join(NOTES_DIR, `${note.id}.json`);
        console.log('Saving note to path:', filePath);
        
        // Save note to file
        const noteData = JSON.stringify(note, null, 2);
        await fs.writeFile(filePath, noteData, 'utf8');
        
        // Verify the file was written
        const savedData = await fs.readFile(filePath, 'utf8');
        const savedNote = JSON.parse(savedData);
        console.log('Note saved and verified:', savedNote);
        
    } catch (error) {
        console.error('Error in saveNote:', error);
        throw error;
    }
}

export async function getNotes(sender: string, chat: string): Promise<Note[]> {
    console.log('Getting notes for:', { sender, chat, NOTES_DIR });
    
    try {
        // Ensure directory exists
        await fs.mkdir(NOTES_DIR, { recursive: true });
        
        // List all files
        const files = await fs.readdir(NOTES_DIR);
        console.log('Found files in directory:', files);
        
        const notes: Note[] = [];
        
        // Read each note file
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            try {
                const filePath = path.join(NOTES_DIR, file);
                const content = await fs.readFile(filePath, 'utf8');
                console.log('Reading file:', { file, content });
                
                const note = JSON.parse(content) as Note;
                console.log('Parsed note:', {
                    id: note.id,
                    sender: note.sender,
                    chat: note.chat,
                    title: note.title,
                    matches: {
                        senderMatch: note.sender === sender,
                        chatMatch: note.chat === chat
                    }
                });
                
                // Check if note belongs to sender and chat
                if (note.sender === sender && note.chat === chat) {
                    notes.push(note);
                    console.log('Added note to list');
                } else {
                    console.log('Note does not match criteria');
                }
            } catch (error) {
                console.error('Error reading note file:', file, error);
            }
        }
        
        console.log('Final notes list:', notes);
        return notes.sort((a, b) => b.created - a.created);
        
    } catch (error) {
        console.error('Error in getNotes:', error);
        throw error;
    }
}

// Add function to list all saved notes (for debugging)
export async function listAllNotes(): Promise<void> {
    try {
        await ensureDirectories();
        const files = await fs.readdir(NOTES_DIR);
        console.log('All note files:', files);
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(NOTES_DIR, file);
                const content = await fs.readFile(filePath, 'utf8');
                console.log(`Note ${file}:`, content);
            }
        }
    } catch (error) {
        console.error('Error listing all notes:', error);
    }
}

export async function deleteNote(id: string, sender: string): Promise<boolean> {
    try {
        const filePath = path.join(NOTES_DIR, `${id}.json`);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        
        if (exists) {
            const content = await fs.readFile(filePath, 'utf-8');
            const note = JSON.parse(content) as Note;
            
            if (note.sender === sender) {
                await fs.unlink(filePath);
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Error deleting note:', error);
        return false;
    }
}

// Add this function to check if directories exist
export async function checkNoteDirectories(): Promise<void> {
    try {
        const dataExists = await fs.access(DATA_DIR).then(() => true).catch(() => false);
        const notesExists = await fs.access(NOTES_DIR).then(() => true).catch(() => false);
        console.log('Directory status:', { 
            DATA_DIR, 
            NOTES_DIR, 
            dataExists, 
            notesExists 
        });
    } catch (error) {
        console.error('Error checking directories:', error);
    }
}

// Add function to get a single note
export async function getNote(id: string): Promise<Note | null> {
    try {
        const filePath = path.join(NOTES_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content) as Note;
    } catch (error) {
        console.error('Error getting note:', error);
        return null;
    }
} 