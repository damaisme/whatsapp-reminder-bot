import fs from 'fs/promises';
import path from 'path';

// Use ./data for storage
const DATA_DIR = path.join('.', 'data');
const ID_FILE = path.join(DATA_DIR, 'lastId.txt');

export class IdManager {
    static async nextId(): Promise<string> {
        try {
            // Create data directory if it doesn't exist
            await fs.mkdir(DATA_DIR, { recursive: true });
            
            // Read current ID or start from 0
            let currentId = 0;
            try {
                const data = await fs.readFile(ID_FILE, 'utf8');
                currentId = parseInt(data);
            } catch (error) {
                // File doesn't exist or other error, start from 0
            }

            // Increment ID
            currentId++;

            // Save new ID
            await fs.writeFile(ID_FILE, currentId.toString());

            return currentId.toString();
        } catch (error) {
            console.error('Error generating ID:', error);
            throw error;
        }
    }
} 