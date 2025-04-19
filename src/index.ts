import { Boom } from '@hapi/boom'
import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    WAMessage,
    makeInMemoryStore,
    proto
} from '@whiskeysockets/baileys'
import { join } from 'path'
import { handleMessage } from './handlers/messageHandler'
import { loadReminders, saveReminder } from './storage/reminderStorage'
import { startReminderChecker } from './utils/reminderChecker'
import * as dotenv from 'dotenv'

dotenv.config()

// Add your number here (the one you'll use for the bot)
const BOT_NUMBER = 'your_number@s.whatsapp.net' // Replace with your number, e.g., '1234567890@s.whatsapp.net'

const store = makeInMemoryStore({})
store?.readFromFile('./baileys_store.json')
setInterval(() => {
    store?.writeToFile('./baileys_store.json')
}, 10000)

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        getMessage: async (key) => {
            return { conversation: 'hello' }
        }
    })

    store?.bind(sock.ev)

    // Start the reminder checker
    startReminderChecker(sock)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            
            if (shouldReconnect) {
                connectToWhatsApp()
            }
        }
        
        console.log('Connection update:', update)
    })

    sock.ev.on('creds.update', saveCreds)

    // Update message handler with more logging
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log('Received message update:', { type, messageCount: messages.length });
        
        if (type === 'notify') {
            for (const message of messages) {
                console.log('Processing message:', {
                    fromMe: message.key.fromMe,
                    remoteJid: message.key.remoteJid,
                    messageText: message.message?.conversation || message.message?.extendedTextMessage?.text
                });
                
                if (sock.user?.id) {
                    await handleMessage(sock, message, sock.user.id);
                } else {
                    console.error('Bot user ID not available');
                }
            }
        }
    })

    return sock
}

// Start the WhatsApp connection
connectToWhatsApp().catch(err => console.error('Error in main:', err))
