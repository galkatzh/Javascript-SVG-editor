/**
 * SVG Editor - Drag and Selection Handler
 * Handles shape selection and drag functionality
 */

// Opacity factor for hover/selection effects (multiply by this value)
const OPACITY_FACTOR = 0.7;

// Sweep-to-delete: how much to fade an element on each hover tick, and the
// floor below which it won't fade further (so it stays visible until released)
const DELETE_FADE_FACTOR = 0.6;
const DELETE_MIN_OPACITY = 0.15;

// Drawable shape selectors shared across selection/deletion helpers
const DRAWABLE_SELECTOR = 'line, circle, rect, path, polyline, polygon, ellipse';

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
 * Apply the selection visual (dimmed opacity + dashed box) to an element
 * @param {Snap.Element} element - The element to mark as selected
 */
function applySelectionVisual(element) {
    const originalOpacity = element.data('originalOpacity') || 1.0;
    element.attr({ opacity: originalOpacity * OPACITY_FACTOR });
    highlightSelected(element);
}

/**
 * Remove the selection visual from an element and restore its opacity
 * @param {Snap.Element} element - The element to clear
 */
function removeSelectionVisual(element) {
    element.removeClass('selected');

    const selectionBox = element.data('selectionBox');
    if (selectionBox) {
        selectionBox.remove();
        element.data('selectionBox', null);
    }

    const originalOpacity = element.data('originalOpacity') || 1.0;
    element.attr({ opacity: originalOpacity });
}

/**
 * Clear the current selection without emitting a status message.
 * Used internally before establishing a new selection.
 */
function clearSelection() {
    editorState.selectedElements.forEach(removeSelectionVisual);
    editorState.selectedElements = [];
    editorState.selectedElement = null;
}

/**
 * Select a single element and add visual feedback
 * @param {Snap.Element} element - The element to select
 */
function selectElement(element) {
    clearSelection();

    editorState.selectedElement = element;
    editorState.selectedElements = [element];
    applySelectionVisual(element);

    updateStatus('Element selected - Drag to move, Delete to remove');
}

/**
 * Select a list of elements (e.g. from a marquee selection)
 * @param {Array<Snap.Element>} elements - The elements to select
 */
function selectElements(elements) {
    clearSelection();

    if (!elements || elements.length === 0) {
        updateStatus('No elements selected');
        return;
    }

    elements.forEach(applySelectionVisual);
    editorState.selectedElements = elements.slice();
    // Keep selectedElement pointing at one element so single-element
    // operations (drag-to-move, Delete key) still have a target.
    editorState.selectedElement = elements[elements.length - 1];

    updateStatus(`${elements.length} element(s) selected`);
}

/**
 * Select every shape whose visual bounding box intersects the given rect.
 * Coordinates are in SVG space.
 * @param {number} x1 - One corner X
 * @param {number} y1 - One corner Y
 * @param {number} x2 - Opposite corner X
 * @param {number} y2 - Opposite corner Y
 */
function selectElementsInRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);

    const hits = [];
    snap.selectAll(DRAWABLE_SELECTOR).forEach(element => {
        // Skip helper rects (selection boxes, the marquee itself)
        if (element.node.classList.contains('selection-box') ||
            element.node.classList.contains('marquee-box')) {
            return;
        }

        const b = getVisualBBox(element);
        const intersects = !(b.x + b.width < left || b.x > right ||
                             b.y + b.height < top || b.y > bottom);
        if (intersects) {
            hits.push(element);
        }
    });

    selectElements(hits);
}

/**
 * Map a DOM node back to its Snap element wrapper.
 * @param {Element} node - The DOM node
 * @returns {Snap.Element|null} The matching Snap element, or null
 */
function findSnapElement(node) {
    const elements = snap.selectAll(DRAWABLE_SELECTOR);
    for (let i = 0; i < elements.length; i++) {
        if (elements[i].node === node) {
            return elements[i];
        }
    }
    return null;
}

/**
 * Return the node if it is a selectable drawable shape (not a helper rect or
 * the canvas background), otherwise null.
 * @param {Element} node - The DOM node to test
 * @returns {Element|null}
 */
function drawableShapeNode(node) {
    if (!node || !node.tagName) return null;
    const drawable = ['line', 'circle', 'rect', 'path', 'polyline', 'polygon', 'ellipse'];
    if (drawable.indexOf(node.tagName.toLowerCase()) === -1) return null;
    if (node.classList.contains('selection-box') || node.classList.contains('marquee-box')) {
        return null;
    }
    return node;
}

/**
 * Whether a point (in SVG coords) lies within the current selection's bounding
 * region: the union of the selected elements' visual bounding boxes (padded to
 * match the dashed selection outline).
 * @param {Object} point - Point {x, y} in SVG coordinates
 * @returns {boolean}
 */
function isPointInSelection(point) {
    if (editorState.selectedElements.length === 0) return false;

    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    editorState.selectedElements.forEach(element => {
        const b = getVisualBBox(element);
        left = Math.min(left, b.x);
        top = Math.min(top, b.y);
        right = Math.max(right, b.x + b.width);
        bottom = Math.max(bottom, b.y + b.height);
    });

    const pad = 5; // matches the selection box padding
    return point.x >= left - pad && point.x <= right + pad &&
           point.y >= top - pad && point.y <= bottom + pad;
}

/**
 * Begin moving the current selection. Records each element's starting transform
 * so movement can be applied as an absolute delta from the press point
 * (editorState.startPoint, in SVG coords).
 */
function beginSelectionMove() {
    editorState.isMovingSelection = true;
    editorState.moveOccurred = false;
    editorState.selectedElements.forEach(element => {
        element.data('origTransform', element.transform().local);
    });
}

/**
 * Move every selected element to follow the pointer. The delta is computed in
 * SVG user coordinates, so shapes track the cursor exactly at any canvas scale.
 * @param {Object} point - Current pointer position {x, y} in SVG coordinates
 */
function updateSelectionMove(point) {
    const dx = point.x - editorState.startPoint.x;
    const dy = point.y - editorState.startPoint.y;
    if (dx !== 0 || dy !== 0) {
        editorState.moveOccurred = true;
    }

    editorState.selectedElements.forEach(element => {
        const origTransform = element.data('origTransform') || '';
        element.attr({
            transform: origTransform + (origTransform ? 'T' : 't') + dx + ',' + dy
        });

        const selectionBox = element.data('selectionBox');
        if (selectionBox) {
            updateSelectionBoxPosition(element, selectionBox);
        }
    });
}

/**
 * Finish moving the current selection.
 */
function endSelectionMove() {
    editorState.isMovingSelection = false;
    if (editorState.moveOccurred) {
        updateStatus(`Moved ${editorState.selectedElements.length} element(s)`);
        // The gesture ends with a synthetic click; don't let it clear the selection.
        editorState.suppressNextCanvasClick = true;
    }
}

/**
 * Deselect all currently selected elements
 */
function deselectElement() {
    if (editorState.selectedElements.length > 0) {
        clearSelection();
        updateStatus('Selection cleared');
    }
}

/**
 * Add visual highlight to selected element
 * @param {Snap.Element} element - The element to highlight
 */
function highlightSelected(element) {
    // Remove this element's existing selection box first (prevent duplicates).
    // Note: we must NOT remove other elements' boxes here, since multiple
    // elements can be selected at once via marquee selection.
    const existingBox = element.data('selectionBox');
    if (existingBox) {
        existingBox.remove();
        element.data('selectionBox', null);
    }

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
 * Register a shape for selection: store its baseline opacity and add hover
 * feedback. Selection, dragging and deletion are all driven from the canvas
 * mouse handlers in app.js (see beginSelectionMove / updateSelectionMove), so
 * shapes no longer carry their own Snap .drag()/.click() handlers — that lets
 * a whole multi-selection move together and keeps movement in SVG user
 * coordinates (so the shape tracks the cursor regardless of canvas scaling).
 * @param {Snap.Element} element - The element to register
 */
function makeElementDraggable(element) {
    // Store the original opacity for this element
    const currentOpacity = element.attr('opacity');
    element.data('originalOpacity', currentOpacity !== undefined ? currentOpacity : 1.0);

    // Add hover effect for select tool
    element.hover(
        function() {
            // Mouse enter - multiply opacity by factor (skip while sweeping to delete)
            if (editorState.activeTool === 'select' &&
                editorState.selectedElements.indexOf(this) === -1) {
                const originalOpacity = this.data('originalOpacity') || 1.0;
                this.attr({ opacity: originalOpacity * OPACITY_FACTOR });
            }
        },
        function() {
            // Mouse leave - restore original opacity (unless selected or being deleted)
            if (editorState.selectedElements.indexOf(this) === -1 &&
                !(editorState.isDeleting && editorState.deleteSet.has(this))) {
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

    // Clear from the current selection if present
    const idx = editorState.selectedElements.indexOf(element);
    if (idx !== -1) {
        editorState.selectedElements.splice(idx, 1);
    }
    if (editorState.selectedElement === element) {
        editorState.selectedElement = null;
    }

    // Delete the element
    element.remove();
    updateStatus('Element deleted');
}

/**
 * Find the topmost drawable shape whose visual bounding box contains the given
 * screen point, if any. Bounding-box hit testing is used (rather than
 * elementFromPoint) so the sweep gesture also catches unfilled shapes, whose
 * interior is not pointer-addressable. Helper rects (selection/marquee boxes)
 * are ignored.
 * @param {number} clientX - Screen X coordinate
 * @param {number} clientY - Screen Y coordinate
 * @returns {Snap.Element|null} The matching Snap element, or null
 */
function elementAtPoint(clientX, clientY) {
    const point = screenToSVGCoords(clientX, clientY);

    let found = null;
    snap.selectAll(DRAWABLE_SELECTOR).forEach(element => {
        if (element.node.classList.contains('selection-box') ||
            element.node.classList.contains('marquee-box')) {
            return;
        }

        const b = getVisualBBox(element);
        if (point.x >= b.x && point.x <= b.x + b.width &&
            point.y >= b.y && point.y <= b.y + b.height) {
            // Keep the last match, i.e. the one painted on top
            found = element;
        }
    });

    return found;
}

/**
 * Mark an element for deletion during a sweep gesture: add it to the pending
 * set and fade it a bit more so the user sees what will be removed.
 * @param {Snap.Element} element - The element under the cursor (may be null)
 */
function markElementForDeletion(element) {
    if (!element) return;

    editorState.deleteSet.add(element);

    const current = parseFloat(element.attr('opacity'));
    const base = isNaN(current) ? 1.0 : current;
    element.attr({ opacity: Math.max(DELETE_MIN_OPACITY, base * DELETE_FADE_FACTOR) });
}

/**
 * Remove every element marked during the current sweep-to-delete gesture.
 */
function commitDeletion() {
    let count = 0;

    editorState.deleteSet.forEach(element => {
        const selectionBox = element.data('selectionBox');
        if (selectionBox) {
            selectionBox.remove();
        }

        const idx = editorState.selectedElements.indexOf(element);
        if (idx !== -1) {
            editorState.selectedElements.splice(idx, 1);
        }
        if (editorState.selectedElement === element) {
            editorState.selectedElement = null;
        }

        element.remove();
        count++;
    });

    editorState.deleteSet.clear();
    updateStatus(count > 0 ? `Deleted ${count} element(s)` : 'Nothing deleted');
}

/**
 * Handle canvas click (for deselection)
 */
function handleCanvasClick(event) {
    // A marquee gesture ends with a synthetic click on the canvas; don't let it
    // clear the selection we just made.
    if (editorState.suppressNextCanvasClick) {
        editorState.suppressNextCanvasClick = false;
        return;
    }

    // Only deselect if clicking directly on canvas (not on a shape)
    if (event.target.id === 'svg-canvas') {
        deselectElement();
    }
}
