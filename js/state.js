// State Management Module
// Manages all application data: projects, workers, work entries

export const state = {
    projects: [],
    workers: [],
    workEntries: []
};

// Load state from localStorage
export function loadState() {
    try {
        const saved = localStorage.getItem('solarWorkState');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.projects = parsed.projects || [];
            state.workers = parsed.workers || [];
            state.workEntries = parsed.workEntries || [];
            console.log('State loaded:', state);
        }
    } catch (error) {
        console.error('Error loading state:', error);
    }
}

// Save state to localStorage
export function saveState() {
    try {
        localStorage.setItem('solarWorkState', JSON.stringify(state));
        console.log('State saved');
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

// Project Management
export function addProject(project) {
    state.projects.push({
        id: 'proj-' + Date.now(),
        jmenoProjektu: project.name,
        planPDF: project.pdfData,
        createdAt: new Date().toISOString()
    });
    saveState();
}

export function updateProject(projectId, updates) {
    const project = state.projects.find(p => p.id === projectId);
    if (project) {
        Object.assign(project, updates);
        saveState();
    }
}

export function deleteProject(projectId) {
    state.projects = state.projects.filter(p => p.id !== projectId);
    state.workEntries = state.workEntries.filter(e => e.projectId !== projectId);
    saveState();
}

export function getProject(projectId) {
    return state.projects.find(p => p.id === projectId);
}

// Worker Management
export function addWorker(worker) {
    state.workers.push({
        id: 'worker-' + Date.now(),
        name: worker.name,
        hourlyRate: parseFloat(worker.hourlyRate),
        createdAt: new Date().toISOString()
    });
    saveState();
}

export function updateWorker(workerId, updates) {
    const worker = state.workers.find(w => w.id === workerId);
    if (worker) {
        Object.assign(worker, updates);
        saveState();
    }
}

export function deleteWorker(workerId) {
    state.workers = state.workers.filter(w => w.id !== workerId);
    saveState();
}

export function getWorker(workerId) {
    return state.workers.find(w => w.id === workerId);
}

// Work Entry Management
export function addWorkEntry(entry) {
    state.workEntries.push({
        id: 'entry-' + Date.now(),
        type: entry.type, // 'task' or 'hourly'
        workerId: entry.workerId,
        projectId: entry.projectId,
        timestamp: entry.timestamp || new Date().toISOString(),
        
        // For task-based entries
        tableNumber: entry.tableNumber,
        tableType: entry.tableType, // 'small', 'medium', 'large'
        reward: entry.reward ? parseFloat(entry.reward) : 0,
        pinX: entry.pinX,
        pinY: entry.pinY,
        
        // For hourly entries
        duration: entry.duration, // in seconds
        startTime: entry.startTime,
        endTime: entry.endTime
    });
    saveState();
}

export function deleteWorkEntry(entryId) {
    state.workEntries = state.workEntries.filter(e => e.id !== entryId);
    saveState();
}

export function getWorkEntry(entryId) {
    return state.workEntries.find(e => e.id === entryId);
}

// Statistics & Filtering
export function getFilteredEntries(filters = {}) {
    let entries = [...state.workEntries];
    
    if (filters.workerId) {
        entries = entries.filter(e => e.workerId === filters.workerId);
    }
    
    if (filters.projectId) {
        entries = entries.filter(e => e.projectId === filters.projectId);
    }
    
    if (filters.type) {
        entries = entries.filter(e => e.type === filters.type);
    }
    
    if (filters.date) {
        const filterDate = new Date(filters.date).toDateString();
        entries = entries.filter(e => {
            const entryDate = new Date(e.timestamp).toDateString();
            return entryDate === filterDate;
        });
    }
    
    return entries;
}

export function calculateWorkerEarnings(workerId, filters = {}) {
    const worker = getWorker(workerId);
    if (!worker) return { total: 0, tasks: 0, hours: 0 };
    
    const entries = getFilteredEntries({ ...filters, workerId });
    
    let taskEarnings = 0;
    let hourlyEarnings = 0;
    let totalTasks = 0;
    let totalHours = 0;
    
    entries.forEach(entry => {
        if (entry.type === 'task') {
            taskEarnings += entry.reward;
            totalTasks++;
        } else if (entry.type === 'hourly') {
            const hours = entry.duration / 3600;
            hourlyEarnings += hours * worker.hourlyRate;
            totalHours += hours;
        }
    });
    
    return {
        total: taskEarnings + hourlyEarnings,
        taskEarnings,
        hourlyEarnings,
        totalTasks,
        totalHours
    };
}

export function getTotalStatistics(filters = {}) {
    const entries = getFilteredEntries(filters);
    
    let totalEarnings = 0;
    let totalHours = 0;
    let totalTables = 0;
    
    entries.forEach(entry => {
        if (entry.type === 'task') {
            totalEarnings += entry.reward;
            totalTables++;
        } else if (entry.type === 'hourly') {
            const worker = getWorker(entry.workerId);
            if (worker) {
                const hours = entry.duration / 3600;
                totalEarnings += hours * worker.hourlyRate;
                totalHours += hours;
            }
        }
    });
    
    return {
        totalEarnings,
        totalHours,
        totalTables,
        avgReward: totalTables > 0 ? totalEarnings / totalTables : 0
    };
}

// Get entries for a specific project with pin coordinates
export function getProjectPins(projectId) {
    return state.workEntries.filter(e => 
        e.projectId === projectId && 
        e.type === 'task' && 
        e.pinX !== undefined && 
        e.pinY !== undefined
    );
}
