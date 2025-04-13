export interface Reminder {
    id: string;  // Now using simple incremental IDs (1-999)
    chat: string;
    botNumber: string;
    message: string;
    time: number;
    created: number;
    cronExpression?: string; // Optional cron expression for recurring reminders
    lastTriggered?: number; // Track last trigger time for recurring reminders
} 