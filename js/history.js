/**
 * History Module - Undo / Redo for the SVG Editor
 *
 * Uses a snapshot model: after every action that changes the canvas (drawing,
 * moving, deleting, restyling, clearing, importing) the full set of content
 * shapes is captured. Undo/redo simply rebuild the canvas from a stored
 * snapshot. This keeps the history logic independent of the many different
 * action types, at the cost of storing a copy of the scene per step.
 *
 * Snapshots store cloned DOM nodes (not serialized strings) so the round-trip
 * mirrors the proven import path (Snap(node) + snap.append) and avoids any
 * serialization surprises.
 */

// Undo/redo state. `stack[index]` is always the current canvas content.
const history = {
    stack: [],          // Array of snapshots (each an array of cloned nodes)
    index: -1,          // Pointer to the current snapshot in the stack
    limit: 100,         // Max number of snapshots retained
    isRestoring: false  // Guard so restoreSnapshot() doesn't record new history
};

/**
 * Capture the current canvas content as a snapshot: a deep clone of every
 * content shape, with selection-only visuals normalized away. Selected shapes
 * are rendered dimmed (opacity × OPACITY_FACTOR) with their true opacity kept
 * in element data, and carry a "selected" class — neither belongs in history,
 * so we strip the class and restore the true opacity on the clone.
 * @returns {Array<Element>} Cloned, normalized DOM nodes
 */
function captureSnapshot() {
    return getContentElements().map(element => {
        const clone = element.node.cloneNode(true);
        clone.classList.remove('selected');

        // Restore the true (undimmed) opacity if this shape is selected.
        const trueOpacity = element.data('originalOpacity');
        if (trueOpacity !== undefined && trueOpacity !== null) {
            clone.setAttribute('opacity', trueOpacity);
        }

        return clone;
    });
}

/**
 * Rebuild the canvas from a snapshot. Clears the current content and selection,
 * re-adds each stored shape (cloned again so the snapshot itself is never
 * mutated), and re-registers selection/drag behaviour.
 * @param {Array<Element>} snapshot - Cloned nodes from captureSnapshot()
 */
function restoreSnapshot(snapshot) {
    history.isRestoring = true;

    // Drop the current selection and wipe the canvas (also removes any leftover
    // selection/marquee helper rects).
    clearSelection();
    snap.clear();

    // Re-add each shape. Clone again: appending moves a node into the DOM, and
    // the same snapshot may be restored repeatedly (undo/redo back and forth).
    snapshot.forEach(node => {
        snap.append(Snap(node.cloneNode(true)));
    });

    // Re-attach hover/selection bookkeeping to the freshly added shapes.
    makeAllShapesDraggable();

    editorState.selectedElements = [];
    editorState.selectedElement = null;
    refreshPropertiesPanel();
    resizeSVGCanvas();

    history.isRestoring = false;
}

/**
 * Record the current canvas state as a new history step. Truncates any redo
 * states beyond the current position (a fresh action invalidates the redo
 * branch) and enforces the size limit by dropping the oldest snapshot.
 */
function recordHistory() {
    if (history.isRestoring) return;

    // A new action discards anything that was available to redo.
    if (history.index < history.stack.length - 1) {
        history.stack.length = history.index + 1;
    }

    history.stack.push(captureSnapshot());

    if (history.stack.length > history.limit) {
        history.stack.shift();
    }

    history.index = history.stack.length - 1;
    updateHistoryButtons();
}

/**
 * Step back to the previous snapshot, if any.
 */
function undo() {
    if (history.index <= 0) return;

    history.index--;
    restoreSnapshot(history.stack[history.index]);
    updateHistoryButtons();
    updateStatus('Undo');
}

/**
 * Step forward to the next snapshot, if any.
 */
function redo() {
    if (history.index >= history.stack.length - 1) return;

    history.index++;
    restoreSnapshot(history.stack[history.index]);
    updateHistoryButtons();
    updateStatus('Redo');
}

/**
 * Enable/disable the undo and redo buttons to reflect what's available.
 */
function updateHistoryButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) undoBtn.disabled = history.index <= 0;
    if (redoBtn) redoBtn.disabled = history.index >= history.stack.length - 1;
}

/**
 * Wire up the undo/redo toolbar buttons and capture the initial (baseline)
 * canvas state so the first action can be undone back to it.
 */
function setupHistory() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);

    // Baseline snapshot (usually an empty canvas).
    recordHistory();
}
