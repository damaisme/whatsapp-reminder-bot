// Import the entire module
import cronParser = require('cron-parser');

interface CronField {
    min: number;
    max: number;
    value: string;
}

class CronParser {
    private static validateField(field: string, min: number, max: number): boolean {
        if (field === '*') return true;
        if (field.startsWith('*/')) {
            const step = parseInt(field.substring(2));
            return !isNaN(step) && step > 0 && step <= max;
        }
        const num = parseInt(field);
        return !isNaN(num) && num >= min && num <= max;
    }

    private static getNextValue(field: CronField, current: number): number {
        if (field.value === '*') return current;
        if (field.value.startsWith('*/')) {
            const step = parseInt(field.value.substring(2));
            return Math.ceil(current / step) * step;
        }
        return parseInt(field.value);
    }

    static parseExpression(cronExp: string): { next: () => Date } {
        const fields = cronExp.trim().split(' ');
        if (fields.length !== 5) {
            throw new Error('Invalid cron expression format');
        }

        const [minute, hour, dayMonth, month, dayWeek] = fields;

        // Validate each field
        if (!this.validateField(minute, 0, 59)) throw new Error('Invalid minute');
        if (!this.validateField(hour, 0, 23)) throw new Error('Invalid hour');
        if (!this.validateField(dayMonth, 1, 31)) throw new Error('Invalid day of month');
        if (!this.validateField(month, 1, 12)) throw new Error('Invalid month');
        if (!this.validateField(dayWeek, 0, 6)) throw new Error('Invalid day of week');

        return {
            next: () => {
                const now = new Date();
                const next = new Date(now);

                // Handle */n format for minutes
                if (minute.startsWith('*/')) {
                    const step = parseInt(minute.substring(2));
                    next.setMinutes(Math.ceil(now.getMinutes() / step) * step);
                    if (next <= now) {
                        next.setMinutes(next.getMinutes() + step);
                    }
                } else if (minute !== '*') {
                    const min = parseInt(minute);
                    next.setMinutes(min);
                    if (next <= now) {
                        next.setHours(next.getHours() + 1);
                    }
                }

                // Handle hour
                if (hour !== '*') {
                    const hr = parseInt(hour);
                    next.setHours(hr);
                    if (next <= now) {
                        next.setDate(next.getDate() + 1);
                    }
                }

                return next;
            }
        };
    }
}

export function isValidCronExpression(cronExp: string): boolean {
    try {
        const fields = cronExp.trim().split(' ');
        if (fields.length !== 5) return false;

        // Validate each field
        return validateCronField(fields[0], 0, 59) && // minute
               validateCronField(fields[1], 0, 23) && // hour
               validateCronField(fields[2], 1, 31) && // day of month
               validateCronField(fields[3], 1, 12) && // month
               validateCronField(fields[4], 0, 6);    // day of week
    } catch (err) {
        console.error('Cron validation error:', err);
        return false;
    }
}

function validateCronField(field: string, min: number, max: number): boolean {
    if (field === '*') return true;
    if (field.includes(',')) {
        return field.split(',').every(f => validateCronField(f, min, max));
    }
    if (field.includes('-')) {
        const [start, end] = field.split('-').map(Number);
        return !isNaN(start) && !isNaN(end) && 
               start >= min && start <= max && 
               end >= min && end <= max && 
               start <= end;
    }
    if (field.startsWith('*/')) {
        const step = parseInt(field.substring(2));
        return !isNaN(step) && step > 0 && step <= max;
    }
    const num = parseInt(field);
    return !isNaN(num) && num >= min && num <= max;
}

export function getNextCronTime(cronExp: string): number {
    const fields = cronExp.trim().split(' ');
    const [minuteStr, hourStr, dayMonthStr, monthStr, dayWeekStr] = fields;

    const now = new Date();
    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // Handle specific cases
    if (minuteStr === '*' && hourStr === '*') {
        // Every minute
        next.setMinutes(now.getMinutes() + 1);
        return next.getTime();
    }

    if (minuteStr.startsWith('*/')) {
        // Every X minutes
        const step = parseInt(minuteStr.substring(2));
        const currentMinute = now.getMinutes();
        const nextMinute = Math.ceil(currentMinute / step) * step;
        next.setMinutes(nextMinute);
        if (next <= now) {
            next.setMinutes(next.getMinutes() + step);
        }
        return next.getTime();
    }

    // Handle specific day of week
    if (dayWeekStr !== '*') {
        const targetDay = parseInt(dayWeekStr);
        const currentDay = now.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        
        next.setDate(now.getDate() + daysToAdd);
        next.setHours(parseInt(hourStr));
        next.setMinutes(parseInt(minuteStr));

        if (next <= now) {
            next.setDate(next.getDate() + 7);
        }
        return next.getTime();
    }

    // Handle specific time
    if (minuteStr !== '*' && hourStr !== '*') {
        next.setHours(parseInt(hourStr));
        next.setMinutes(parseInt(minuteStr));
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }
        return next.getTime();
    }

    return next.getTime();
}

export function formatCronDescription(cronExp: string): string {
    const [minute, hour, dayMonth, month, dayWeek] = cronExp.split(' ');
    
    const formatTime = (h: string, m: string) => {
        const hour24 = parseInt(h);
        const minute = parseInt(m);
        const period = hour24 >= 12 ? 'PM' : 'AM';
        const hour12 = hour24 % 12 || 12;
        return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
    };

    const getDayName = (day: string): string => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[parseInt(day)];
    };

    if (minute === '0' && hour !== '*') {
        if (dayWeek !== '*') {
            if (dayWeek.includes('-')) {
                const [start, end] = dayWeek.split('-');
                return `every ${getDayName(start)} to ${getDayName(end)} at ${formatTime(hour, '0')}`;
            } else if (dayWeek.includes(',')) {
                const days = dayWeek.split(',').map(d => getDayName(d)).join(' and ');
                return `every ${days} at ${formatTime(hour, '0')}`;
            } else {
                return `every ${getDayName(dayWeek)} at ${formatTime(hour, '0')}`;
            }
        }
        return `every day at ${formatTime(hour, '0')}`;
    }

    if (minute.startsWith('*/')) {
        const interval = minute.substring(2);
        return `every ${interval} minutes`;
    }

    const expressions: { [key: string]: string } = {
        '* * * * *': 'every minute',
        '0 * * * *': 'every hour',
        '0 0 * * *': 'every day at midnight',
        '0 12 * * *': 'every day at noon',
        '0 0 * * 0': 'every Sunday at midnight',
        '0 0 1 * *': 'first day of every month'
    };

    return expressions[cronExp] || cronExp;
} 