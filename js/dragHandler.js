/**
 * SVG Editor - Drag and Selection Handler
 * Handles shape selection and drag functionality
 */

// Opacity factor for hover/selection effects (multiply by this value)
const OPACITY_FACTOR = 0.7;

/**
 * Convert screen coordinates to SVG coordinates
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {Object} SVG coordinates {x, y}
 */
function screenToSVGCoords(screenX, screenY) {
    const canvas = document.getElementById('svg-canvas');
    const svgPoint = canvas.createSVGPoint();
    svgPoint.x = screenX;
    svgPoint.y = screenY;

    const screenCTM = canvas.getScreenCTM();
    if (screenCTM) {
        const transformed = svgPoint.matrixTransform(screenCTM.inverse());
        return { x: transformed.x, y: transformed.y };
    }
    return { x: screenX, y: screenY };
}

/**
 * Get the visual bounding box of an element in SVG coordinates
 * This accounts for all transforms applied to the element
 * @param {Snap.Element} element - The element
 * @returns {Object} Bounding box {x, y, width, height}
 */
function getVisualBBox(element) {
    const bbox = element.node.getBoundingClientRect();

    const topLeft = screenToSVGCoords(bbox.left, bbox.top);
    const bottomRight = screenToSVGCoords(bbox.right, bbox.bottom);

    return {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y
    };
}

/**
 * Update selection box position based on element's visual bounding box
 * @param {Snap.Element} element - The selected element
 * @param {Snap.Element} selectionBox - The selection box element
 */
function updateSelectionBoxPosition(element, selectionBox) {
    const visualBBox = getVisualBBox(element);
    const padding = 5;

    selectionBox.attr({
        x: visualBBox.x - padding,
        y: visualBBox.y - padding,
        width: visualBBox.width + (padding * 2),
        height: visualBBox.height + (padding * 2)
    });
}

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
        element.data('selectionBox', null);
    }

    // Also remove any orphaned selection boxes
    const orphanedBoxes = snap.selectAll('.selection-box');
    orphanedBoxes.forEach(box => box.remove());

    // Add selected class for CSS styling
    element.addClass('selected');

    // Get the visual bounding box (includes all transforms)
    const visualBBox = getVisualBBox(element);
    const padding = 5;

    // Create selection box at the visual position (no transform needed)
    const selectionBox = snap.rect(
        visualBBox.x - padding,
        visualBBox.y - padding,
        visualBBox.width + (padding * 2),
        visualBBox.height + (padding * 2)
    ).attr({
        fill: 'none',
        stroke: '#00aaff',
        strokeWidth: 1,
        strokeDasharray: '5,5',
        class: 'selection-box'
    });

    // Store reference to selection box in the element's data
    element.data('selectionBox', selectionBox);

    // Move selection box behind the selected element
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

            // Use the standard Snap.svg transform pattern
            // Concatenate original transform with new translation
            var origTransform = this.data('origTransform') || '';
            this.attr({
                transform: origTransform + (origTransform ? "T" : "t") + dx + "," + dy
            });

            // Update selection box position based on element's new visual position
            const selectionBox = this.data('selectionBox');
            if (selectionBox) {
                updateSelectionBoxPosition(this, selectionBox);
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

            // Store the original transform as a STRING (not matrix)
            // This is the correct Snap.svg pattern
            this.data('origTransform', this.transform().local);
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
