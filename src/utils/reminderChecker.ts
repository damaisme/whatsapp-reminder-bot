import { WASocket } from '@whiskeysockets/baileys'
import { loadReminders } from '../storage/reminderStorage'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import moment from 'moment'
import { getNextCronTime } from './cronHelper'

const STORAGE_FILE = join(__dirname, '../data/reminders.json')
const CHECK_INTERVAL = 10 * 1000 // 30 seconds

export async function startReminderChecker(sock: WASocket) {
    console.log('Initializing reminder checker...')

    // Immediate first check
    await checkReminders(sock)

    // Then start the interval
    setInterval(async () => {
        await checkReminders(sock)
    }, CHECK_INTERVAL)
}

async function checkReminders(sock: WASocket) {
    try {
        console.log('Checking reminders at:', new Date().toISOString())
        
        const reminders = await loadReminders()
        const now = Date.now()
        let updatedReminders = [...reminders]
        const dueReminders = reminders.filter(reminder => reminder.time <= now)

        for (const reminder of dueReminders) {
            try {
                console.log(`Processing reminder ${reminder.id} for chat ${reminder.chat}`)

                // Send the reminder message
                const reminderMessage = `⏰ *Reminder*\n\n${reminder.message}`
                
                await sock.sendMessage(reminder.chat, {
                    text: reminderMessage
                })

                // Handle recurring reminders
                if (reminder.cronExpression) {
                    const nextTrigger = getNextCronTime(reminder.cronExpression)
                    if (nextTrigger > now) {
                        // Update the reminder with next trigger time
                        updatedReminders = updatedReminders.map(r => 
                            r.id === reminder.id 
                                ? { ...r, time: nextTrigger, lastTriggered: now }
                                : r
                        )
                    }
                } else {
                    // Remove one-time reminder
                    updatedReminders = updatedReminders.filter(r => r.id !== reminder.id)
                }

            } catch (error) {
                console.error(`Error processing reminder ${reminder.id}:`, error)
            }
        }

        // Update storage with updated reminders
        if (dueReminders.length > 0) {
            await writeFile(STORAGE_FILE, JSON.stringify(updatedReminders, null, 2))
        }

    } catch (error) {
        console.error('Error in checkReminders:', error)
    }
} 