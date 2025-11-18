/**
 * SVG Editor - Main Application
 * Vanilla JavaScript with Snap.svg
 */

// Global state management
const editorState = {
    activeTool: 'select',           // Current active tool
    strokeColor: '#000000',         // Current stroke color
    strokeWidth: 2,                 // Current stroke width
    selectedElement: null,          // Currently selected shape
    isDrawing: false,               // Drawing state flag
    startPoint: { x: 0, y: 0 },    // Start point for drawing
    currentShape: null,             // Temporary shape while drawing
    scribblePoints: []              // Points for scribble tool
};

// Snap.svg instance
let snap = null;

/**
 * Initialize the application
 */
function init() {
    console.log('Initializing SVG Editor...');

    // Initialize Snap.svg
    const svgCanvas = document.getElementById('svg-canvas');
    snap = Snap('#svg-canvas');

    // Set SVG dimensions to match container
    resizeSVGCanvas();

    // Setup event listeners
    setupToolbar();
    setupCanvas();
    setupWindowEvents();

    // Update status
    updateStatus('Ready - Select a tool to start drawing');

    console.log('SVG Editor initialized successfully!');
}

/**
 * Resize SVG canvas to match container
 */
function resizeSVGCanvas() {
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    snap.attr({
        width: rect.width,
        height: rect.height,
        viewBox: `0 0 ${rect.width} ${rect.height}`
    });
}

/**
 * Setup toolbar event listeners
 */
function setupToolbar() {
    // Tool buttons
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(button => {
        button.addEventListener('click', handleToolChange);
    });

    // Color picker
    const colorPicker = document.getElementById('stroke-color');
    colorPicker.addEventListener('change', (e) => {
        editorState.strokeColor = e.target.value;
        updateStatus(`Color changed to ${e.target.value}`);
    });

    // Line width
    const widthInput = document.getElementById('stroke-width');
    widthInput.addEventListener('change', (e) => {
        editorState.strokeWidth = parseInt(e.target.value);
        updateStatus(`Line width changed to ${e.target.value}px`);
    });

    // Import SVG button
    const importBtn = document.getElementById('import-svg');
    const fileInput = document.getElementById('file-input');

    importBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileImport);

    // Clear canvas button
    const clearBtn = document.getElementById('clear-canvas');
    clearBtn.addEventListener('click', handleClearCanvas);
}

/**
 * Setup canvas event listeners
 */
function setupCanvas() {
    const canvas = document.getElementById('svg-canvas');

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('click', handleCanvasClick);
}

/**
 * Setup window event listeners
 */
function setupWindowEvents() {
    // Handle window resize
    window.addEventListener('resize', resizeSVGCanvas);

    // Handle keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);
}

/**
 * Handle tool change
 */
function handleToolChange(e) {
    const button = e.currentTarget;
    const tool = button.dataset.tool;

    // Update active tool
    editorState.activeTool = tool;

    // Update button states
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    button.classList.add('active');

    // Update cursor
    updateCursor();

    // Deselect current element
    if (editorState.selectedElement) {
        deselectElement();
    }

    updateStatus(`Tool changed to: ${tool}`);
}

/**
 * Update cursor based on active tool
 */
function updateCursor() {
    const canvas = document.getElementById('svg-canvas');
    canvas.className = '';

    switch (editorState.activeTool) {
        case 'select':
            canvas.classList.add('cursor-select');
            break;
        case 'delete':
            canvas.classList.add('cursor-delete');
            break;
        default:
            // Drawing tools use crosshair (default)
            break;
    }
}

/**
 * Handle mouse down on canvas
 */
function handleMouseDown(e) {
    const point = getSVGCoordinates(e);
    editorState.startPoint = point;

    const tool = editorState.activeTool;

    // Handle different tools
    if (tool === 'select' || tool === 'delete') {
        // Selection and deletion handled by click on elements (Phase 3)
        return;
    }

    // Start drawing
    editorState.isDrawing = true;

    const attrs = getDefaultAttributes(editorState.strokeColor, editorState.strokeWidth);

    switch (tool) {
        case 'line':
            // Create initial line
            editorState.currentShape = drawLine(snap, point, point, attrs);
            break;

        case 'circle':
            // Create initial circle with radius 0
            editorState.currentShape = drawCircle(snap, point, 0, attrs);
            break;

        case 'rect':
            // Create initial rectangle with 0 dimensions
            editorState.currentShape = drawRect(snap, point, point, attrs);
            break;

        case 'scribble':
            // Start scribble path
            editorState.scribblePoints = [point];
            editorState.currentShape = drawScribble(snap, editorState.scribblePoints, attrs);
            break;
    }

    updateStatus(`Drawing ${tool}...`);
}

/**
 * Handle mouse move on canvas
 */
function handleMouseMove(e) {
    const point = getSVGCoordinates(e);

    // Update cursor position in status bar
    updateCursorPosition(point);

    if (!editorState.isDrawing) return;

    const tool = editorState.activeTool;

    switch (tool) {
        case 'line':
            if (editorState.currentShape) {
                updateLine(editorState.currentShape, point);
            }
            break;

        case 'circle':
            if (editorState.currentShape) {
                const radius = calculateDistance(editorState.startPoint, point);
                updateCircle(editorState.currentShape, radius);
            }
            break;

        case 'rect':
            if (editorState.currentShape) {
                updateRect(editorState.currentShape, editorState.startPoint, point);
            }
            break;

        case 'scribble':
            if (editorState.currentShape) {
                // Add point to scribble path (throttle points for performance)
                editorState.scribblePoints.push(point);
                updateScribble(editorState.currentShape, editorState.scribblePoints);
            }
            break;
    }
}

/**
 * Handle mouse up on canvas
 */
function handleMouseUp(e) {
    if (!editorState.isDrawing) return;

    const point = getSVGCoordinates(e);
    const tool = editorState.activeTool;

    // Finalize the shape
    switch (tool) {
        case 'line':
            updateLine(editorState.currentShape, point);
            break;

        case 'circle':
            const radius = calculateDistance(editorState.startPoint, point);
            updateCircle(editorState.currentShape, radius);
            break;

        case 'rect':
            updateRect(editorState.currentShape, editorState.startPoint, point);
            break;

        case 'scribble':
            // Final update to scribble
            if (editorState.scribblePoints.length > 0) {
                editorState.scribblePoints.push(point);
                updateScribble(editorState.currentShape, editorState.scribblePoints);
            }
            break;
    }

    // Make the newly created shape draggable and selectable
    if (editorState.currentShape) {
        makeElementDraggable(editorState.currentShape);
        editorState.currentShape.data('draggable', true);
    }

    updateStatus(`${tool.charAt(0).toUpperCase() + tool.slice(1)} created`);

    // Reset drawing state
    editorState.isDrawing = false;
    editorState.currentShape = null;
    editorState.scribblePoints = [];
}

/**
 * Handle mouse leave canvas
 */
function handleMouseLeave(e) {
    if (editorState.isDrawing) {
        handleMouseUp(e);
    }
    updateCursorPosition(null);
}

/**
 * Handle file import
 */
function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log('Importing file:', file.name);
    updateStatus(`Importing ${file.name}...`);

    // File import will be implemented in Phase 4
    updateStatus('File import feature coming soon!');
}

/**
 * Handle clear canvas
 */
function handleClearCanvas() {
    if (confirm('Are you sure you want to clear the canvas? This cannot be undone.')) {
        snap.clear();
        editorState.selectedElement = null;
        updateStatus('Canvas cleared');
    }
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyDown(e) {
    // Delete key
    if (e.key === 'Delete' && editorState.selectedElement) {
        deleteSelected();
    }

    // Escape key - deselect
    if (e.key === 'Escape' && editorState.selectedElement) {
        deselectElement();
    }
}

/**
 * Get SVG coordinates from mouse event
 */
function getSVGCoordinates(event) {
    const canvas = document.getElementById('svg-canvas');
    const rect = canvas.getBoundingClientRect();

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

/**
 * Delete selected element
 */
function deleteSelected() {
    if (editorState.selectedElement) {
        // Remove selection box if it exists
        const selectionBox = editorState.selectedElement.data('selectionBox');
        if (selectionBox) {
            selectionBox.remove();
        }

        // Remove the element
        editorState.selectedElement.remove();
        editorState.selectedElement = null;
        updateStatus('Element deleted');
    }
}

/**
 * Update status bar text
 */
function updateStatus(message) {
    const statusText = document.getElementById('status-text');
    statusText.textContent = message;
}

/**
 * Update cursor position in status bar
 */
function updateCursorPosition(point) {
    const cursorPos = document.getElementById('cursor-position');
    if (point) {
        cursorPos.textContent = `X: ${Math.round(point.x)} Y: ${Math.round(point.y)}`;
    } else {
        cursorPos.textContent = '';
    }
}

/**
 * Get current drawing attributes
 * Note: This is a wrapper that delegates to shapes.js
 */
function getDrawingAttributes() {
    return getDefaultAttributes(editorState.strokeColor, editorState.strokeWidth);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
