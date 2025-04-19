import fs from 'fs/promises'
import path from 'path'
import { Reminder } from '../types/reminder'

// Use ./data for storage
const DATA_DIR = path.join('.', 'data')
const REMINDERS_DIR = path.join(DATA_DIR, 'reminders')

// Ensure directories exist
async function ensureDirectories() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true })
        await fs.mkdir(REMINDERS_DIR, { recursive: true })
        console.log('Directories created/verified:', { DATA_DIR, REMINDERS_DIR })
    } catch (error) {
        console.error('Error creating directories:', error)
        throw error
    }
}

export async function loadReminders(): Promise<Reminder[]> {
    try {
        const data = await fs.readFile(path.join(REMINDERS_DIR, 'all.json'), 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        return []
    }
}

export async function saveReminder(reminder: Reminder): Promise<void> {
    try {
        await ensureDirectories()
        
        const filePath = path.join(REMINDERS_DIR, `${reminder.id}.json`)
        console.log('Saving reminder to:', filePath)
        
        await fs.writeFile(filePath, JSON.stringify(reminder, null, 2), 'utf8')
        console.log('Reminder saved successfully')
    } catch (error) {
        console.error('Error in saveReminder:', error)
        throw error
    }
}

export async function getReminders(chat: string, sender: string): Promise<Reminder[]> {
    try {
        await ensureDirectories()
        
        const files = await fs.readdir(REMINDERS_DIR)
        const reminders: Reminder[] = []
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue
            
            try {
                const filePath = path.join(REMINDERS_DIR, file)
                const content = await fs.readFile(filePath, 'utf8')
                const reminder = JSON.parse(content) as Reminder
                
                if (reminder.chat === chat && reminder.sender === sender) {
                    reminders.push(reminder)
                }
            } catch (error) {
                console.error('Error reading reminder file:', file, error)
            }
        }
        
        return reminders
    } catch (error) {
        console.error('Error in getReminders:', error)
        return []
    }
}

export async function removeReminder(id: string, chat: string, sender: string): Promise<boolean> {
    try {
        const filePath = path.join(REMINDERS_DIR, `${id}.json`)
        
        try {
            const content = await fs.readFile(filePath, 'utf8')
            const reminder = JSON.parse(content) as Reminder
            
            if (reminder.chat === chat && reminder.sender === sender) {
                await fs.unlink(filePath)
                return true
            }
        } catch (error) {
            console.error('Error reading reminder file:', error)
        }
        
        return false
    } catch (error) {
        console.error('Error in removeReminder:', error)
        return false
    }
}
