// Utils Module - Helper functions
// Contains utility functions for haptic feedback, formatting, etc.

// Haptic feedback for mobile devices
export function triggerHapticFeedback(type = 'light') {
    if ('vibrate' in navigator) {
        switch(type) {
            case 'light':
                navigator.vibrate(10);
                break;
            case 'medium':
                navigator.vibrate(20);
                break;
            case 'success':
                navigator.vibrate([10, 30, 10]);
                break;
            case 'error':
                navigator.vibrate([20, 10, 20]);
                break;
            default:
                navigator.vibrate(10);
        }
    }
}

// Format time from seconds to HH:MM:SS
export function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Format currency
export function formatCurrency(amount) {
    return `€${amount.toFixed(2)}`;
}

// Format date
export function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('cs-CZ');
}

// Format date and time
export function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('cs-CZ');
}

// Get today's date in YYYY-MM-DD format
export function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Check if date is today
export function isToday(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

// Debounce function for performance
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Generate unique ID
export function generateId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
