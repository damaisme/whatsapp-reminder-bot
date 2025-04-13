import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const ID_FILE = join(__dirname, '../data/lastId.txt');

export class IdManager {
    private static async getLastId(): Promise<number> {
        try {
            const id = await readFile(ID_FILE, 'utf-8');
            return parseInt(id) || 0;
        } catch {
            return 0;
        }
    }

    private static async saveLastId(id: number): Promise<void> {
        await writeFile(ID_FILE, id.toString());
    }

    static async nextId(): Promise<string> {
        const lastId = await this.getLastId();
        const newId = lastId + 1;
        
        // Reset to 1 if we reach 999
        const finalId = newId > 999 ? 1 : newId;
        
        await this.saveLastId(finalId);
        return finalId.toString();
    }
} 