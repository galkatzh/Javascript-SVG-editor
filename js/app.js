/**
 * SVG Editor - Main Application
 * Vanilla JavaScript with Snap.svg
 */

// Global state management
const editorState = {
    activeTool: 'select',           // Current active tool
    strokeColor: '#000000',         // Current stroke color
    strokeWidth: 2,                 // Current stroke width
    fillColor: '#ffffff',           // Current fill color
    fillTransparent: false,         // Transparent fill flag
    shapeOpacity: 1.0,              // Shape opacity (0-1)
    customWidth: null,              // Custom canvas width (null = auto)
    customHeight: null,             // Custom canvas height (null = auto)
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
 * Resize SVG canvas to match container or custom dimensions
 * Ensures canvas grows to bottom and right, keeping 0,0 at top-left
 */
function resizeSVGCanvas() {
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();

    // Start with custom dimensions if set, otherwise use container dimensions
    let width = editorState.customWidth || rect.width;
    let height = editorState.customHeight || rect.height;

    // Store the original requested dimensions before any adjustments
    const requestedWidth = width;
    const requestedHeight = height;

    // Get all drawable elements
    const elements = snap.selectAll('line, circle, rect, path, polyline, polygon, ellipse, text');

    if (elements.length > 0) {
        // Calculate the bounding box of all elements (accounting for transforms)
        let maxX = 0;
        let maxY = 0;
        let minX = 0;
        let minY = 0;

        elements.forEach(element => {
            try {
                // Get the bounding box and transform matrix
                const bbox = element.getBBox();
                const matrix = element.transform().localMatrix;

                // Calculate the four corners of the bounding box
                const corners = [
                    { x: bbox.x, y: bbox.y },
                    { x: bbox.x + bbox.width, y: bbox.y },
                    { x: bbox.x, y: bbox.y + bbox.height },
                    { x: bbox.x + bbox.width, y: bbox.y + bbox.height }
                ];

                // Transform each corner and find min/max
                corners.forEach(corner => {
                    const transformedX = matrix.x(corner.x, corner.y);
                    const transformedY = matrix.y(corner.x, corner.y);
                    maxX = Math.max(maxX, transformedX);
                    maxY = Math.max(maxY, transformedY);
                    minX = Math.min(minX, transformedX);
                    minY = Math.min(minY, transformedY);
                });
            } catch (e) {
                // Skip elements that don't have a bounding box
                console.warn('Could not get bounding box for element:', element);
            }
        });

        // If there are negative coordinates, shift all elements to ensure 0,0 is top-left
        if (minX < 0 || minY < 0) {
            const offsetX = minX < 0 ? -minX : 0;
            const offsetY = minY < 0 ? -minY : 0;

            console.log(`Shifting elements to prevent negative coordinates: offsetX=${offsetX}, offsetY=${offsetY}`);

            elements.forEach(element => {
                try {
                    // Get current transform matrix
                    const matrix = element.transform().localMatrix;

                    // Apply additional translation to the existing transform
                    const newMatrix = matrix.translate(offsetX, offsetY);

                    // Convert matrix to SVG transform string
                    element.attr({
                        transform: `matrix(${newMatrix.a},${newMatrix.b},${newMatrix.c},${newMatrix.d},${newMatrix.e},${newMatrix.f})`
                    });

                    // Update selection box if element has one
                    const selectionBox = element.data('selectionBox');
                    if (selectionBox) {
                        const bbox = element.getBBox();
                        const updatedMatrix = element.transform().localMatrix;

                        // Transform the top-left corner of the bounding box
                        const transformedX = updatedMatrix.x(bbox.x, bbox.y);
                        const transformedY = updatedMatrix.y(bbox.x, bbox.y);

                        const padding = 5;
                        selectionBox.attr({
                            x: transformedX - padding,
                            y: transformedY - padding,
                            width: bbox.width + (padding * 2),
                            height: bbox.height + (padding * 2)
                        });
                    }
                } catch (e) {
                    console.warn('Could not shift element:', element, e);
                }
            });

            // Adjust max coordinates after shift
            maxX += offsetX;
            maxY += offsetY;
        }

        // Add some padding to ensure elements aren't right at the edge
        const padding = 10;
        const minRequiredWidth = Math.ceil(maxX) + padding;
        const minRequiredHeight = Math.ceil(maxY) + padding;

        // Ensure canvas is large enough to contain all elements
        // Canvas grows to the bottom and right as needed
        width = Math.max(width, minRequiredWidth);
        height = Math.max(height, minRequiredHeight);
    }

    // Always set viewBox to start at 0,0 (top-left corner)
    // This ensures the canvas origin stays at top-left and extends right/down
    snap.attr({
        width: width,
        height: height,
        viewBox: `0 0 ${width} ${height}`
    });

    // Update the custom width/height in state if they were adjusted
    if (editorState.customWidth && width > requestedWidth) {
        editorState.customWidth = width;
        document.getElementById('canvas-width').value = width;
    }
    if (editorState.customHeight && height > requestedHeight) {
        editorState.customHeight = height;
        document.getElementById('canvas-height').value = height;
    }
}

/**
 * Normalize canvas coordinates to ensure leftmost X is 0 and topmost Y is 0
 * This prevents negative coordinates that cause issues during export
 */
function normalizeCanvasCoordinates() {
    // Get all drawable elements
    const elements = snap.selectAll('line, circle, rect, path, polyline, polygon, ellipse, text');

    if (elements.length === 0) {
        return; // No elements to normalize
    }

    // Calculate the actual visual bounding box of all elements (accounting for transforms)
    let minX = Infinity;
    let minY = Infinity;

    elements.forEach(element => {
        try {
            // Get the bounding box and transform matrix
            const bbox = element.getBBox();
            const matrix = element.transform().localMatrix;

            // Calculate the four corners of the bounding box
            const corners = [
                { x: bbox.x, y: bbox.y },
                { x: bbox.x + bbox.width, y: bbox.y },
                { x: bbox.x, y: bbox.y + bbox.height },
                { x: bbox.x + bbox.width, y: bbox.y + bbox.height }
            ];

            // Transform each corner and find the minimum X and Y
            corners.forEach(corner => {
                const transformedX = matrix.x(corner.x, corner.y);
                const transformedY = matrix.y(corner.x, corner.y);
                minX = Math.min(minX, transformedX);
                minY = Math.min(minY, transformedY);
            });
        } catch (e) {
            // Skip elements that don't have a bounding box
            console.warn('Could not get bounding box for element:', element);
        }
    });

    // If we have negative coordinates, translate all elements
    if (minX < 0 || minY < 0) {
        const offsetX = minX < 0 ? -minX : 0;
        const offsetY = minY < 0 ? -minY : 0;

        console.log(`Normalizing coordinates: offsetX=${offsetX}, offsetY=${offsetY}`);

        elements.forEach(element => {
            try {
                // Get current transform matrix
                const matrix = element.transform().localMatrix;

                // Apply additional translation to the existing transform
                const newMatrix = matrix.translate(offsetX, offsetY);

                // Convert matrix to SVG transform string
                element.attr({
                    transform: `matrix(${newMatrix.a},${newMatrix.b},${newMatrix.c},${newMatrix.d},${newMatrix.e},${newMatrix.f})`
                });

                // Update selection box if element has one
                const selectionBox = element.data('selectionBox');
                if (selectionBox) {
                    const bbox = element.getBBox();
                    const updatedMatrix = element.transform().localMatrix;

                    // Transform the top-left corner of the bounding box
                    const transformedX = updatedMatrix.x(bbox.x, bbox.y);
                    const transformedY = updatedMatrix.y(bbox.x, bbox.y);

                    const padding = 5;
                    selectionBox.attr({
                        x: transformedX - padding,
                        y: transformedY - padding,
                        width: bbox.width + (padding * 2),
                        height: bbox.height + (padding * 2)
                    });
                }
            } catch (e) {
                console.warn('Could not normalize element:', element, e);
            }
        });

        updateStatus(`Coordinates normalized (offset: ${Math.round(offsetX)}, ${Math.round(offsetY)})`);
    }
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

    // Stroke color picker
    const colorPicker = document.getElementById('stroke-color');
    colorPicker.addEventListener('change', (e) => {
        editorState.strokeColor = e.target.value;
        updateStatus(`Stroke color changed to ${e.target.value}`);
    });

    // Line width
    const widthInput = document.getElementById('stroke-width');
    widthInput.addEventListener('change', (e) => {
        editorState.strokeWidth = parseInt(e.target.value);
        updateStatus(`Line width changed to ${e.target.value}px`);
    });

    // Fill color picker
    const fillColorPicker = document.getElementById('fill-color');
    fillColorPicker.addEventListener('change', (e) => {
        editorState.fillColor = e.target.value;
        // If color is changed, uncheck transparent
        if (editorState.fillTransparent) {
            editorState.fillTransparent = false;
            document.getElementById('fill-transparent').checked = false;
        }
        updateStatus(`Fill color changed to ${e.target.value}`);
    });

    // Fill transparent checkbox
    const fillTransparentCheckbox = document.getElementById('fill-transparent');
    fillTransparentCheckbox.addEventListener('change', (e) => {
        editorState.fillTransparent = e.target.checked;
        if (e.target.checked) {
            updateStatus('Fill set to transparent');
        } else {
            updateStatus(`Fill color set to ${editorState.fillColor}`);
        }
    });

    // Shape opacity slider
    const opacitySlider = document.getElementById('shape-opacity');
    const opacityValue = document.getElementById('opacity-value');
    opacitySlider.addEventListener('input', (e) => {
        const percent = parseInt(e.target.value);
        editorState.shapeOpacity = percent / 100;
        opacityValue.textContent = percent;
        updateStatus(`Opacity set to ${percent}%`);
    });

    // Canvas width input
    const canvasWidthInput = document.getElementById('canvas-width');
    canvasWidthInput.addEventListener('change', (e) => {
        const value = e.target.value;
        editorState.customWidth = value ? parseInt(value) : null;
        resizeSVGCanvas();
        if (value) {
            updateStatus(`Canvas width set to ${value}px`);
        } else {
            updateStatus('Canvas width set to auto');
        }
    });

    // Canvas height input
    const canvasHeightInput = document.getElementById('canvas-height');
    canvasHeightInput.addEventListener('change', (e) => {
        const value = e.target.value;
        editorState.customHeight = value ? parseInt(value) : null;
        resizeSVGCanvas();
        if (value) {
            updateStatus(`Canvas height set to ${value}px`);
        } else {
            updateStatus('Canvas height set to auto');
        }
    });

    // Import SVG button
    const importBtn = document.getElementById('import-svg');
    const fileInput = document.getElementById('file-input');

    importBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileImport);

    // Export SVG button
    const exportBtn = document.getElementById('export-svg');
    exportBtn.addEventListener('click', handleFileExport);

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

    // Remove all cursor-related classes explicitly
    canvas.classList.remove('cursor-select', 'cursor-delete', 'cursor-move');

    switch (editorState.activeTool) {
        case 'select':
            canvas.classList.add('cursor-select');
            break;
        case 'delete':
            canvas.classList.add('cursor-delete');
            break;
        default:
            // Drawing tools use crosshair (default from CSS)
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

    const attrs = getDefaultAttributes(
        editorState.strokeColor,
        editorState.strokeWidth,
        editorState.fillColor,
        editorState.fillTransparent,
        editorState.shapeOpacity
    );

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

    // Use fileHandler module to import SVG
    importSVG(
        file,
        snap,
        (count) => {
            // Success callback
            updateStatus(`Successfully imported ${count} element(s) from ${file.name}`);
            console.log(`Imported ${count} elements`);
        },
        (errorMessage) => {
            // Error callback
            updateStatus(`Import failed: ${errorMessage}`);
            console.error('Import error:', errorMessage);
            alert(`Import failed: ${errorMessage}`);
        }
    );

    // Clear the file input so the same file can be imported again
    e.target.value = '';
}

/**
 * Handle file export
 */
async function handleFileExport() {
    updateStatus('Exporting SVG...');

    const result = await exportSVGWithDialog(snap);

    if (result.success) {
        updateStatus(`SVG exported as ${result.filename}`);
        console.log('Export successful:', result.filename);
    } else if (result.cancelled) {
        updateStatus('Export cancelled');
        console.log('Export cancelled by user');
    } else {
        updateStatus('Export failed - see console for details');
        console.error('Export failed:', result.error);
        alert('Failed to export SVG. Please try again.');
    }
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

    // Use SVG's built-in coordinate transformation to handle viewBox scaling
    const point = canvas.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;

    const screenCTM = canvas.getScreenCTM();
    if (screenCTM) {
        const svgPoint = point.matrixTransform(screenCTM.inverse());
        return { x: svgPoint.x, y: svgPoint.y };
    }

    // Fallback for browsers that don't support getScreenCTM
    const rect = canvas.getBoundingClientRect();
    const viewBox = canvas.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
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
