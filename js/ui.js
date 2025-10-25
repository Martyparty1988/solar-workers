// UI Module - User Interface Components
// Handles modals, toasts, rendering lists and forms

import { state, addProject, updateProject, deleteProject, addWorker, updateWorker, deleteWorker, addWorkEntry, deleteWorkEntry, getFilteredEntries, calculateWorkerEarnings, getTotalStatistics } from './state.js';
import { loadProjectPlan, renderPins } from './canvas.js';
import { triggerHapticFeedback } from './utils.js';

// Toast notification
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Quick success toast with emoji
export function showQuickSuccess(message) {
    let toast = document.getElementById('quickSuccessToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'quickSuccessToast';
        toast.className = 'quick-success-toast';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// Modal management
export function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

export function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Table type selection
window.selectTableType = function(type, price) {
    // Remove selection from all buttons
    document.querySelectorAll('.table-type-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Add selection to clicked button
    event.target.closest('.table-type-btn').classList.add('selected');
    
    // Set hidden fields
    document.getElementById('taskReward').value = price;
    document.getElementById('taskType').value = type;
    
    triggerHapticFeedback('light');
};

// Save task from modal
window.saveTask = function(event) {
    event.preventDefault();
    
    const workerId = document.getElementById('taskWorker').value;
    const tableNumber = document.getElementById('taskTableNumber').value;
    const reward = document.getElementById('taskReward').value;
    const tableType = document.getElementById('taskType').value;
    const pinX = parseFloat(document.getElementById('taskX').value);
    const pinY = parseFloat(document.getElementById('taskY').value);
    const projectId = document.getElementById('taskProjectId').value;
    
    if (!workerId) {
        showToast('Vyberte pracovníka', 'error');
        return;
    }
    
    if (!tableNumber) {
        showToast('Zadejte číslo stolu', 'error');
        return;
    }
    
    if (!tableType || !reward) {
        showToast('Vyberte typ stolu', 'error');
        return;
    }
    
    addWorkEntry({
        type: 'task',
        workerId,
        projectId,
        tableNumber,
        tableType,
        reward: parseFloat(reward),
        pinX,
        pinY,
        timestamp: new Date().toISOString()
    });
    
    closeModal('taskModal');
    renderPins();
    
    const typeNames = { 
        small: 'Malý stůl', 
        medium: 'Střední stůl', 
        large: 'Velký stůl' 
    };
    
    showQuickSuccess(`✓ ${typeNames[tableType]} přidán (${reward} €)`);
    triggerHapticFeedback('success');
    
    renderRecordsList();
};

// Project modal
window.openProjectModal = function(projectId = null) {
    if (projectId) {
        const project = state.projects.find(p => p.id === projectId);
        document.getElementById('projectModalTitle').textContent = 'Upravit Projekt';
        document.getElementById('projectId').value = project.id;
        document.getElementById('projectName').value = project.jmenoProjektu;
        document.getElementById('currentPDF').textContent = project.planPDF ? 'PDF nahrán' : 'Žádné PDF';
        document.getElementById('projectPDF').required = false;
    } else {
        document.getElementById('projectModalTitle').textContent = 'Přidat Nový Projekt';
        document.getElementById('projectForm').reset();
        document.getElementById('projectId').value = '';
        document.getElementById('currentPDF').textContent = '';
        document.getElementById('projectPDF').required = true;
    }
    openModal('projectModal');
};

window.saveProject = function(event) {
    event.preventDefault();
    
    const projectId = document.getElementById('projectId').value;
    const projectName = document.getElementById('projectName').value.trim();
    const pdfFile = document.getElementById('projectPDF').files[0];
    
    if (!projectName) {
        showToast('Zadejte jméno projektu', 'error');
        return;
    }
    
    if (projectId) {
        // Update existing
        const updates = { jmenoProjektu: projectName };
        
        if (pdfFile) {
            const reader = new FileReader();
            reader.onload = function(e) {
                updates.planPDF = e.target.result;
                updateProject(projectId, updates);
                closeModal('projectModal');
                renderProjectsList();
                renderProjectsDropdown();
                showToast('Projekt aktualizován', 'success');
            };
            reader.readAsDataURL(pdfFile);
        } else {
            updateProject(projectId, updates);
            closeModal('projectModal');
            renderProjectsList();
            renderProjectsDropdown();
            showToast('Projekt aktualizován', 'success');
        }
    } else {
        // Add new
        if (!pdfFile) {
            showToast('Nahrajte PDF soubor', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            addProject({
                name: projectName,
                pdfData: e.target.result
            });
            closeModal('projectModal');
            renderProjectsList();
            renderProjectsDropdown();
            showToast('Projekt přidán', 'success');
        };
        reader.readAsDataURL(pdfFile);
    }
};

window.deleteProject = function(projectId) {
    if (confirm('Opravdu chcete smazat tento projekt? Smažou se i všechny související záznamy.')) {
        deleteProject(projectId);
        renderProjectsList();
        renderProjectsDropdown();
        showToast('Projekt smazán', 'success');
    }
};

// Worker modal
window.openWorkerModal = function(workerId = null) {
    if (workerId) {
        const worker = state.workers.find(w => w.id === workerId);
        document.getElementById('workerModalTitle').textContent = 'Upravit Pracovníka';
        document.getElementById('workerId').value = worker.id;
        document.getElementById('workerName').value = worker.name;
        document.getElementById('workerRate').value = worker.hourlyRate;
    } else {
        document.getElementById('workerModalTitle').textContent = 'Přidat Nového Pracovníka';
        document.getElementById('workerForm').reset();
        document.getElementById('workerId').value = '';
    }
    openModal('workerModal');
};

window.saveWorker = function(event) {
    event.preventDefault();
    
    const workerId = document.getElementById('workerId').value;
    const workerName = document.getElementById('workerName').value.trim();
    const workerRate = parseFloat(document.getElementById('workerRate').value);
    
    if (!workerName) {
        showToast('Zadejte jméno pracovníka', 'error');
        return;
    }
    
    if (!workerRate || workerRate <= 0) {
        showToast('Zadejte platnou hodinovou sazbu', 'error');
        return;
    }
    
    if (workerId) {
        updateWorker(workerId, {
            name: workerName,
            hourlyRate: workerRate
        });
        showToast('Pracovník aktualizován', 'success');
    } else {
        addWorker({
            name: workerName,
            hourlyRate: workerRate
        });
        showToast('Pracovník přidán', 'success');
    }
    
    closeModal('workerModal');
    renderWorkersList();
    renderWorkersDropdown();
};

window.deleteWorker = function(workerId) {
    if (confirm('Opravdu chcete smazat tohoto pracovníka?')) {
        deleteWorker(workerId);
        renderWorkersList();
        renderWorkersDropdown();
        showToast('Pracovník smazán', 'success');
    }
};

// Render projects list
export function renderProjectsList() {
    const container = document.getElementById('projectsList');
    
    if (state.projects.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;">Žádné projekty</div>';
        return;
    }
    
    container.innerHTML = state.projects.map(project => `
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-title">${project.jmenoProjektu}</div>
                <div class="list-item-subtitle">${project.planPDF ? '✓ PDF nahrán' : '✗ Bez PDF'}</div>
            </div>
            <div class="flex gap-8">
                <button onclick="openProjectModal('${project.id}')" class="record-btn" style="background: rgba(59, 130, 246, 0.2); color: var(--color-primary);">Upravit</button>
                <button onclick="deleteProject('${project.id}')" class="record-btn" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">Smazat</button>
            </div>
        </div>
    `).join('');
}

// Render workers list
export function renderWorkersList() {
    const container = document.getElementById('workersList');
    
    if (state.workers.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;">Žádní pracovníci</div>';
        return;
    }
    
    container.innerHTML = state.workers.map(worker => `
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-title">${worker.name}</div>
                <div class="list-item-subtitle">${worker.hourlyRate} €/hodina</div>
            </div>
            <div class="flex gap-8">
                <button onclick="openWorkerModal('${worker.id}')" class="record-btn" style="background: rgba(59, 130, 246, 0.2); color: var(--color-primary);">Upravit</button>
                <button onclick="deleteWorker('${worker.id}')" class="record-btn" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">Smazat</button>
            </div>
        </div>
    `).join('');
}

// Render projects dropdown
export function renderProjectsDropdown() {
    const select = document.getElementById('projectSelect');
    const statsSelect = document.getElementById('statsProjectFilter');
    
    const options = state.projects.map(p => 
        `<option value="${p.id}">${p.jmenoProjektu}</option>`
    ).join('');
    
    select.innerHTML = '<option value="">-- Vyberte projekt --</option>' + options;
    
    if (statsSelect) {
        statsSelect.innerHTML = '<option value="">Všechny projekty</option>' + options;
    }
}

// Render workers dropdown
export function renderWorkersDropdown() {
    const selects = ['taskWorker', 'timerWorker', 'statsWorkerFilter'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        const options = state.workers.map(w => 
            `<option value="${w.id}">${w.name}</option>`
        ).join('');
        
        if (selectId === 'statsWorkerFilter') {
            select.innerHTML = '<option value="">Všichni pracovníci</option>' + options;
        } else {
            select.innerHTML = '<option value="">-- Vyberte pracovníka --</option>' + options;
        }
    });
}

// Render records list
export function renderRecordsList() {
    const container = document.getElementById('recordsList');
    const filterSelect = document.getElementById('recordsFilter');
    
    if (!container) return;
    
    const filter = filterSelect ? filterSelect.value : 'all';
    
    let entries = [...state.workEntries];
    if (filter !== 'all') {
        entries = entries.filter(e => e.type === filter);
    }
    
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div>Žádné záznamy</div></div>';
        return;
    }
    
    container.innerHTML = entries.map(entry => {
        const worker = state.workers.find(w => w.id === entry.workerId);
        const project = state.projects.find(p => p.id === entry.projectId);
        const date = new Date(entry.timestamp).toLocaleString('cs-CZ');
        
        if (entry.type === 'task') {
            const typeNames = { 
                small: 'Malý', 
                medium: 'Střední', 
                large: 'Velký' 
            };
            
            return `
                <div class="record-item">
                    <div class="record-header">
                        <span class="record-type record-type-task">Stůl</span>
                        <div class="record-actions">
                            <button onclick="deleteRecord('${entry.id}')" class="record-btn" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">Smazat</button>
                        </div>
                    </div>
                    <div style="font-weight: 600; margin-bottom: 8px;">
                        ${typeNames[entry.tableType] || ''} ${entry.tableNumber} - ${entry.reward} €
                    </div>
                    <div style="font-size: 14px; color: var(--color-text-secondary);">
                        ${worker?.name || 'Neznámý'} • ${project?.jmenoProjektu || 'Neznámý projekt'}<br>
                        ${date}
                    </div>
                </div>
            `;
        } else {
            const hours = (entry.duration / 3600).toFixed(2);
            const earnings = (hours * (worker?.hourlyRate || 0)).toFixed(2);
            return `
                <div class="record-item">
                    <div class="record-header">
                        <span class="record-type record-type-hourly">Hodiny</span>
                        <div class="record-actions">
                            <button onclick="deleteRecord('${entry.id}')" class="record-btn" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">Smazat</button>
                        </div>
                    </div>
                    <div style="font-weight: 600; margin-bottom: 8px;">${hours} hodin - ${earnings} €</div>
                    <div style="font-size: 14px; color: var(--color-text-secondary);">
                        ${worker?.name || 'Neznámý'}<br>
                        ${date}
                    </div>
                </div>
            `;
        }
    }).join('');
}

window.deleteRecord = function(entryId) {
    if (confirm('Opravdu chcete smazat tento záznam?')) {
        deleteWorkEntry(entryId);
        renderRecordsList();
        updateStatistics();
        renderPins();
        showToast('Záznam smazán', 'success');
    }
};

// Update statistics
export function updateStatistics() {
    const workerFilter = document.getElementById('statsWorkerFilter')?.value;
    const projectFilter = document.getElementById('statsProjectFilter')?.value;
    
    const filters = {};
    if (workerFilter) filters.workerId = workerFilter;
    if (projectFilter) filters.projectId = projectFilter;
    
    const stats = getTotalStatistics(filters);
    
    document.getElementById('statTotalEarnings').textContent = `€${stats.totalEarnings.toFixed(2)}`;
    document.getElementById('statTotalHours').textContent = `${stats.totalHours.toFixed(1)}h`;
    document.getElementById('statTotalTables').textContent = stats.totalTables;
    document.getElementById('statAvgReward').textContent = `€${stats.avgReward.toFixed(2)}`;
}

// Modal close handlers
window.closeModal = closeModal;
