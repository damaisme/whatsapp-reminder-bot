import { proto, WASocket } from '@whiskeysockets/baileys'
import moment from 'moment'
import { Reminder } from '../types/reminder'
import { saveReminder, getReminders, removeReminder } from '../storage/reminderStorage'
import { isValidCronExpression, getNextCronTime, formatCronDescription } from '../utils/cronHelper'
import { IdManager } from '../utils/idManager'
import { Note } from '../types/note'
import { saveNote, getNotes, getNote, deleteNote, searchNotes } from '../storage/noteStorage'
import { saveNote as noteHelperSaveNote, getNotes as noteHelperGetNotes, listAllNotes } from '../utils/noteHelper'

// Add this at the top of the file
interface PendingNote {
    id: string;
    title: string;
    created: number;
    tags: string[];
}

// Map to track notes waiting for content: sender -> note
const pendingNotes: Map<string, PendingNote> = new Map();

export async function handleMessage(sock: WASocket, message: proto.IWebMessageInfo, botNumber: string) {
    try {
        // Get chat ID and message text
        const chat = message.key.remoteJid!;
        const messageText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';

        // Debug logs
        console.log('Received message:', {
            messageText,
            chat,
            fromMe: message.key.fromMe,
            participant: message.key.participant,
            remoteJid: message.key.remoteJid,
            botNumber: botNumber
        });

        if (!messageText) return;

        // Clean up bot number - remove the :xx@s.whatsapp.net part
        const cleanBotNumber = botNumber.split(':')[0].split('@')[0];

        // Get sender ID
        let sender: string;
        if (message.key.fromMe) {
            sender = cleanBotNumber;
        } else if (message.key.participant) {
            // Group chat
            sender = message.key.participant.split('@')[0];
        } else {
            // Private chat
            sender = message.key.remoteJid!.split('@')[0];
        }

        console.log('Processed sender:', sender);

        // Check if there's a pending note waiting for content
        const pendingNote = pendingNotes.get(sender);
        if (pendingNote && !messageText.startsWith('!')) {
            // This message is the content for the pending note
            console.log('Processing content for pending note:', pendingNote);
            
            const note: Note = {
                id: pendingNote.id,
                sender,
                chat,
                title: pendingNote.title,
                content: messageText,
                created: pendingNote.created,
                updated: Date.now(),
                tags: pendingNote.tags
            };

            try {
                console.log('Saving note with content:', note);
                await saveNote(note);
                console.log('Note saved successfully');
                
                await sock.sendMessage(chat, {
                    text: `✅ Note #${note.id} saved with content:\n${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`
                });
                
                // Remove the pending note after successful save
                pendingNotes.delete(sender);
            } catch (error: any) {
                console.error('Error saving note content:', error);
                await sock.sendMessage(chat, {
                    text: `❌ Error saving note content: ${error?.message || 'Unknown error'}`
                });
            }

            return;
        }

        const command = messageText.toLowerCase().trim();
        console.log('Processing command:', command);

        // Handle help commands
        if (command === '!help') {
            await sock.sendMessage(chat, {
                text: `Available commands:\n\n` +
                    `*Reminder Commands*\n` +
                    `!remind help - Show reminder help\n` +
                    `!remind add <time> <message> - Add a one-time reminder\n` +
                    `!remind cron "<cron>" <message> - Add a recurring reminder\n` +
                    `!remind list - List all your reminders\n` +
                    `!remind delete <id> - Delete a reminder\n\n` +
                    `*Note Commands*\n` +
                    `!note help - Show note help\n` +
                    `!note add <title> - Add a new note\n` +
                    `!note list - List all your notes\n` +
                    `!note show <id> - Show a specific note\n` +
                    `!note delete <id> - Delete a note\n` +
                    `!note search <query> - Search your notes`
            });
            return;
        }

        // Process reminder commands
        if (command.startsWith('!remind')) {
            console.log('Handling reminder command');
            if (command === '!remind' || command === '!remind help') {
                await sock.sendMessage(chat, {
                    text: `*Reminder Commands*\n\n` +
                        `!remind add <time> <message>\n` +
                        `Example: !remind add 5m Buy groceries\n` +
                        `Time format: 1d (1 day), 2h (2 hours), 30m (30 minutes)\n\n` +
                        `!remind cron "<cron>" <message>\n` +
                        `Example: !remind cron "0 9 * * *" Good morning!\n\n` +
                        `!remind list - Show your reminders\n` +
                        `!remind delete <id> - Delete a reminder`
                });
                return;
            }
            
            if (command.startsWith('!remind add')) {
                await handleAddReminder(sock, chat, messageText, sender);
            } else if (command.startsWith('!remind cron')) {
                await handleCronReminder(sock, chat, messageText, sender);
            } else if (command === '!remind list') {
                await handleListReminders(sock, chat, sender);
            } else if (command.startsWith('!remind delete')) {
                await handleDeleteReminder(sock, chat, messageText, sender);
            }
        } 
        // Process note commands
        else if (command.startsWith('!note')) {
            console.log('Processing note command:', command);
            
            if (command.startsWith('!note add')) {
                await handleAddNote(sock, chat, messageText, sender);
            } else if (command === '!note list') {
                await handleListNotes(sock, chat, sender);
            } else if (command.startsWith('!note show')) {
                await handleShowNote(sock, chat, messageText, sender);
            } else {
                await sock.sendMessage(chat, {
                    text: 'Available note commands:\n' +
                         '!note add <title> - Add a new note\n' +
                         '!note list - List all notes\n' +
                         '!note show <id> - Show a specific note'
                });
            }
        }

    } catch (error: any) {
        console.error('Error in handleMessage:', error);
        try {
            await sock.sendMessage(message.key.remoteJid!, {
                text: `❌ Error: ${error?.message || 'Unknown error'}`
            });
        } catch (sendError) {
            console.error('Error sending error message:', sendError);
        }
    }
}

async function handleAddReminder(sock: WASocket, chat: string, message: string, sender: string) {
    console.log('handleAddReminder called with:', { chat, message, sender });

    try {
        const parts = message.split(' ');
        if (parts.length < 4) {
            await sock.sendMessage(chat, { 
                text: 'Usage: !remind add <time> <message>\n' +
                     'Example: !remind add 2h30m Buy groceries'
            });
            return;
        }

        const timeStr = parts[2];
        const reminderText = parts.slice(3).join(' ');
        const reminderTime = parseTimeString(timeStr);

        console.log('Parsed reminder:', { timeStr, reminderText, reminderTime });

        if (!reminderTime) {
            await sock.sendMessage(chat, { 
                text: 'Invalid time format. Use combinations of:\n' +
                     'd (days), h (hours), m (minutes)\n' +
                     'Example: 2h30m'
            });
            return;
        }

        const id = await IdManager.nextId();
        const cleanBotNumber = sock.user?.id.split(':')[0].split('@')[0] || '';
        
        const reminder: Reminder = {
            id,
            chat,
            sender,
            botNumber: cleanBotNumber,
            message: reminderText,
            time: reminderTime.valueOf(),
            created: Date.now()
        };

        console.log('Saving reminder:', reminder);

        await saveReminder(reminder);
        await sock.sendMessage(chat, { 
            text: `✅ One-time reminder set [#${id}]\n` +
                 `Time: ${moment(reminderTime).format('MMMM Do YYYY, h:mm:ss a')}\n` +
                 `Message: ${reminderText}`
        });

    } catch (error) {
        console.error('Error in handleAddReminder:', error);
        await sock.sendMessage(chat, { 
            text: '❌ Error setting reminder. Please try again.' 
        });
    }
}

async function handleCronReminder(sock: WASocket, chat: string, message: string, sender: string) {
    if (!sock.user) {
        console.error('Socket user is not defined');
        await sock.sendMessage(chat, { 
            text: '❌ Error: Bot is not properly initialized'
        });
        return;
    }

    const cronMatch = message.match(/!remind cron "(.*?)" (.+)/)
    if (!cronMatch) {
        await sock.sendMessage(chat, { 
            text: 'Invalid command format.\n\n' +
                 'Correct format:\n' +
                 '!remind cron "<cron_expression>" <message>\n\n' +
                 'Examples:\n' +
                 '!remind cron "*/5 * * * *" check every 5 minutes\n' +
                 '!remind cron "0 8 * * *" daily morning reminder'
        })
        return
    }

    const [, cronExp, reminderText] = cronMatch

    if (!isValidCronExpression(cronExp)) {
        await sock.sendMessage(chat, { 
            text: '❌ Invalid cron expression.\n\n' +
                 'Valid examples:\n' +
                 '*/5 * * * * = every 5 minutes\n' +
                 '0 * * * * = every hour\n' +
                 '0 8 * * * = every day at 8 AM\n' +
                 '30 9 * * 1-5 = weekdays at 9:30 AM'
        })
        return
    }

    const nextTrigger = getNextCronTime(cronExp)
    const id = await IdManager.nextId()

    const reminder: Reminder = {
        id,
        chat,
        sender,
        botNumber: sock.user.id.split('@')[0],
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
}

async function handleListReminders(sock: WASocket, chat: string, sender: string) {
    const reminders = await getReminders(chat, sender)
    if (reminders.length === 0) {
        await sock.sendMessage(chat, { text: 'No active reminders.' })
        return
    }

    const reminderList = reminders
        .map((r, i) => {
            const time = r.cronExpression 
                ? formatCronDescription(r.cronExpression)
                : moment(r.time).format('MMM Do, h:mm a')
            return `${i + 1}. [#${r.id}] ${time}\n   ${r.message}`
        })
        .join('\n\n')

    await sock.sendMessage(chat, { 
        text: '📝 Your Reminders:\n\n' + reminderList
    })
}

async function handleDeleteReminder(sock: WASocket, chat: string, message: string, sender: string) {
    const id = message.split(' ')[2]
    if (!id) {
        await sock.sendMessage(chat, { text: 'Usage: !remind delete <id>' })
        return
    }

    const success = await removeReminder(id, chat, sender)
    if (success) {
        await sock.sendMessage(chat, { text: '✅ Reminder deleted successfully.' })
    } else {
        await sock.sendMessage(chat, { text: '❌ Reminder not found.' })
    }
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

async function handleAddNote(sock: WASocket, chat: string, message: string, sender: string) {
    console.log('handleAddNote called with:', { chat, message, sender });
    
    try {
        const content = message.substring('!note add '.length).trim();
        
        if (!content) {
            await sock.sendMessage(chat, {
                text: 'Usage: !note add <title>\n' +
                     'Example: !note add Shopping List #todo'
            });
            return;
        }

        // Use IdManager to get sequential IDs
        const id = await IdManager.nextId();
        const now = Date.now();
        
        // Extract tags before creating note
        const words = content.split(' ');
        const tags = words.filter(word => word.startsWith('#')).map(tag => tag.substring(1));
        const title = words.filter(word => !word.startsWith('#')).join(' ');

        console.log('Creating note with:', { id, title, tags });

        // Store the pending note
        pendingNotes.set(sender, {
            id,
            title,
            created: now,
            tags
        });

        await sock.sendMessage(chat, {
            text: `✅ Note #${id} created with title: ${title}\n` +
                 `Tags: ${tags.length > 0 ? tags.map(t => '#' + t).join(' ') : 'No tags'}\n\n` +
                 `Please send the note content in your next message.`
        });

    } catch (error: any) {
        console.error('Error in handleAddNote:', error);
        await sock.sendMessage(chat, {
            text: `❌ Error creating note: ${error?.message || 'Unknown error'}\nPlease try again.`
        });
    }
}

async function handleListNotes(sock: WASocket, chat: string, sender: string) {
    console.log('handleListNotes called with:', { chat, sender });
    
    try {
        console.log('Fetching notes...');
        const notes = await getNotes(chat, sender);
        console.log('Fetched notes:', notes);
        
        if (!notes || notes.length === 0) {
            await sock.sendMessage(chat, {
                text: 'You have no saved notes in this chat.'
            });
            return;
        }

        // Constants for formatting
        const MAX_TITLE_LENGTH = 30;
        const MAX_CONTENT_LENGTH = 50;

        const notesList = notes.map(note => {
            // Truncate title if too long
            const title = note.title.length > MAX_TITLE_LENGTH 
                ? note.title.substring(0, MAX_TITLE_LENGTH) + '...'
                : note.title;

            // Truncate content if too long
            const content = note.content.length > MAX_CONTENT_LENGTH
                ? note.content.substring(0, MAX_CONTENT_LENGTH) + '...'
                : note.content;

            // Format tags
            const tags = note.tags?.length > 0 
                ? note.tags.map(t => '#' + t).join(' ') 
                : '';

            return `📝 #${note.id} ${title}${tags ? '\n' + tags : ''}\n${content}`;
        }).join('\n\n');

        await sock.sendMessage(chat, {
            text: `*Your Notes:*\n\n${notesList}\n\n` +
                 'Use !note show <id> to view full note'
        });

    } catch (error: any) {
        console.error('Error in handleListNotes:', error);
        await sock.sendMessage(chat, {
            text: `❌ Error listing notes: ${error?.message || 'Unknown error'}`
        });
    }
}

async function handleShowNote(sock: WASocket, chat: string, message: string, sender: string) {
    try {
        const id = message.substring('!note show '.length).trim();
        
        if (!id) {
            await sock.sendMessage(chat, {
                text: 'Usage: !note show <id>'
            });
            return;
        }

        console.log('Fetching note:', { id, sender, chat });
        const note = await getNote(id, sender, chat);
        
        if (!note) {
            await sock.sendMessage(chat, {
                text: `❌ Note #${id} not found`
            });
            return;
        }

        await sock.sendMessage(chat, {
            text: `📝 *Note #${note.id}*\n` +
                 `Title: ${note.title}\n` +
                 `Created: ${new Date(note.created).toLocaleString()}\n` +
                 `Tags: ${note.tags?.length > 0 ? note.tags.map(t => '#' + t).join(' ') : 'No tags'}\n\n` +
                 `${note.content}`
        });

    } catch (error: any) {
        console.error('Error in handleShowNote:', error);
        await sock.sendMessage(chat, {
            text: `❌ Error showing note: ${error?.message || 'Unknown error'}`
        });
    }
}

async function handleDeleteNote(sock: WASocket, chat: string, message: string, sender: string) {
    const id = message.split(' ')[2]
    if (!id) {
        await sock.sendMessage(chat, { text: 'Usage: !note delete <id>' })
        return
    }

    const success = await deleteNote(id, chat, sender)
    if (success) {
        await sock.sendMessage(chat, { text: '✅ Note deleted successfully.' })
    } else {
        await sock.sendMessage(chat, { text: '❌ Note not found.' })
    }
}

async function handleSearchNotes(sock: WASocket, chat: string, message: string, sender: string) {
    const query = message.substring('!note search '.length).trim()
    if (!query) {
        await sock.sendMessage(chat, { text: 'Usage: !note search <query>' })
        return
    }

    const notes = await searchNotes(chat, sender, query)
    if (notes.length === 0) {
        await sock.sendMessage(chat, { text: 'No matching notes found.' })
        return
    }

    const results = notes
        .map(note => {
            const tags = note.tags?.length ? ' ' + note.tags.map(t => '#' + t).join(' ') : ''
            return `📝 [#${note.id}] ${note.title}${tags}`
        })
        .join('\n')

    await sock.sendMessage(chat, { 
        text: `*Search Results:*\n\n${results}\n\nUse !note show <id> to view a note.`
    })
}

export { handleAddNote, handleListNotes, handleShowNote }; 