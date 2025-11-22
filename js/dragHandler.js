/**
 * SVG Editor - Drag and Selection Handler
 * Handles shape selection and drag functionality
 */

// Opacity factor for hover/selection effects (multiply by this value)
const OPACITY_FACTOR = 0.7;

/**
 * Select an element and add visual feedback
 * @param {Snap.Element} element - The element to select
 */
function selectElement(element) {
    // Deselect any currently selected element
    if (editorState.selectedElement && editorState.selectedElement !== element) {
        deselectElement();
    }

    // Store reference to selected element
    editorState.selectedElement = element;

    // Apply opacity effect for selection
    const originalOpacity = element.data('originalOpacity') || 1.0;
    element.attr({ opacity: originalOpacity * OPACITY_FACTOR });

    // Add visual feedback
    highlightSelected(element);

    updateStatus('Element selected - Drag to move, Delete to remove');
}

/**
 * Deselect the currently selected element
 */
function deselectElement() {
    if (editorState.selectedElement) {
        // Remove selection highlighting
        editorState.selectedElement.removeClass('selected');

        // Remove selection box if it exists
        const selectionBox = editorState.selectedElement.data('selectionBox');
        if (selectionBox) {
            selectionBox.remove();
            editorState.selectedElement.data('selectionBox', null);
        }

        // Restore original opacity
        const originalOpacity = editorState.selectedElement.data('originalOpacity') || 1.0;
        editorState.selectedElement.attr({ opacity: originalOpacity });

        editorState.selectedElement = null;
        updateStatus('Selection cleared');
    }
}

/**
 * Add visual highlight to selected element
 * @param {Snap.Element} element - The element to highlight
 */
function highlightSelected(element) {
    // Remove any existing selection box first (prevent duplicates)
    const existingBox = element.data('selectionBox');
    if (existingBox) {
        existingBox.remove();
    }

    // Add selected class for CSS styling
    element.addClass('selected');

    // Create a bounding box around the element
    // Use bbox coordinates directly (local coordinates before transform)
    const bbox = element.getBBox();
    const padding = 5;

    // Create selection box using local coordinates (matching the element's coordinate space)
    const selectionBox = snap.rect(
        bbox.x - padding,
        bbox.y - padding,
        bbox.width + (padding * 2),
        bbox.height + (padding * 2)
    ).attr({
        fill: 'none',
        stroke: '#00aaff',
        strokeWidth: 1,
        strokeDasharray: '5,5',
        class: 'selection-box'
    });

    // Apply the same transform as the element to the selection box
    // This ensures they move together perfectly
    const matrix = element.transform().localMatrix;
    selectionBox.attr({
        transform: `matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},${matrix.e},${matrix.f})`
    });

    // Store reference to selection box in the element's data
    element.data('selectionBox', selectionBox);

    // Move selection box to front (but behind the selected element)
    selectionBox.insertBefore(element);
}

/**
 * Make an element draggable
 * @param {Snap.Element} element - The element to make draggable
 */
function makeElementDraggable(element) {
    // Store the original opacity for this element
    const currentOpacity = element.attr('opacity');
    element.data('originalOpacity', currentOpacity !== undefined ? currentOpacity : 1.0);

    // Enable drag functionality using Snap.svg .drag() method
    element.drag(
        // Move handler - called during drag
        function(dx, dy, x, y, event) {
            // Only drag if select tool is active and element is selected
            if (editorState.activeTool !== 'select' || editorState.selectedElement !== this) {
                return;
            }

            // Get the original transform matrix
            const origMatrix = this.data('origTransform');

            // Create new matrix by adding the drag delta to the original translation
            // Use direct translation values to avoid matrix multiplication issues
            const newMatrix = new Snap.Matrix(
                origMatrix.a, origMatrix.b,
                origMatrix.c, origMatrix.d,
                origMatrix.e + dx, origMatrix.f + dy
            );

            // Apply the new transform to the element
            const transformStr = `matrix(${newMatrix.a},${newMatrix.b},${newMatrix.c},${newMatrix.d},${newMatrix.e},${newMatrix.f})`;
            this.attr({
                transform: transformStr
            });

            // Update selection box with the same transform
            const selectionBox = this.data('selectionBox');
            if (selectionBox) {
                selectionBox.attr({
                    transform: transformStr
                });
            }
        },

        // Start handler - called when drag starts
        function(x, y, event) {
            // Only start drag if select tool is active
            if (editorState.activeTool !== 'select') {
                return;
            }

            // Select element if not already selected (enables drag-on-click)
            if (editorState.selectedElement !== this) {
                selectElement(this);
            }

            // Store the original transform matrix
            this.data('origTransform', this.transform().localMatrix);
        },

        // End handler - called when drag ends
        function(event) {
            // Drag complete
            if (editorState.selectedElement === this) {
                updateStatus('Element moved');
            }
        }
    );

    // Make element clickable for selection
    element.click(function(event) {
        event.stopPropagation();

        // Handle different tools
        switch (editorState.activeTool) {
            case 'select':
                selectElement(this);
                break;

            case 'delete':
                // Delete the element properly
                deleteElement(this);
                break;
        }
    });

    // Add hover effect for select tool
    element.hover(
        function() {
            // Mouse enter - multiply opacity by factor
            if (editorState.activeTool === 'select' && editorState.selectedElement !== this) {
                const originalOpacity = this.data('originalOpacity') || 1.0;
                this.attr({ opacity: originalOpacity * OPACITY_FACTOR });
            }
        },
        function() {
            // Mouse leave - restore original opacity
            if (editorState.selectedElement !== this) {
                const originalOpacity = this.data('originalOpacity') || 1.0;
                this.attr({ opacity: originalOpacity });
            }
        }
    );
}

/**
 * Make all existing shapes in the canvas selectable and draggable
 */
function makeAllShapesDraggable() {
    // Get all child elements of the SVG
    const children = snap.selectAll('line, circle, rect, path, polyline, polygon, ellipse');

    children.forEach(element => {
        // Skip elements that already have drag handlers
        if (!element.data('draggable')) {
            makeElementDraggable(element);
            element.data('draggable', true);
        }
    });

    console.log(`Made ${children.length} shapes draggable`);
}

/**
 * Delete an element and clean up properly
 * @param {Snap.Element} element - The element to delete
 */
function deleteElement(element) {
    // Remove selection box if it exists
    const selectionBox = element.data('selectionBox');
    if (selectionBox) {
        selectionBox.remove();
    }

    // Clear selection if this element is selected
    if (editorState.selectedElement === element) {
        editorState.selectedElement = null;
    }

    // Delete the element
    element.remove();
    updateStatus('Element deleted');
}

/**
 * Handle canvas click (for deselection)
 */
function handleCanvasClick(event) {
    // Only deselect if clicking directly on canvas (not on a shape)
    if (event.target.id === 'svg-canvas') {
        deselectElement();
    }
}
