import { proto, WASocket } from '@whiskeysockets/baileys'
import moment from 'moment'
import { Reminder } from '../types/reminder'
import { saveReminder, getReminders, removeReminder } from '../storage/reminderStorage'
import { isValidCronExpression, getNextCronTime, formatCronDescription } from '../utils/cronHelper'
import { IdManager } from '../utils/idManager'

export async function handleMessage(sock: WASocket, message: proto.IWebMessageInfo, botNumber: string) {
    const chat = message.key.remoteJid!
    const messageText = message.message?.conversation || message.message?.extendedTextMessage?.text || ''

    if (!messageText) return

    const command = messageText.toLowerCase().trim()

    // Add test command
    if (command === '!testnotify') {
        try {
            console.log('Testing notification in chat:', chat)
            
            // Send test message
            await sock.sendMessage(chat, {
                text: '⏰ *Test Notification*\nTesting the notification system...'
            })
            
            // Wait 1 second
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // Send notify command
            await sock.sendMessage(chat, {
                text: '/notify'
            })
            
            console.log('Test notification completed')
        } catch (error) {
            console.error('Error in test notification:', error)
            await sock.sendMessage(chat, { text: '❌ Error testing notification' })
        }
        return
    }

    // Skip if not a command
    if (!command.startsWith('!')) return

    // Don't process commands in group chats (optional - remove if you want group chat support)
    if (chat.endsWith('@g.us')) return

    try {
        if (command.startsWith('!remind')) {
            await handleRemindCommand(sock, chat, messageText, botNumber)
        } else if (command === '!list') {
            await listReminders(sock, chat, botNumber)
        } else if (command.startsWith('!delete')) {
            await handleDeleteCommand(sock, chat, messageText, botNumber)
        } else if (command === '!help') {
            await showHelp(sock, chat)
        }
    } catch (error) {
        console.error('Error handling command:', error)
        await sock.sendMessage(chat, { text: '❌ Error processing command' })
    }
}

async function handleRemindCommand(sock: WASocket, chat: string, message: string, botNumber: string) {
    const parts = message.split(' ')
    
    // Debug log
    console.log('Received command parts:', parts)

    if (parts[1].toLowerCase() === 'cron') {
        // Extract the cron expression and message using a more reliable method
        const fullMessage = message.trim()
        const cronRegex = /!remind cron "([^"]+)" (.+)/
        const match = fullMessage.match(cronRegex)

        console.log('Full message:', fullMessage)
        console.log('Cron match:', match)

        if (!match) {
            await sock.sendMessage(chat, { 
                text: 'Invalid command format.\n\n' +
                     'Correct format:\n' +
                     '!remind cron "* * * * *" your message\n\n' +
                     'Examples:\n' +
                     '!remind cron "*/5 * * * *" check every 5 minutes\n' +
                     '!remind cron "0 8 * * *" daily morning reminder'
            })
            return
        }

        const cronExp = match[1].trim()
        const reminderText = match[2].trim()

        console.log('Parsed cron expression:', cronExp)
        console.log('Parsed reminder text:', reminderText)

        // Validate cron expression
        if (!isValidCronExpression(cronExp)) {
            await sock.sendMessage(chat, { 
                text: '❌ Invalid cron expression.\n\n' +
                     'Common patterns:\n' +
                     '"* * * * *" = every minute\n' +
                     '"*/5 * * * *" = every 5 minutes\n' +
                     '"0 * * * *" = every hour\n' +
                     '"0 8 * * *" = every day at 8 AM\n' +
                     '"30 9 * * 1-5" = weekdays at 9:30 AM\n\n' +
                     'Format: minute hour day-of-month month day-of-week'
            })
            return
        }

        const nextTrigger = getNextCronTime(cronExp)
        const id = await IdManager.nextId()
        
        const reminder: Reminder = {
            id,
            chat: chat,
            botNumber: botNumber,
            message: reminderText,
            time: nextTrigger,
            created: Date.now(),
            cronExpression: cronExp,
            lastTriggered: 0
        }

        await saveReminder(reminder)
        await sock.sendMessage(chat, { 
            text: `✅ Recurring reminder set [#${id}]\n` +
                 `Message: ${reminderText}\n` +
                 `Schedule: ${formatCronDescription(cronExp)}\n` +
                 `Next trigger: ${moment(nextTrigger).format('MMMM Do YYYY, h:mm:ss a')}`
        })
    } else {
        // Handle one-time reminder (existing code)
        const timeStr = parts[1]
        const reminderText = parts.slice(2).join(' ')
        const reminderTime = parseTimeString(timeStr)

        if (!reminderTime) {
            await sock.sendMessage(chat, { 
                text: 'Invalid time format. Use combinations of d (days), h (hours), m (minutes)\nExample: 2h30m'
            })
            return
        }

        const id = await IdManager.nextId()

        const reminder: Reminder = {
            id,
            chat: chat,
            botNumber: botNumber,
            message: reminderText,
            time: reminderTime.valueOf(),
            created: Date.now()
        }

        await saveReminder(reminder)
        await sock.sendMessage(chat, { 
            text: `✅ One-time reminder set [#${id}]\n` +
                 `Time: ${moment(reminderTime).format('MMMM Do YYYY, h:mm:ss a')}\n` +
                 `Message: ${reminderText}`
        })
    }
}

async function listReminders(sock: WASocket, chat: string, botNumber: string) {
    const reminders = await getReminders(chat, botNumber)
    if (reminders.length === 0) {
        await sock.sendMessage(chat, { text: 'No active reminders in this chat.' })
        return
    }

    const reminderList = reminders
        .map((r, i) => `${i + 1}. [${r.id}] ${moment(r.time).format('MMM Do, h:mm a')} - ${r.message}`)
        .join('\n')

    await sock.sendMessage(chat, { text: '📝 Reminders in this chat:\n\n' + reminderList })
}

async function handleDeleteCommand(sock: WASocket, chat: string, message: string, botNumber: string) {
    const parts = message.split(' ')
    if (parts.length !== 2) {
        await sock.sendMessage(chat, { text: 'Usage: !delete <reminder_id>' })
        return
    }

    const reminderId = parts[1]
    const success = await removeReminder(reminderId, chat, botNumber)

    if (success) {
        await sock.sendMessage(chat, { text: '✅ Reminder deleted successfully.' })
    } else {
        await sock.sendMessage(chat, { text: '❌ Reminder not found or you don\'t have permission to delete it.' })
    }
}

async function showHelp(sock: WASocket, chat: string) {
    const helpText = `
🤖 *WhatsApp Reminder Bot Commands*

!remind <time> <message>
Set a new reminder
Example: !remind 2h30m Buy groceries

!list
Show all your active reminders

!delete <reminder_id>
Delete a specific reminder
Example: !delete 123456789

!help
Show this help message

*Time Format Examples:*
30m = 30 minutes
2h = 2 hours
1d = 1 day
2h30m = 2 hours and 30 minutes
1d12h = 1 day and 12 hours
    `.trim()

    await sock.sendMessage(chat, { text: helpText })
}

function parseTimeString(timeStr: string): Date | null {
    const regex = /(\d+)([dhm])/g
    let totalMinutes = 0
    let match

    while ((match = regex.exec(timeStr)) !== null) {
        const value = parseInt(match[1])
        const unit = match[2]

        switch (unit) {
            case 'd':
                totalMinutes += value * 24 * 60
                break
            case 'h':
                totalMinutes += value * 60
                break
            case 'm':
                totalMinutes += value
                break
        }
    }

    if (totalMinutes === 0) return null

    const futureDate = new Date()
    futureDate.setMinutes(futureDate.getMinutes() + totalMinutes)
    return futureDate
} 