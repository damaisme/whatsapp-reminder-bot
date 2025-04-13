import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { Reminder } from '../types/reminder'

const STORAGE_FILE = join(__dirname, '../data/reminders.json')

export async function loadReminders(): Promise<Reminder[]> {
    try {
        const data = await readFile(STORAGE_FILE, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        return []
    }
}

export async function saveReminder(reminder: Reminder): Promise<void> {
    const reminders = await loadReminders()
    reminders.push(reminder)
    await writeFile(STORAGE_FILE, JSON.stringify(reminders, null, 2))
}

export async function getReminders(chat: string, botNumber: string): Promise<Reminder[]> {
    const reminders = await loadReminders()
    return reminders.filter(r => 
        r.chat === chat && 
        r.botNumber === botNumber && 
        r.time > Date.now()
    )
}

export async function removeReminder(id: string, chat: string, botNumber: string): Promise<boolean> {
    const reminders = await loadReminders()
    const index = reminders.findIndex(r => 
        r.id === id && 
        r.chat === chat && 
        r.botNumber === botNumber
    )
    
    if (index === -1) return false
    
    reminders.splice(index, 1)
    await writeFile(STORAGE_FILE, JSON.stringify(reminders, null, 2))
    return true
}
