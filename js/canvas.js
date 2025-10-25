// Canvas Module - PDF rendering and interaction
// Handles PDF.js rendering, pinch-to-zoom, pan, and pin placement

import { state, getProjectPins, addWorkEntry } from './state.js';
import { openModal, closeModal, showToast, showQuickSuccess } from './ui.js';
import { triggerHapticFeedback } from './utils.js';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Canvas state
export const canvasState = {
    currentZoom: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    pdfRendered: false,
    currentPDF: null,
    currentPage: null,
    currentProjectId: null,
    baseScale: 1.0,
    touchStartDistance: 0,
    lastTouchX: 0,
    lastTouchY: 0,
    isDragging: false,
    touchStartTime: 0,
    touchMoved: false
};

let canvas, ctx, canvasContainer;

export function initCanvas() {
    canvas = document.getElementById('pdfCanvas');
    ctx = canvas.getContext('2d');
    canvasContainer = document.getElementById('canvasContainer');
    
    // Touch event listeners
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Mouse events for desktop testing
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    
    document.getElementById('resetZoom').addEventListener('click', resetZoom);
}

// Load and render PDF
export async function loadProjectPlan(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    
    if (!project || !project.planPDF) {
        document.getElementById('canvasWrapper').style.display = 'none';
        document.getElementById('noPlanMessage').style.display = 'block';
        return;
    }
    
    document.getElementById('noPlanMessage').style.display = 'none';
    document.getElementById('canvasWrapper').style.display = 'block';
    
    try {
        showLoader();
        
        // Load PDF
        const loadingTask = pdfjsLib.getDocument(project.planPDF);
        const pdf = await loadingTask.promise;
        
        // Get first page
        const page = await pdf.getPage(1);
        
        // Calculate scale to fit container
        const viewport = page.getViewport({ scale: 1.0 });
        const containerWidth = canvasContainer.clientWidth;
        const containerHeight = canvasContainer.clientHeight;
        
        const scaleX = containerWidth / viewport.width;
        const scaleY = containerHeight / viewport.height;
        canvasState.baseScale = Math.min(scaleX, scaleY) * 0.95;
        
        canvasState.currentPDF = pdf;
        canvasState.currentPage = page;
        canvasState.currentProjectId = projectId;
        canvasState.currentZoom = 1.0;
        canvasState.panOffsetX = 0;
        canvasState.panOffsetY = 0;
        
        await renderPage();
        renderPins();
        
        hideLoader();
        showToast('PDF načten', 'success');
    } catch (error) {
        console.error('Error loading PDF:', error);
        hideLoader();
        showToast('Chyba při načítání PDF', 'error');
    }
}

// Render PDF page
async function renderPage() {
    if (!canvasState.currentPage) return;
    
    const scale = canvasState.baseScale * canvasState.currentZoom;
    const viewport = canvasState.currentPage.getViewport({ scale });
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // Center canvas in container
    const offsetX = (canvasContainer.clientWidth - canvas.width) / 2;
    const offsetY = (canvasContainer.clientHeight - canvas.height) / 2;
    
    canvas.style.transform = `translate(${offsetX + canvasState.panOffsetX}px, ${offsetY + canvasState.panOffsetY}px)`;
    
    // Render PDF
    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    };
    
    await canvasState.currentPage.render(renderContext).promise;
    canvasState.pdfRendered = true;
}

// Render pins on overlay
export function renderPins() {
    if (!canvasState.currentProjectId) return;
    
    const pinsOverlay = document.getElementById('pinsOverlay');
    pinsOverlay.innerHTML = '';
    
    const pins = getProjectPins(canvasState.currentProjectId);
    const scale = canvasState.baseScale * canvasState.currentZoom;
    
    pins.forEach(entry => {
        const pin = document.createElement('div');
        pin.className = 'pin';
        
        const x = entry.pinX * scale + canvasState.panOffsetX;
        const y = entry.pinY * scale + canvasState.panOffsetY;
        
        pin.style.left = `${x}px`;
        pin.style.top = `${y}px`;
        
        pin.title = `${entry.tableNumber} - ${entry.reward}€`;
        
        pinsOverlay.appendChild(pin);
    });
}

// Touch event handlers
function handleTouchStart(e) {
    e.preventDefault();
    
    canvasState.touchStartTime = Date.now();
    canvasState.touchMoved = false;
    
    if (e.touches.length === 1) {
        // Single touch - prepare for tap or pan
        canvasState.isDragging = true;
        canvasState.lastTouchX = e.touches[0].clientX;
        canvasState.lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        // Two touches - pinch zoom
        canvasState.isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        canvasState.touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    canvasState.touchMoved = true;
    
    if (e.touches.length === 1 && canvasState.isDragging) {
        // Pan
        const deltaX = e.touches[0].clientX - canvasState.lastTouchX;
        const deltaY = e.touches[0].clientY - canvasState.lastTouchY;
        
        canvasState.panOffsetX += deltaX;
        canvasState.panOffsetY += deltaY;
        
        canvasState.lastTouchX = e.touches[0].clientX;
        canvasState.lastTouchY = e.touches[0].clientY;
        
        renderPage();
        renderPins();
    } else if (e.touches.length === 2) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const scale = distance / canvasState.touchStartDistance;
        const newZoom = Math.max(0.5, Math.min(5.0, canvasState.currentZoom * scale));
        
        canvasState.currentZoom = newZoom;
        canvasState.touchStartDistance = distance;
        
        renderPage();
        renderPins();
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    
    const touchDuration = Date.now() - canvasState.touchStartTime;
    
    // Tap detection (< 200ms and no movement)
    if (touchDuration < 200 && !canvasState.touchMoved && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        
        // Convert screen coordinates to PDF coordinates
        const scale = canvasState.baseScale * canvasState.currentZoom;
        const offsetX = (canvasContainer.clientWidth - canvas.width) / 2;
        const offsetY = (canvasContainer.clientHeight - canvas.height) / 2;
        
        const x = (touch.clientX - rect.left - offsetX - canvasState.panOffsetX) / scale;
        const y = (touch.clientY - rect.top - offsetY - canvasState.panOffsetY) / scale;
        
        handleCanvasTap(x, y);
    }
    
    canvasState.isDragging = false;
}

// Mouse event handlers for desktop
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

function handleMouseDown(e) {
    isMouseDown = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvasState.touchStartTime = Date.now();
    canvasState.touchMoved = false;
}

function handleMouseMove(e) {
    if (isMouseDown) {
        canvasState.touchMoved = true;
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        
        canvasState.panOffsetX += deltaX;
        canvasState.panOffsetY += deltaY;
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        
        renderPage();
        renderPins();
    }
}

function handleMouseUp(e) {
    const touchDuration = Date.now() - canvasState.touchStartTime;
    
    if (touchDuration < 200 && !canvasState.touchMoved) {
        const rect = canvas.getBoundingClientRect();
        const scale = canvasState.baseScale * canvasState.currentZoom;
        const offsetX = (canvasContainer.clientWidth - canvas.width) / 2;
        const offsetY = (canvasContainer.clientHeight - canvas.height) / 2;
        
        const x = (e.clientX - rect.left - offsetX - canvasState.panOffsetX) / scale;
        const y = (e.clientY - rect.top - offsetY - canvasState.panOffsetY) / scale;
        
        handleCanvasTap(x, y);
    }
    
    isMouseDown = false;
}

// Handle tap on canvas - open task modal
function handleCanvasTap(x, y) {
    if (!canvasState.currentProjectId) return;
    
    // Store coordinates
    document.getElementById('taskX').value = x;
    document.getElementById('taskY').value = y;
    document.getElementById('taskProjectId').value = canvasState.currentProjectId;
    
    // Reset form
    document.getElementById('taskForm').reset();
    document.getElementById('taskX').value = x;
    document.getElementById('taskY').value = y;
    document.getElementById('taskProjectId').value = canvasState.currentProjectId;
    
    // Clear selected table type
    document.querySelectorAll('.table-type-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    openModal('taskModal');
}

// Reset zoom and pan
export function resetZoom() {
    canvasState.currentZoom = 1.0;
    canvasState.panOffsetX = 0;
    canvasState.panOffsetY = 0;
    renderPage();
    renderPins();
}

// Loader helpers
function showLoader() {
    document.getElementById('loader').classList.add('show');
}

function hideLoader() {
    document.getElementById('loader').classList.remove('show');
}
