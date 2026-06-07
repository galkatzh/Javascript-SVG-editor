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
    fillTransparent: true,          // Transparent fill flag (default: true)
    shapeOpacity: 1.0,              // Shape opacity (0-1)
    customWidth: null,              // Custom canvas width (null = auto)
    customHeight: null,             // Custom canvas height (null = auto)
    selectedElement: null,          // Primary selected shape (last of selection)
    selectedElements: [],           // All currently selected shapes
    isDrawing: false,               // Drawing state flag
    startPoint: { x: 0, y: 0 },    // Start point for drawing
    currentShape: null,             // Temporary shape while drawing
    scribblePoints: [],             // Points for scribble tool
    isMarqueeSelecting: false,      // Marquee (rubber-band) selection in progress
    marqueeBox: null,               // Temporary marquee rectangle element
    isMovingSelection: false,       // Group move (drag) of the selection in progress
    moveOccurred: false,            // Whether the current move actually shifted shapes
    isDeleting: false,              // Sweep-to-delete gesture in progress
    deleteSet: new Set(),           // Elements marked during a delete sweep
    suppressNextCanvasClick: false  // Skip one canvas-click deselect (after marquee)
};

// Snap.svg instance
let snap = null;

/**
 * Initialize the application
 */
function init() {
    console.log('Initializing SVG Editor...');

    // Snap.svg is loaded from a CDN. If that request fails (offline, blocked
    // network, CDN outage) the library is missing and the editor cannot work.
    // Detect it up front and show a visible message instead of failing silently.
    if (typeof Snap === 'undefined') {
        showFatalError(
            'Failed to load Snap.svg',
            'The drawing library could not be loaded from the CDN. ' +
            'Check your internet connection and reload the page.'
        );
        console.error('Snap.svg is not available - aborting initialization.');
        return;
    }

    try {
        // Initialize Snap.svg
        const svgCanvas = document.getElementById('svg-canvas');
        snap = Snap('#svg-canvas');

        // Set SVG dimensions to match container
        resizeSVGCanvas();

        // Setup event listeners
        setupToolbar();
        setupCanvas();
        setupWindowEvents();

        // Wire up undo/redo and capture the empty baseline state
        setupHistory();

        // Update status
        updateStatus('Ready - Select a tool to start drawing');

        console.log('SVG Editor initialized successfully!');
    } catch (error) {
        showFatalError(
            'Failed to start the editor',
            'Something went wrong while initializing the canvas. ' +
            'Please reload the page.'
        );
        console.error('Initialization failed:', error);
    }
}

/**
 * Show a visible, blocking error banner when the editor cannot start.
 * Used when a critical dependency (e.g. Snap.svg) is missing.
 */
function showFatalError(title, detail) {
    // Avoid stacking multiple banners
    if (document.getElementById('fatal-error')) {
        return;
    }

    const banner = document.createElement('div');
    banner.id = 'fatal-error';
    banner.setAttribute('role', 'alert');

    const heading = document.createElement('strong');
    heading.textContent = title;

    const message = document.createElement('span');
    message.textContent = detail;

    const reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.textContent = 'Reload';
    reloadBtn.addEventListener('click', () => window.location.reload());

    banner.appendChild(heading);
    banner.appendChild(message);
    banner.appendChild(reloadBtn);
    document.body.appendChild(banner);

    // Reflect the failure in the status bar too
    updateStatus(title);
}

/**
 * Get all drawable content elements, excluding UI helper rects (the selection
 * boxes and the marquee box). Those are not content: they must not affect
 * canvas sizing and must not be shifted during normalization, or they desync
 * from the shapes they annotate.
 * @returns {Array<Snap.Element>}
 */
function getContentElements() {
    const elements = [];
    snap.selectAll('line, circle, rect, path, polyline, polygon, ellipse, text').forEach(el => {
        if (!el.node.classList.contains('selection-box') &&
            !el.node.classList.contains('marquee-box')) {
            elements.push(el);
        }
    });
    return elements;
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

    // Get all drawable content elements (excluding selection/marquee helper rects)
    const elements = getContentElements();

    if (elements.length > 0) {
        // Calculate the bounding box of all elements (accounting for transforms)
        let maxX = 0;
        let maxY = 0;
        let minX = 0;
        let minY = 0;

        elements.forEach(element => {
            try {
                // Snap's getBBox() already accounts for the element's transform,
                // so it IS the visual bounding box. (Re-applying the transform
                // matrix here would double-count it, making the canvas grow by an
                // extra drag-distance and shapes appear to jump on resize.)
                const bbox = element.getBBox();
                maxX = Math.max(maxX, bbox.x + bbox.width);
                maxY = Math.max(maxY, bbox.y + bbox.height);
                minX = Math.min(minX, bbox.x);
                minY = Math.min(minY, bbox.y);
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

                    // Update selection box using visual bounding box
                    const selectionBox = element.data('selectionBox');
                    if (selectionBox && typeof updateSelectionBoxPosition === 'function') {
                        updateSelectionBoxPosition(element, selectionBox);
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
    // Get all drawable content elements (excluding selection/marquee helper rects)
    const elements = getContentElements();

    if (elements.length === 0) {
        return; // No elements to normalize
    }

    // Calculate the actual visual bounding box of all elements (accounting for transforms)
    let minX = Infinity;
    let minY = Infinity;

    elements.forEach(element => {
        try {
            // Snap's getBBox() already includes the element's transform, so it is
            // the visual bounding box directly (no need to re-apply the matrix).
            const bbox = element.getBBox();
            minX = Math.min(minX, bbox.x);
            minY = Math.min(minY, bbox.y);
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

                // Update selection box using visual bounding box
                const selectionBox = element.data('selectionBox');
                if (selectionBox && typeof updateSelectionBoxPosition === 'function') {
                    updateSelectionBoxPosition(element, selectionBox);
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
        if (applyToSelection({ stroke: e.target.value }, 'Stroke color')) {
            recordHistory();
            return;
        }
        updateStatus(`Stroke color changed to ${e.target.value}`);
    });

    // Stroke width slider
    const widthSlider = document.getElementById('stroke-width');
    const widthValueDisplay = document.getElementById('stroke-width-value');
    widthSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        editorState.strokeWidth = value;
        widthValueDisplay.textContent = value;
        if (applyToSelection({ strokeWidth: value }, 'Stroke width')) return;
        updateStatus(`Line width changed to ${value}px`);
    });
    // Record one history step per slider adjustment (on release), not per tick,
    // and only when a selection was actually being edited.
    widthSlider.addEventListener('change', () => {
        if (editorState.selectedElements.length > 0) recordHistory();
    });

    // Shape opacity slider
    const opacitySlider = document.getElementById('shape-opacity');
    const opacityValueDisplay = document.getElementById('opacity-value');
    opacitySlider.addEventListener('input', (e) => {
        const percent = parseInt(e.target.value);
        editorState.shapeOpacity = percent / 100;
        opacityValueDisplay.textContent = percent;
        if (applyOpacityToSelection(percent / 100)) return;
        updateStatus(`Opacity set to ${percent}%`);
    });
    opacitySlider.addEventListener('change', () => {
        if (editorState.selectedElements.length > 0) recordHistory();
    });

    // Setup expandable sliders
    setupExpandableSliders();

    // Fill color picker
    const fillColorPicker = document.getElementById('fill-color');
    const fillColorWrap = document.querySelector('.fill-color-wrap');

    fillColorPicker.addEventListener('change', (e) => {
        editorState.fillColor = e.target.value;
        // If color is changed, uncheck transparent
        if (editorState.fillTransparent) {
            editorState.fillTransparent = false;
            document.getElementById('fill-transparent').checked = false;
            fillColorWrap.classList.remove('disabled');
        }
        if (applyToSelection({ fill: e.target.value }, 'Fill color')) {
            recordHistory();
            return;
        }
        updateStatus(`Fill color changed to ${e.target.value}`);
    });

    // Fill transparent checkbox
    const fillTransparentCheckbox = document.getElementById('fill-transparent');
    fillTransparentCheckbox.addEventListener('change', (e) => {
        editorState.fillTransparent = e.target.checked;
        updateFillColorState();
        const fill = e.target.checked ? 'none' : editorState.fillColor;
        if (applyToSelection({ fill: fill }, 'Fill')) {
            recordHistory();
            return;
        }
        if (e.target.checked) {
            updateStatus('Fill set to transparent');
        } else {
            updateStatus(`Fill color set to ${editorState.fillColor}`);
        }
    });

    // Initialize fill color state (disabled by default since transparent is checked)
    updateFillColorState();

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

    // Select tool
    if (tool === 'select') {
        // Press inside the current selection → move the whole group, even if the
        // press landed on empty canvas within the selection's bounds.
        if (editorState.selectedElements.length > 0 && isPointInSelection(point)) {
            beginSelectionMove();
            return;
        }

        // Press on an (unselected) shape → select it and start moving it.
        const shapeNode = drawableShapeNode(e.target);
        if (shapeNode) {
            const element = findSnapElement(shapeNode);
            if (element) {
                selectElement(element);
                beginSelectionMove();
                return;
            }
        }

        // Press on empty canvas outside any selection → start a marquee selection.
        clearSelection();
        editorState.isMarqueeSelecting = true;
        editorState.marqueeBox = drawMarquee(snap, point);
        return;
    }

    // Delete tool: begin a press-and-sweep gesture. Each shape the cursor
    // passes over fades and is queued for deletion on release.
    if (tool === 'delete') {
        editorState.isDeleting = true;
        editorState.deleteSet.clear();
        markElementForDeletion(elementAtPoint(e.clientX, e.clientY));
        updateStatus('Sweep over shapes to delete, release to confirm');
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

    // Move the current selection (group drag)
    if (editorState.isMovingSelection) {
        updateSelectionMove(point);
        return;
    }

    // Grow the marquee selection rectangle
    if (editorState.isMarqueeSelecting) {
        updateMarquee(editorState.marqueeBox, editorState.startPoint, point);
        return;
    }

    // Sweep-to-delete: fade whatever shape is under the cursor
    if (editorState.isDeleting) {
        markElementForDeletion(elementAtPoint(e.clientX, e.clientY));
        return;
    }

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
    // Finish a group move
    if (editorState.isMovingSelection) {
        endSelectionMove();
        return;
    }

    // Finish a marquee selection: select everything the box intersects
    if (editorState.isMarqueeSelecting) {
        const endPoint = getSVGCoordinates(e);
        if (editorState.marqueeBox) {
            editorState.marqueeBox.remove();
            editorState.marqueeBox = null;
        }
        editorState.isMarqueeSelecting = false;
        selectElementsInRect(
            editorState.startPoint.x, editorState.startPoint.y,
            endPoint.x, endPoint.y
        );
        // The drag ends with a synthetic click on the canvas; don't deselect.
        editorState.suppressNextCanvasClick = true;
        return;
    }

    // Finish a sweep-to-delete: remove all marked shapes
    if (editorState.isDeleting) {
        markElementForDeletion(elementAtPoint(e.clientX, e.clientY));
        editorState.isDeleting = false;
        commitDeletion();
        return;
    }

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

    // Record the new shape in the undo history
    recordHistory();

    // Reset drawing state
    editorState.isDrawing = false;
    editorState.currentShape = null;
    editorState.scribblePoints = [];
}

/**
 * Handle mouse leave canvas
 */
function handleMouseLeave(e) {
    // Commit any in-progress gesture when the cursor leaves the canvas
    if (editorState.isDrawing || editorState.isMarqueeSelecting ||
        editorState.isDeleting || editorState.isMovingSelection) {
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

    // Use fileHandler module to import SVG. Each imported shape is recorded as
    // its own history step (in creation order) via the per-element callback, so
    // undo peels imported shapes back one at a time.
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
        },
        () => {
            // Per-element callback: record one history step per imported shape
            recordHistory();
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
    if (confirm('Are you sure you want to clear the canvas?')) {
        snap.clear();
        editorState.selectedElement = null;
        editorState.selectedElements = [];
        syncPropertiesPanel();
        updateStatus('Canvas cleared');
        recordHistory();
    }
}

/**
 * Select a tool by name (used for keyboard shortcuts)
 */
function selectToolByName(toolName) {
    const button = document.querySelector(`.tool-btn[data-tool="${toolName}"]`);
    if (button) {
        // Update active tool
        editorState.activeTool = toolName;

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

        updateStatus(`Tool changed to: ${toolName}`);
    }
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyDown(e) {
    // Don't trigger shortcuts when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    // Undo (Ctrl/Cmd+Z) and Redo (Ctrl/Cmd+Shift+Z)
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            redo();
        } else {
            undo();
        }
        return;
    }

    // Tool shortcuts (only when no modifier keys are pressed)
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();

        switch (key) {
            case 'v':
                selectToolByName('select');
                e.preventDefault();
                break;
            case 'l':
                selectToolByName('line');
                e.preventDefault();
                break;
            case 'c':
                selectToolByName('circle');
                e.preventDefault();
                break;
            case 'r':
                selectToolByName('rect');
                e.preventDefault();
                break;
            case 'p':
                selectToolByName('scribble');
                e.preventDefault();
                break;
            case 'x':
                selectToolByName('delete');
                e.preventDefault();
                break;
        }
    }

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
    const toDelete = editorState.selectedElements.slice();
    if (toDelete.length === 0) return;

    toDelete.forEach(element => {
        const selectionBox = element.data('selectionBox');
        if (selectionBox) {
            selectionBox.remove();
        }
        element.remove();
    });

    editorState.selectedElements = [];
    editorState.selectedElement = null;
    syncPropertiesPanel();
    updateStatus(`Deleted ${toDelete.length} element(s)`);
    recordHistory();
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

/**
 * Setup expandable slider widgets
 * Adds click-to-expand behavior and click-outside-to-collapse
 */
function setupExpandableSliders() {
    const sliders = document.querySelectorAll('.expandable-slider');

    sliders.forEach(slider => {
        const trigger = slider.querySelector('.slider-trigger');

        // Toggle expanded state on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close other expanded sliders
            sliders.forEach(s => {
                if (s !== slider) {
                    s.classList.remove('expanded');
                }
            });

            // Toggle this slider
            slider.classList.toggle('expanded');
        });

        // Prevent clicks inside slider panel from closing it
        const panel = slider.querySelector('.slider-panel');
        panel.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });

    // Close all sliders when clicking outside
    document.addEventListener('click', () => {
        sliders.forEach(slider => {
            slider.classList.remove('expanded');
        });
    });
}

/**
 * Update fill color input disabled state based on transparent checkbox
 */
function updateFillColorState() {
    const fillColorWrap = document.querySelector('.fill-color-wrap');
    if (editorState.fillTransparent) {
        fillColorWrap.classList.add('disabled');
    } else {
        fillColorWrap.classList.remove('disabled');
    }
}

/* ============================================
   Editing properties of the selected shape(s)
   The properties panel does double duty: with nothing selected it sets the
   defaults for the next shape drawn; with a selection it edits those shapes.
   ============================================ */

/**
 * Apply an attribute change to every selected shape. Returns true if a
 * selection existed (and was updated), so callers can skip their "default
 * changed" status message. Opacity is handled separately because selected
 * shapes are shown dimmed (see applyOpacityToSelection).
 * @param {Object} attrs - Snap attributes to set on each selected element
 * @param {string} label - Human-readable property name for the status bar
 * @returns {boolean} Whether the change was applied to a selection
 */
function applyToSelection(attrs, label) {
    const selected = editorState.selectedElements;
    if (selected.length === 0) return false;

    selected.forEach(element => {
        element.attr(attrs);
        // Stroke width changes the visual bounds, so keep the box in sync.
        const selectionBox = element.data('selectionBox');
        if (selectionBox && typeof updateSelectionBoxPosition === 'function') {
            updateSelectionBoxPosition(element, selectionBox);
        }
    });

    updateStatus(`${label} updated on ${selected.length} shape(s)`);
    return true;
}

/**
 * Apply an opacity change to every selected shape. Selected shapes are rendered
 * dimmed (opacity × OPACITY_FACTOR) with their true opacity kept in element
 * data, so we update that data and the displayed (dimmed) value together.
 * @param {number} opacity - The new opacity (0-1)
 * @returns {boolean} Whether the change was applied to a selection
 */
function applyOpacityToSelection(opacity) {
    const selected = editorState.selectedElements;
    if (selected.length === 0) return false;

    selected.forEach(element => {
        element.data('originalOpacity', opacity);
        element.attr({ opacity: opacity * OPACITY_FACTOR });
    });

    updateStatus(`Opacity updated on ${selected.length} shape(s)`);
    return true;
}

/**
 * Reflect the current selection in the properties panel.
 * - No selection: show the editor defaults (used for the next shape drawn) and
 *   hide the batch-editing note.
 * - One shape: populate every control from that shape's own attributes.
 * - Multiple shapes: populate from the primary shape and show the batch note,
 *   signalling that edits affect the whole selection.
 */
function syncPropertiesPanel() {
    const selected = editorState.selectedElements;
    const batchNote = document.getElementById('batch-note');
    const batchNoteText = document.getElementById('batch-note-text');

    if (selected.length > 1) {
        batchNoteText.textContent = `Editing ${selected.length} shapes`;
        batchNote.hidden = false;
    } else {
        batchNote.hidden = true;
    }

    if (selected.length === 0) {
        populatePanelControls();
        return;
    }

    // Adopt the primary shape's properties as the panel/editor values, so the
    // controls describe what's selected (and new shapes inherit them too).
    adoptElementProperties(editorState.selectedElement || selected[selected.length - 1]);
    populatePanelControls();
}

/**
 * Copy a shape's style attributes into editorState so the panel can display
 * them. Unparseable or missing attributes leave the current value untouched.
 * @param {Snap.Element} element - The shape to read from
 */
function adoptElementProperties(element) {
    // Read effective styles via getComputedStyle: it resolves both presentation
    // attributes and inline styles (Snap writes stroke-width/linecap into the
    // style attribute), and sidesteps Snap 0.5.1's attr() getter, which throws
    // on color-valued attributes (it parses them through a querySelector path).
    const style = window.getComputedStyle(element.node);

    const stroke = style.stroke;
    if (stroke && stroke !== 'none') {
        editorState.strokeColor = colorToHex(stroke);
    }

    const width = parseFloat(style.strokeWidth);
    if (!isNaN(width)) {
        editorState.strokeWidth = clampStrokeWidth(width);
    }

    const fill = style.fill;
    if (!fill || fill === 'none') {
        editorState.fillTransparent = true;
    } else {
        editorState.fillTransparent = false;
        editorState.fillColor = colorToHex(fill);
    }

    // Selected shapes are displayed dimmed; their true opacity lives in data.
    // Fall back to the computed opacity only when the data hasn't been set.
    let opacity = element.data('originalOpacity');
    if (opacity === undefined || opacity === null) {
        opacity = style.opacity;
    }
    opacity = parseFloat(opacity);
    if (!isNaN(opacity)) {
        editorState.shapeOpacity = clamp01(opacity);
    }
}

/**
 * Push the current editorState style values into the panel controls.
 */
function populatePanelControls() {
    document.getElementById('stroke-color').value = editorState.strokeColor;
    setStrokeWidthControl(editorState.strokeWidth);
    document.getElementById('fill-color').value = editorState.fillColor;
    document.getElementById('fill-transparent').checked = editorState.fillTransparent;
    updateFillColorState();
    setOpacityControl(Math.round(editorState.shapeOpacity * 100));
}

/**
 * Set the stroke-width slider and its numeric readout together.
 * @param {number} value - Stroke width in pixels
 */
function setStrokeWidthControl(value) {
    document.getElementById('stroke-width').value = value;
    document.getElementById('stroke-width-value').textContent = value;
}

/**
 * Set the opacity slider and its numeric readout together.
 * @param {number} percent - Opacity as a percentage (0-100)
 */
function setOpacityControl(percent) {
    document.getElementById('shape-opacity').value = percent;
    document.getElementById('opacity-value').textContent = percent;
}

/**
 * Normalize any CSS color string to a #rrggbb hex value so it can populate an
 * <input type="color">. Named colors and rgb()/rgba() are converted via a
 * canvas context. Falls back to black when the color can't be parsed.
 * @param {string} color - A CSS color (hex, name, rgb(), ...)
 * @returns {string} A #rrggbb hex color
 */
function colorToHex(color) {
    if (!color) return '#000000';
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();

    // Let the browser normalize the color by assigning it to a canvas context.
    const ctx = colorToHex._ctx ||
        (colorToHex._ctx = document.createElement('canvas').getContext('2d'));
    ctx.fillStyle = '#000000';
    ctx.fillStyle = color;
    const normalized = ctx.fillStyle;

    if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.toLowerCase();

    // rgb()/rgba() form → hex
    const parts = normalized.match(/\d+/g);
    if (parts && parts.length >= 3) {
        return '#' + parts.slice(0, 3)
            .map(n => parseInt(n, 10).toString(16).padStart(2, '0'))
            .join('');
    }
    return '#000000';
}

/**
 * Clamp a stroke width to the slider's supported range (1-50, integer).
 * @param {number} w - Raw stroke width
 * @returns {number}
 */
function clampStrokeWidth(w) {
    return Math.max(1, Math.min(50, Math.round(w)));
}

/**
 * Clamp a value to the 0-1 range.
 * @param {number} v - Raw value
 * @returns {number}
 */
function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
