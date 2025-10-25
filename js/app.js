// PDF.js Worker Configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// State Management
let state = {
    projects: [], 
    workers: [], 
    workEntries: [] 
};

// Canvas State
let canvasState = {
    currentZoom: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    pdfRendered: false,
    currentPDF: null,
    currentPage: null,
    baseScale: 1.0,
    touchStartDistance: 0,
    touchStartZoom: 1.0,
    lastTouchX: 0,
    lastTouchY: 0,
    isDragging: false,
    touchStartTime: 0,
    touchMoved: false
};

// Drag state for pins
let dragState = {
    draggingPinId: null,
    dragOffsetX: 0,
    dragOffsetY: 0
};

// Current PDF page index (1-based)
canvasState.currentPageIndex = 1;
canvasState.totalPages = 1;


// Timer State
let timerState = {
    isRunning: false,
    startTime: null,
    workerId: null,
    intervalId: null
};

// IndexedDB variables
const DB_NAME = 'SolarWorkDB_v1';
const STORE_NAME = 'pdfStore';
let db;

// IndexedDB helpers
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('IndexedDB initialized');
            resolve(db);
        };
        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
        };
    });
}

function savePDF(id, pdfBlob) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not initialized');
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id: id, pdf: pdfBlob });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

function loadPDF(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not initialized');
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = (event) => {
            if (event.target.result) {
                resolve(event.target.result.pdf);
            } else {
                reject('No PDF found for this ID');
            }
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

function deletePDF(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not initialized');
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

// Initialize App
async function initApp() {
    try {
        await initDB();
    } catch (error) {
        console.error('Failed to init DB, app may not work correctly.', error);
        showToast('Chyba databáze, PDF nebudou uložena', 'error');
    }

    loadState();
    setupEventListeners();
    renderProjectsDropdown();
    renderWorkersList();
    renderProjectsList();
    renderRecordsList();
    updateStatistics();
    
    // Set today's date for report
    document.getElementById('reportDate').valueAsDate = new Date();
    
    // Restore running timer
    if (timerState.isRunning && timerState.startTime) {
        document.getElementById('startShift').style.display = 'none';
        document.getElementById('stopShift').style.display = 'block';
        document.getElementById('timerWorker').disabled = true;
        document.getElementById('timerWorker').value = timerState.workerId;
        timerState.intervalId = setInterval(updateTimerDisplay, 1000);
        showToast('Běžící směna obnovena', 'info');
    } else {
        timerState.isRunning = false;
        timerState.startTime = null;
    }
    
    // Navigate to settings if no projects
    if (state.projects.length === 0) {
        navigateTo('settings');
    }

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(err => {
            console.log('Service Worker registration failed:', err);
        });
    }
}

// State Management (LocalStorage)
function loadState() {
    const savedState = localStorage.getItem('solarWorkState_v3');
    const savedTimer = localStorage.getItem('solarWorkTimer_v3');

    if (savedState) {
        const parsedState = JSON.parse(savedState);
        state.projects = parsedState.projects || [];
        state.workers = parsedState.workers || [];
        state.workEntries = (parsedState.workEntries || []).map(e => ({...e, pageNum: e.pageNum || 1}));
    }
    
    if (savedTimer) {
        timerState = JSON.parse(savedTimer);
        timerState.intervalId = null;
    }
}

function saveState() {
    const stateToSave = {
        projects: state.projects,  
        workers: state.workers,
        workEntries: state.workEntries
    };

    localStorage.setItem('solarWorkState_v3', JSON.stringify(stateToSave));
    localStorage.setItem('solarWorkTimer_v3', JSON.stringify(timerState));
    console.log('State saved to localStorage (metadata only)');
}

// Navigation
function navigateTo(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageName}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });
    if (pageName === 'records') {
        renderRecordsList();
        renderWorkersList();
        renderProjectsDropdown();
    }
    else if (pageName === 'statistics') updateStatistics();
}

// Listeners
function setupEventListeners() {
    document.getElementById('projectSelect').addEventListener('change', loadProjectPlan);
    const canvas = document.getElementById('pdfCanvas');
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.getElementById('resetZoom').addEventListener('click', resetZoom);
    document.getElementById('startShift').addEventListener('click', startShift);
    document.getElementById('stopShift').addEventListener('click', stopShift);
    
    document.getElementById('recordsFilter').addEventListener('change', renderRecordsList);
    document.getElementById('recordsWorkerFilter').addEventListener('change', renderRecordsList);
    document.getElementById('recordsProjectFilter').addEventListener('change', renderRecordsList);
    document.getElementById('recordsDateFilter').addEventListener('change', renderRecordsList);

    document.getElementById('statsWorkerFilter').addEventListener('change', updateStatistics);
    document.getElementById('statsProjectFilter').addEventListener('change', updateStatistics);

    // Page controls
    document.getElementById('prevPage').addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(1));
    document.getElementById('pageSelect').addEventListener('change', e => gotoPage(parseInt(e.target.value, 10)));

    // Export/Import
    document.getElementById('exportJson').addEventListener('click', exportJSON);
    document.getElementById('exportCsv').addEventListener('click', exportCSV);
    document.getElementById('importFile').addEventListener('change', handleImportFile);

}

// Toasts
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// Loader
function showLoader() { document.getElementById('loader').classList.add('show'); }
function hideLoader() { document.getElementById('loader').classList.remove('show'); }

// Modals
function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

// PROJECTS
function openProjectModal(projectId = null) {
    if (projectId) {
        const project = state.projects.find(p => p.id === projectId);
        document.getElementById('projectModalTitle').textContent = 'Upravit Projekt';
        document.getElementById('projectId').value = project.id;
        document.getElementById('projectName').value = project.jmenoProjektu;
        document.getElementById('currentPDF').textContent = 'Pro změnu nahrajte nové PDF (původní bude přepsáno)';
        document.getElementById('projectPDF').required = false;
    } else {
        document.getElementById('projectModalTitle').textContent = 'Přidat Nový Projekt';
        document.getElementById('projectForm').reset();
        document.getElementById('currentPDF').textContent = '';
        document.getElementById('projectPDF').required = true;
    }
    openModal('projectModal');
}

// save project
async function saveProject(event) {
    event.preventDefault();
    const projectId = document.getElementById('projectId').value;
    const projectName = document.getElementById('projectName').value.trim();
    const pdfFile = document.getElementById('projectPDF').files[0];

    const projectIdToSave = projectId || 'proj-' + Date.now();

    if (pdfFile) {
        showLoader();
        try {
            await savePDF(projectIdToSave, pdfFile);
            
            if (projectId) {
                const project = state.projects.find(p => p.id === projectId);
                project.jmenoProjektu = projectName;
            } else {
                const newProject = { id: projectIdToSave, jmenoProjektu: projectName };
                state.projects.push(newProject);
            }
            
            saveState();
            renderProjectsList();
            renderProjectsDropdown();
            closeModal('projectModal');
            hideLoader();
            showToast('Projekt a PDF uloženy', 'success');

        } catch (error) {
            console.error('Failed to save PDF to IndexedDB:', error);
            showToast('Chyba při ukládání PDF', 'error');
            hideLoader();
        }
    } else if (projectId) {
        const project = state.projects.find(p => p.id === projectId);
        project.jmenoProjektu = projectName;
        saveState();
        renderProjectsList();
        renderProjectsDropdown();
        closeModal('projectModal');
        showToast('Projekt aktualizován', 'success');
    } else {
        showToast('Prosím, vyberte PDF soubor', 'error');
    }
}

// delete project
async function deleteProject(projectId) {
    if (confirm('Opravdu chcete smazat tento projekt? Smažou se i všechny související záznamy a PDF.')) {
        state.projects = state.projects.filter(p => p.id !== projectId);
        state.workEntries = state.workEntries.filter(e => e.projectId !== projectId);
        
        try { await deletePDF(projectId); } catch (error) { console.warn('Could not delete PDF from DB:', error); }
        
        saveState();
        renderProjectsList();
        renderProjectsDropdown();
        showToast('Projekt smazán', 'success');
    }
}

function renderProjectsList() {
    const container = document.getElementById('projectsList');
    if (state.projects.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;">Žádné projekty</div>';
        return;
    }
    
    container.innerHTML = state.projects.map(project => `
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-title">${project.jmenoProjektu}</div>
                <div class="list-item-subtitle">ID: ${project.id.substring(5, 13)}</div>
            </div>
            <div class="flex gap-8">
                <button onclick="openProjectModal('${project.id}')" class="record-btn" style="background: rgba(59, 130, 246, 0.2); color: var(--color-primary);">Upravit</button>
                <button onclick="deleteProject('${project.id}')" class="record-btn" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">Smazat</button>
            </div>
        </div>
    `).join('');
}

function renderProjectsDropdown() {
    const select = document.getElementById('projectSelect');
    const statsSelect = document.getElementById('statsProjectFilter');
    const recordsSelect = document.getElementById('recordsProjectFilter');
    
    const options = state.projects.map(p => `<option value="${p.id}">${p.jmenoProjektu}</option>`).join('');
    
    select.innerHTML = '<option value="">-- Vyberte projekt --</option>' + options;
    statsSelect.innerHTML = '<option value="">Všechny projekty</option>' + options;
    if (recordsSelect) { recordsSelect.innerHTML = '<option value="">Všechny projekty</option>' + options; }
}

// WORKERS
function openWorkerModal(workerId = null) {
    if (workerId) {
        const worker = state.workers.find(w => w.id === workerId);
        document.getElementById('workerModalTitle').textContent = 'Upravit Pracovníka';
        document.getElementById('workerId').value = worker.id;
        document.getElementById('workerName').value = worker.name;
        document.getElementById('workerCode').value = worker.code || '';
        document.getElementById('workerRate').value = worker.hourlyRate;
    } else {
        document.getElementById('workerModalTitle').textContent = 'Přidat Nového Pracovníka';
        document.getElementById('workerForm').reset();
    }
    openModal('workerModal');
}

function saveWorker(event) {
    event.preventDefault();
    const workerId = document.getElementById('workerId').value;
    const workerName = document.getElementById('workerName').value.trim();
    const workerCode = document.getElementById('workerCode').value.trim();
    const workerRate = parseFloat(document.getElementById('workerRate').value);

    if (workerId) {
        const worker = state.workers.find(w => w.id === workerId);
        worker.name = workerName;
        worker.code = workerCode;
        worker.hourlyRate = workerRate;
    } else {
        const newWorker = {
            id: 'worker-' + Date.now(),
            name: workerName,
            code: workerCode,
            hourlyRate: workerRate
        };
        state.workers.push(newWorker);
    }
    
    saveState();
    renderWorkersList();
    closeModal('workerModal');
    showToast('Pracovník uložen', 'success');
}

function deleteWorker(workerId) {
    if (confirm('Opravdu chcete smazat tohoto pracovníka?')) {
        state.workers = state.workers.filter(w => w.id !== workerId);
        saveState();
        renderWorkersList();
        showToast('Pracovník smazán', 'success');
    }
}

function renderWorkersList() {
    const container = document.getElementById('workersList');
    const timerSelect = document.getElementById('timerWorker');
    const taskSelect = document.getElementById('taskWorker');
    const statsSelect = document.getElementById('statsWorkerFilter');
    const recordsSelect = document.getElementById('recordsWorkerFilter');
    
    if (state.workers.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;">Žádní pracovníci</div>';
    } else {
        container.innerHTML = state.workers.map(worker => `
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-title">${worker.name}</div>
                    <div class="list-item-subtitle">Kód: <strong>${worker.code || 'N/A'}</strong> | €${worker.hourlyRate.toFixed(2)}/hod</div>
                </div>
                <div class="flex gap-8">
                    <button onclick="openWorkerModal('${worker.id}')" class="record-btn" style="background: rgba(59, 130, 246, 0.2); color: var(--color-primary);">Upravit</button>
                    <button onclick="deleteWorker('${worker.id}')" class="record-btn" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">Smazat</button>
                </div>
            </div>
        `).join('');
    }
    
    const workerOptions = state.workers.map(w => `<option value="${w.id}">${w.name} (${w.code || 'N/A'})</option>`).join('');
    
    timerSelect.innerHTML = '<option value="">-- Vyberte pracovníka --</option>' + workerOptions;
    taskSelect.innerHTML = '<option value="">-- Vyberte pracovníka --</option>' + workerOptions;
    statsSelect.innerHTML = '<option value="">Všichni pracovníci</option>' + workerOptions;
    if (recordsSelect) { recordsSelect.innerHTML = '<option value="">Všichni pracovníci</option>' + workerOptions; }
}

// PLAN loading
async function loadProjectPlan() {
    const projectId = document.getElementById('projectSelect').value;
    
    if (!projectId) {
        document.getElementById('canvasWrapper').style.display = 'none';
        document.getElementById('noPlanMessage').style.display = 'block';
        document.getElementById('noPlanMessage').innerHTML = `
            <div class="empty-state-icon">📋</div>
            <div>Nejprve vyberte projekt</div>
            <button onclick="navigateTo('settings')" class="btn btn-primary mt-16">Přidat Projekt</button>
        `;
        return;
    }
    
    showLoader();
    try {
        const pdfBlob = await loadPDF(projectId);
        const arrayBuffer = await pdfBlob.arrayBuffer();

        document.getElementById('noPlanMessage').style.display = 'none';
        document.getElementById('canvasWrapper').style.display = 'block';
        renderPDF(arrayBuffer); 

    } catch (error) {
        console.warn('PDF not found in IndexedDB:', error);
        document.getElementById('canvasWrapper').style.display = 'none';
        document.getElementById('noPlanMessage').style.display = 'block';
        document.getElementById('noPlanMessage').innerHTML = `
            <div class="empty-state-icon">🔄</div>
            <div>Plán PDF není v databázi.</div>
            <button onclick="openProjectModal('${projectId}')" class="btn btn-primary mt-16">Nahrát PDF</button>
        `;
        showToast('Prosím, nahrajte PDF pro tento projekt', 'info');
        hideLoader();
    }
}

// Render PDF
function changePage(delta) {
    if (!canvasState.currentPDF) return;
    let target = canvasState.currentPageIndex + delta;
    if (target < 1) target = 1;
    if (target > canvasState.totalPages) target = canvasState.totalPages;
    gotoPage(target);
}

function gotoPage(pageNumber) {
    if (!canvasState.currentPDF) return;
    canvasState.currentPDF.getPage(pageNumber).then(page => {
        canvasState.currentPage = page;
        canvasState.currentPageIndex = pageNumber;
        const pageSelect = document.getElementById('pageSelect');
        if (pageSelect) pageSelect.value = String(pageNumber);
        resetZoom();
    });
}


function renderPDF(pdfData) {
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    loadingTask.promise.then(pdf => {
        canvasState.currentPDF = pdf;
        canvasState.totalPages = pdf.numPages;
        canvasState.currentPageIndex = 1;
        // Fill pageSelect
        const pageSelect = document.getElementById('pageSelect');
        pageSelect.innerHTML = Array.from({length: pdf.numPages}, (_,i)=>`<option value="${i+1}">Strana ${i+1}/${pdf.numPages}</option>`).join('');
        pageSelect.value = '1';
        return pdf.getPage(1);
    }).then(page => {
        canvasState.currentPage = page;
        const canvas = document.getElementById('pdfCanvas');
        const container = document.getElementById('canvasContainer');
        const containerWidth = container.clientWidth;
        
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = containerWidth / viewport.width;
        canvasState.baseScale = scale;
        canvasState.currentZoom = 1.0;
        canvasState.panOffsetX = 0;
        canvasState.panOffsetY = 0;
        
        renderCanvasWithPins();
        hideLoader(); 
        canvasState.pdfRendered = true;
    }).catch(error => {
        console.error('Error loading PDF:', error);
        showToast('Chyba při načítání PDF', 'error');
        hideLoader();
    });
}

function handleTouchMove(e) {
    e.preventDefault();
    canvasState.touchMoved = true;
    
    if (e.touches.length === 1 && dragState.draggingPinId) {
        // Move pin
        const tx = e.touches[0].clientX;
        const ty = e.touches[0].clientY;
        const rect = e.target.getBoundingClientRect();
        const x = tx - rect.left - dragState.dragOffsetX;
        const y = ty - rect.top - dragState.dragOffsetY;
        const totalScale = canvasState.baseScale * canvasState.currentZoom;
        const pin = state.workEntries.find(e => e.id === dragState.draggingPinId);
        if (pin) {
            pin.x = (x - canvasState.panOffsetX) / totalScale;
            pin.y = (y - canvasState.panOffsetY) / totalScale;
            renderCanvasWithPins();
        }
    } else if (e.touches.length === 1 && canvasState.isDragging) {
        const deltaX = e.touches[0].clientX - canvasState.lastTouchX;
        const deltaY = e.touches[0].clientY - canvasState.lastTouchY;
        canvasState.panOffsetX += deltaX;
        canvasState.panOffsetY += deltaY;
        canvasState.lastTouchX = e.touches[0].clientX;
        canvasState.lastTouchY = e.touches[0].clientY;
        renderCanvasWithPins();
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const scale = distance / canvasState.touchStartDistance;
        const newZoom = canvasState.touchStartZoom * scale;
        
        canvasState.currentZoom = Math.max(0.5, Math.min(3.0, newZoom));
        
        renderCanvasWithPins();
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    
    const touchDuration = Date.now() - canvasState.touchStartTime;
    
    if (dragState.draggingPinId) {
                // finish drag
                saveState();
                dragState.draggingPinId = null;
            } else if (touchDuration < 300 && !canvasState.touchMoved && e.changedTouches.length === 1) {
        const rect = e.target.getBoundingClientRect();
        const x = e.changedTouches[0].clientX - rect.left;
        const y = e.changedTouches[0].clientY - rect.top;
        
        const totalScale = canvasState.baseScale * canvasState.currentZoom;
        const pdfX = (x - canvasState.panOffsetX) / totalScale;
        const pdfY = (y - canvasState.panOffsetY) / totalScale;
        
        openTaskModal(pdfX, pdfY);
    }
    
    canvasState.isDragging = false;
}

// TASK MODAL
function openTaskModal(x, y) {
    if (state.workers.length === 0) {
        showToast('Nejprve přidejte pracovníky v Nastavení', 'error');
        return;
    }
    
    document.getElementById('taskModalTitle').textContent = 'Zadat Hotový Stůl';
    document.getElementById('taskForm').reset();
    document.getElementById('taskEntryId').value = '';
    document.getElementById('taskX').value = x;
    document.getElementById('taskY').value = y;
    document.getElementById('taskForm').dataset.pageNum = canvasState.currentPageIndex;
    openModal('taskModal');
}

function openEditTaskModal(entryId) {
    const entry = state.workEntries.find(e => e.id === entryId);
    if (!entry || entry.type !== 'task') return;

    document.getElementById('taskModalTitle').textContent = 'Upravit Stůl';
    document.getElementById('taskEntryId').value = entry.id;
    document.getElementById('taskWorker').value = entry.workerId;
    document.getElementById('taskTableNumber').value = entry.tableNumber;
    document.getElementById('taskReward').value = entry.reward;
    
    document.getElementById('taskX').value = entry.x; 
    document.getElementById('taskY').value = entry.y;

    document.getElementById('taskForm').dataset.pageNum = canvasState.currentPageIndex;
    openModal('taskModal');
}

function saveTask(event) {
    event.preventDefault();
    const entryId = document.getElementById('taskEntryId').value;
    
    const projectId = document.getElementById('projectSelect').value;
    const workerId = document.getElementById('taskWorker').value;
    const tableNumber = document.getElementById('taskTableNumber').value.trim();
    const reward = parseFloat(document.getElementById('taskReward').value);
    const x = parseFloat(document.getElementById('taskX').value);
    const y = parseFloat(document.getElementById('taskY').value);
    
    const worker = state.workers.find(w => w.id === workerId);
    const workerCode = worker ? (worker.code || '?') : '?';

    if (entryId) {
        const entry = state.workEntries.find(e => e.id === entryId);
        if (entry) {
            entry.workerId = workerId;
            entry.workerCode = workerCode;
            entry.tableNumber = tableNumber;
            entry.reward = reward;
        }
        showToast('Stůl upraven', 'success');
    } else {
        const pageNum = parseInt(document.getElementById('taskForm').dataset.pageNum || (canvasState.currentPageIndex||1), 10);
        const newEntry = {
            id: 'entry-' + Date.now(),
            type: 'task',
            projectId: projectId,
            workerId: workerId,
            workerCode: workerCode, 
            tableNumber: tableNumber,
            reward: reward,
            x: x,
            pageNum: pageNum,
            y: y,
            timestamp: Date.now()
        };
        state.workEntries.push(newEntry);
        showToast('Stůl přidán', 'success');
    }
    
    saveState();
    renderCanvasWithPins();
    renderRecordsList();
    updateStatistics();
    closeModal('taskModal');
}

// TIMER
function startShift() {
    const workerId = document.getElementById('timerWorker').value;
    if (!workerId) {
        showToast('Vyberte pracovníka', 'error');
        return;
    }
    
    timerState.isRunning = true;
    timerState.startTime = Date.now();
    timerState.workerId = workerId;
    
    document.getElementById('startShift').style.display = 'none';
    document.getElementById('stopShift').style.display = 'block';
    document.getElementById('timerWorker').disabled = true;
    
    timerState.intervalId = setInterval(updateTimerDisplay, 1000);
    saveState();
    showToast('Směna zahájena', 'success');
}

function stopShift() {
    if (!timerState.isRunning) return;
    
    const endTime = Date.now();
    const totalMs = endTime - timerState.startTime;
    const totalHours = totalMs / (1000 * 60 * 60);
    
    const worker = state.workers.find(w => w.id === timerState.workerId);
    const totalEarned = totalHours * worker.hourlyRate;
    
    const pageNum = parseInt(document.getElementById('taskForm').dataset.pageNum || (canvasState.currentPageIndex||1), 10);
        const newEntry = {
        id: 'entry-' + Date.now(),
        type: 'hourly',
        workerId: timerState.workerId,
        startTime: timerState.startTime,
        endTime: endTime,
        totalHours: totalHours,
        totalEarned: totalEarned
    };
    
    state.workEntries.push(newEntry);
    
    clearInterval(timerState.intervalId);
    timerState.isRunning = false;
    timerState.startTime = null;
    timerState.workerId = null;
    
    saveState();  
    
    document.getElementById('startShift').style.display = 'block';
    document.getElementById('stopShift').style.display = 'none';
    document.getElementById('timerWorker').disabled = false;
    document.getElementById('timerDisplay').textContent = '00:00:00';
    
    showToast(`Směna ukončena: ${totalHours.toFixed(2)}h, €${totalEarned.toFixed(2)}`, 'success');
    renderRecordsList();
}

function updateTimerDisplay() {
    if (!timerState.isRunning) return;
    
    const elapsed = Date.now() - timerState.startTime;
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);
    
    document.getElementById('timerDisplay').textContent = 
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// RECORDS
function renderRecordsList() {
    const container = document.getElementById('recordsList');
    
    const typeFilter = document.getElementById('recordsFilter').value;
    const workerFilter = document.getElementById('recordsWorkerFilter').value;
    const projectFilter = document.getElementById('recordsProjectFilter').value;
    const dateFilter = document.getElementById('recordsDateFilter').value;
    
    let entries = state.workEntries;

    // Date filter
    if (dateFilter !== 'all') {
        const now = new Date();
        let startDate, endDate;

        if (dateFilter === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).setHours(0, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).setHours(23, 59, 59, 999);
        } else if (dateFilter === 'this_week') {
            const currentDay = now.getDay();
            const diff = now.getDate() - (currentDay === 0 ? 6 : currentDay - 1);
            startDate = new Date(now.getFullYear(), now.getMonth(), diff).setHours(0, 0, 0, 0);
            const startDateObj = new Date(startDate);
            endDate = new Date(startDateObj.setDate(startDateObj.getDate() + 6)).setHours(23, 59, 59, 999);
        } else if (dateFilter === 'this_month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).setHours(0, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).setHours(23, 59, 59, 999);
        }

        entries = entries.filter(e => {
            const entryDate = new Date(e.timestamp || e.startTime).getTime();
            return entryDate >= startDate && entryDate <= endDate;
        });
    }

    // Worker filter
    if (workerFilter) {
        entries = entries.filter(e => e.workerId === workerFilter);
    }

    // Project filter
    if (projectFilter) {
        entries = entries.filter(e => e.type === 'task' && e.projectId === projectFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
        entries = entries.filter(e => e.type === typeFilter);
    }
    
    entries.sort((a, b) => (b.timestamp || b.endTime) - (a.timestamp || a.endTime));
    
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div>Žádné záznamy dle filtrů</div></div>';
        return;
    }
    
    container.innerHTML = entries.map(entry => {
        const worker = state.workers.find(w => w.id === entry.workerId);
        const workerName = worker ? worker.name : 'Neznámý';
        
        if (entry.type === 'task') {
            const project = state.projects.find(p => p.id === entry.projectId);
            const projectName = project ? project.jmenoProjektu : 'Neznámý projekt';
            const date = new Date(entry.timestamp);
            
            return `
                <div class="record-item">
                    <div class="record-header">
                        <span class="record-type record-type-task">Stůl</span>
                        <div class="record-actions">
                            <button onclick="openEditTaskModal('${entry.id}')" class="record-btn" style="background: rgba(59, 130, 246, 0.2); color: var(--color-primary);">Upravit</button>
                            <button onclick="deleteEntry('${entry.id}')" class="record-btn btn-danger" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">Smazat</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 8px;"><strong>${entry.tableNumber}</strong></div>
                    <div style="font-size: 14px; color: var(--color-text-secondary);">
                        <div>👷 ${workerName} (<strong>Kód: ${entry.workerCode || 'N/A'}</strong>)</div>
                        <div>📋 ${projectName}</div>
                        <div>💰 €${entry.reward.toFixed(2)}</div>
                        <div>📅 ${date.toLocaleDateString('cs-CZ')} ${date.toLocaleTimeString('cs-CZ')}</div>
                    </div>
                </div>
            `;
        } else {
            const startDate = new Date(entry.startTime);
            const endDate = new Date(entry.endTime);
            
            return `
                <div class="record-item">
                    <div class="record-header">
                        <span class="record-type record-type-hourly">Hodiny</span>
                        <div class="record-actions">
                            <button onclick="deleteEntry('${entry.id}')" class="record-btn btn-danger" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">Smazat</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 8px;"><strong>${workerName}</strong></div>
                    <div style="font-size: 14px; color: var(--color-text-secondary);">
                        <div>⏱️ ${entry.totalHours.toFixed(2)} hodin</div>
                        <div>💰 €${entry.totalEarned.toFixed(2)}</div>
                        <div>📅 ${startDate.toLocaleDateString('cs-CZ')} ${startDate.toLocaleTimeString('cs-CZ')}</div>
                        <div>→ ${endDate.toLocaleTimeString('cs-CZ')}</div>
                    </div>
                </div>
            `;
        }
    }).join('');
}

function deleteEntry(entryId) {
    if (confirm('Opravdu chcete smazat tento záznam?')) {
        state.workEntries = state.workEntries.filter(e => e.id !== entryId);
        saveState();
        renderRecordsList();
        renderCanvasWithPins();
        updateStatistics();
        showToast('Záznam smazán', 'success');
    }
}

// STATS
function updateStatistics() {
    const workerFilter = document.getElementById('statsWorkerFilter').value;
    const projectFilter = document.getElementById('statsProjectFilter').value;
    
    let entries = state.workEntries;
    
    if (workerFilter) {
        entries = entries.filter(e => e.workerId === workerFilter);
    }
    if (projectFilter) {
        entries = entries.filter(e => e.type === 'hourly' || (e.type === 'task' && e.projectId === projectFilter));
    }
    
    const taskEntries = entries.filter(e => e.type === 'task');
    const hourlyEntries = entries.filter(e => e.type === 'hourly');
    
    const totalTaskEarnings = taskEntries.reduce((sum, e) => sum + e.reward, 0);
    const totalHourlyEarnings = hourlyEntries.reduce((sum, e) => sum + e.totalEarned, 0);
    const totalEarnings = totalTaskEarnings + totalHourlyEarnings;
    
    const totalHours = hourlyEntries.reduce((sum, e) => sum + e.totalHours, 0);
    const totalTables = taskEntries.length;
    const avgReward = totalTables > 0 ? totalTaskEarnings / totalTables : 0;
    
    document.getElementById('statTotalEarnings').textContent = `€${totalEarnings.toFixed(2)}`;
    document.getElementById('statTotalHours').textContent = `${totalHours.toFixed(1)}h`;
    document.getElementById('statTotalTables').textContent = totalTables;
    document.getElementById('statAvgReward').textContent = `€${avgReward.toFixed(2)}`;
    
    const workerEarnings = {};
    state.workers.forEach(w => { workerEarnings[w.name] = 0; });
    
    entries.forEach(entry => {
        const worker = state.workers.find(w => w.id === entry.workerId);
        const workerName = worker ? worker.name : 'Neznámý';
        
        if (workerEarnings[workerName] === undefined) {
            workerEarnings[workerName] = 0;
        }
        
        if (entry.type === 'task') {
            workerEarnings[workerName] += entry.reward;
        } else {
            workerEarnings[workerName] += entry.totalEarned;
        }
    });
    
    const workerChart = document.getElementById('workerEarningsChart');
    const workerEntries = Object.entries(workerEarnings).filter(([name, amount]) => amount > 0);
    
    if (workerEntries.length > 0) {
        workerChart.innerHTML = workerEntries
            .sort((a, b) => b[1] - a[1])
            .map(([name, amount]) => `
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>${name}</span>
                        <span style="font-weight: 600;">€${amount.toFixed(2)}</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #3b82f6, #8b5cf6); height: 100%; width: ${totalEarnings > 0 ? (amount / totalEarnings * 100).toFixed(1) : 0}%;"></div>
                    </div>
                </div>
            `).join('');
    } else {
        workerChart.innerHTML = '<div>Žádná data k zobrazení</div>';
    }
    
    const taskVsHourlyChart = document.getElementById('taskVsHourlyChart');
    if (totalEarnings > 0) {
        const taskPercent = (totalTaskEarnings / totalEarnings * 100).toFixed(1);
        const hourlyPercent = (totalHourlyEarnings / totalEarnings * 100).toFixed(1);
        
        taskVsHourlyChart.innerHTML = `
            <div style="width: 100%;">
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Stoly</span>
                        <span style="font-weight: 600;">€${totalTaskEarnings.toFixed(2)} (${taskPercent}%)</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.1); height: 12px; border-radius: 6px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #4ade80, #22c55e); height: 100%; width: ${taskPercent}%;"></div>
                    </div>
                </div>
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Hodiny</span>
                        <span style="font-weight: 600;">€${totalHourlyEarnings.toFixed(2)} (${hourlyPercent}%)</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.1); height: 12px; border-radius: 6px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #3b82f6, #2563eb); height: 100%; width: ${hourlyPercent}%;"></div>
                    </div>
                </div>
            </div>
        `;
    } else {
        taskVsHourlyChart.innerHTML = '<div>Žádná data k zobrazení</div>';
    }
}

// DAILY REPORT
function generateDailyReport() {
    const dateInput = document.getElementById('reportDate').value;
    if (!dateInput) {
        showToast('Vyberte datum', 'error');
        return;
    }
    
    const selectedDate = new Date(dateInput);
    selectedDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const entries = state.workEntries.filter(entry => {
        const entryDate = new Date(entry.timestamp || entry.startTime);
        return entryDate >= selectedDate && entryDate < nextDate;
    });
    
    if (entries.length === 0) {
        showToast('Žádné záznamy pro vybrané datum', 'info');
        return;
    }
    
    let report = `DENNÍ REPORT - ${selectedDate.toLocaleDateString('cs-CZ')}
==================================================

`;
    
    const workerGroups = {};
    entries.forEach(entry => {
        const worker = state.workers.find(w => w.id === entry.workerId);
        const workerName = worker ? worker.name : 'Neznámý';
        
        if (!workerGroups[workerName]) {
            workerGroups[workerName] = { tasks: [], hourly: [], worker: worker };
        }
        
        if (entry.type === 'task') {
            workerGroups[workerName].tasks.push(entry);
        } else {
            workerGroups[workerName].hourly.push(entry);
        }
    });
    
    Object.entries(workerGroups).forEach(([workerName, data]) => {
        const workerCode = data.worker ? (data.worker.code || 'N/A') : 'N/A';
        report += `PRACOVNÍK: ${workerName} (Kód: ${workerCode})
--------------------------------------------------
`;
        
        if (data.tasks.length > 0) {
            report += `
Hotové Stoly:
`;
            data.tasks.forEach(task => {
                const project = state.projects.find(p => p.id === task.projectId);
                report += `  • ${task.tableNumber} - €${task.reward.toFixed(2)} (${project ? project.jmenoProjektu : 'N/A'})
`;
            });
            const taskTotal = data.tasks.reduce((sum, t) => sum + t.reward, 0);
            report += `  Celkem ze stolů: €${taskTotal.toFixed(2)}
`;
        }
        
        if (data.hourly.length > 0) {
            report += `
Odpracované Hodiny:
`;
            data.hourly.forEach(h => {
                report += `  • ${h.totalHours.toFixed(2)}h - €${h.totalEarned.toFixed(2)}
`;
            });
            const hourlyTotal = data.hourly.reduce((sum, h) => sum + h.totalEarned, 0);
            report += `  Celkem z hodin: €${hourlyTotal.toFixed(2)}
`;
        }
        
        const workerTotal = 
            data.tasks.reduce((sum, t) => sum + t.reward, 0) +
            data.hourly.reduce((sum, h) => sum + h.totalEarned, 0);
        report += `
  CELKEM: €${workerTotal.toFixed(2)}

`;
    });
    
    const grandTotal = entries.reduce((sum, e) => {
        return sum + (e.type === 'task' ? e.reward : e.totalEarned);
    }, 0);
    
    report += `==================================================
CELKOVÝ SOUČET: €${grandTotal.toFixed(2)}
`;
    
    document.getElementById('reportContent').textContent = report;
    openModal('reportModal');
}

function copyReport() {
    const reportText = document.getElementById('reportContent').textContent;
    
    if (!navigator.clipboard) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = reportText;
            textArea.style.position = "fixed";
            textArea.style.top = "0";
            textArea.style.left = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Report zkopírován do schránky', 'success');
        } catch (err) {
            showToast('Chyba při kopírování', 'error');
        }
        return;
    }

    navigator.clipboard.writeText(reportText).then(() => {
        showToast('Report zkopírován do schránky', 'success');
    }).catch(() => {
        showToast('Chyba při kopírování', 'error');
    });
}


// -------- Export / Import --------
function downloadBlob(content, filename, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportJSON() {
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        state
    };
    downloadBlob(JSON.stringify(payload, null, 2), 'solar-work-backup.json', 'application/json');
    showToast('Export hotov (JSON)', 'success');
}

function exportCSV() {
    // Simple CSV for workEntries
    const rows = [
        ['id','type','projectId','workerId','workerCode','tableNumber','reward','x','y','pageNum','timestamp','startTime','endTime','totalHours','totalEarned']
    ];
    state.workEntries.forEach(e => {
        rows.append = null;
    });
    const lines = state.workEntries.map(e => [
        e.id, e.type, e.projectId||'', e.workerId||'', e.workerCode||'', e.tableNumber||'',
        e.reward!=null?e.reward:'', e.x!=null?e.x:'', e.y!=null?e.y:'', e.pageNum||'',
        e.timestamp||'', e.startTime||'', e.endTime||'', e.totalHours||'', e.totalEarned||''
    ].map(v => String(v).replace(/"/g,'""')).map(v => `"${v}"`).join(',')
    );
    const header = rows[0].join(',');
    const csv = [header, ...lines].join('\n');
    downloadBlob(csv, 'work-entries.csv', 'text/csv');
    showToast('Export hotov (CSV)', 'success');
}

function handleImportFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!data || !data.state) throw new Error('Neplatný formát');
            // basic merge: replace entirely (jednoduché a srozumitelné)
            state = data.state;
            // Backfill pageNum pro staré záznamy
            state.workEntries = (state.workEntries||[]).map(e => ({...e, pageNum: e.pageNum || 1}));
            saveState();
            renderProjectsDropdown();
            renderWorkersList();
            renderProjectsList();
            renderRecordsList();
            updateStatistics();
            renderCanvasWithPins();
            showToast('Import dokončen', 'success');
        } catch (err) {
            console.error(err);
            showToast('Import selhal: ' + err.message, 'error');
        } finally {
            ev.target.value = '';
        }
    };
    reader.readAsText(file);
}

// Boot
window.addEventListener('DOMContentLoaded', initApp);
