# Selection Box Drag Bug Fix Plan

## Problem Description

When dragging an object with a selection box, multiple issues occur:

1. **Duplicate selection boxes**: A residual selection box remains visible after the first selection, creating ghost boxes that don't get cleaned up.

2. **Selection box jumping on drag end**: The selection box moves with the object during drag, but then jumps to a different position when the user releases the mouse button.

3. **Progressive drift**: On subsequent drags, the selection box maintains an incorrect offset from the object, and the offset changes each time the drag ends.

4. **Reselect positioning error**: After deselecting and reselecting a moved object, the selection box appears in the wrong location.

## Root Cause Analysis

### Issue 1: Incorrect Snap.svg Drag Pattern

The current code uses `transform().localMatrix` which returns a Matrix object, then tries to manipulate matrix values directly:

```javascript
// Current (incorrect) approach:
this.data('origTransform', this.transform().localMatrix);  // Matrix object
const newMatrix = new Snap.Matrix(
    origMatrix.a, origMatrix.b,
    origMatrix.c, origMatrix.d,
    origMatrix.e + svgDx, origMatrix.f + svgDy
);
```

The **correct Snap.svg pattern** (from [Stack Overflow](https://stackoverflow.com/questions/19559349/snap-svg-drag-event-handler) and [Snap.svg tutorials](http://svg.dabbles.info/snaptut-drag)) uses transform strings:

```javascript
// Correct approach:
this.data('origTransform', this.transform().local);  // String like "t100,100" or "matrix(...)"

// In move handler:
this.attr({
    transform: this.data('origTransform') + (this.data('origTransform') ? "T" : "t") + [dx, dy]
});
```

Key differences:
- `.local` returns a transform **string**, not a matrix object
- Using uppercase `"T"` appends translation AFTER existing transforms
- No need to manually convert screen-to-SVG coordinates - Snap.svg's dx/dy work correctly with string concatenation

### Issue 2: Selection Box Transform Mismatch

The current approach tries to give the selection box the same transform as the element:

```javascript
// Selection box is created at bbox coordinates (local/untransformed)
const selectionBox = snap.rect(bbox.x - padding, bbox.y - padding, ...);

// Then apply the element's transform to the selection box
selectionBox.attr({ transform: transformAttr });
```

**Problems:**
- `element.attr('transform')` may return `undefined` for newly created elements
- `element.transform().localMatrix` may not match the actual transform attribute
- When the element's transform changes during drag, synchronizing both transforms is fragile

### Issue 3: Selection Box Not Cleaned Up Properly

When `selectElement()` is called during drag start:
1. If element is already selected, `highlightSelected()` is called anyway
2. `highlightSelected()` creates a NEW selection box
3. If the old box wasn't stored properly in `element.data('selectionBox')`, it becomes orphaned

The duplicate selection boxes occur because:
- Selection box CSS class `.selection-box` matches multiple elements
- `element.data('selectionBox')` reference may be stale

## Proposed Solution

### Approach: Use Visual Bounding Box for Selection Box Positioning

Instead of applying transforms to the selection box, position it using the element's **visual** bounding box (which already includes transforms):

1. **Use `getBoundingClientRect()`** on the native SVG element to get the visual position
2. **Convert to SVG coordinates** using the canvas's coordinate transformation
3. **Position the selection box directly** without any transform on the selection box itself

This approach is simpler and avoids all transform synchronization issues.

### Implementation Plan

#### Step 1: Rewrite `highlightSelected()`

```javascript
function highlightSelected(element) {
    // Remove any existing selection box
    const existingBox = element.data('selectionBox');
    if (existingBox) {
        existingBox.remove();
        element.data('selectionBox', null);
    }

    element.addClass('selected');

    // Get the visual bounding box (includes transforms)
    const bbox = element.node.getBoundingClientRect();
    const canvas = document.getElementById('svg-canvas');
    const canvasRect = canvas.getBoundingClientRect();

    // Convert to SVG coordinates
    const svgPoint = canvas.createSVGPoint();
    const screenCTM = canvas.getScreenCTM();

    // Top-left corner
    svgPoint.x = bbox.left;
    svgPoint.y = bbox.top;
    const topLeft = svgPoint.matrixTransform(screenCTM.inverse());

    // Bottom-right corner
    svgPoint.x = bbox.right;
    svgPoint.y = bbox.bottom;
    const bottomRight = svgPoint.matrixTransform(screenCTM.inverse());

    const padding = 5;
    const selectionBox = snap.rect(
        topLeft.x - padding,
        topLeft.y - padding,
        (bottomRight.x - topLeft.x) + (padding * 2),
        (bottomRight.y - topLeft.y) + (padding * 2)
    ).attr({
        fill: 'none',
        stroke: '#00aaff',
        strokeWidth: 1,
        strokeDasharray: '5,5',
        class: 'selection-box'
    });

    // NO transform on selection box - it's positioned absolutely

    element.data('selectionBox', selectionBox);
    selectionBox.insertBefore(element);
}
```

#### Step 2: Rewrite Drag Handler Using Correct Snap.svg Pattern

```javascript
element.drag(
    // Move handler
    function(dx, dy, x, y, event) {
        if (editorState.activeTool !== 'select' || editorState.selectedElement !== this) {
            return;
        }

        // Use the standard Snap.svg transform pattern
        var origTransform = this.data('origTransform');
        this.attr({
            transform: origTransform + (origTransform ? "T" : "t") + [dx, dy]
        });

        // Update selection box by recalculating visual position
        const selectionBox = this.data('selectionBox');
        if (selectionBox) {
            updateSelectionBoxPosition(this, selectionBox);
        }
    },

    // Start handler
    function(x, y, event) {
        if (editorState.activeTool !== 'select') {
            return;
        }

        if (editorState.selectedElement !== this) {
            selectElement(this);
        }

        // Store transform as STRING (not matrix)
        this.data('origTransform', this.transform().local);
    },

    // End handler
    function(event) {
        if (editorState.selectedElement === this) {
            updateStatus('Element moved');
        }
    }
);
```

#### Step 3: Add Helper Function for Selection Box Update

```javascript
function updateSelectionBoxPosition(element, selectionBox) {
    const bbox = element.node.getBoundingClientRect();
    const canvas = document.getElementById('svg-canvas');
    const svgPoint = canvas.createSVGPoint();
    const screenCTM = canvas.getScreenCTM();

    svgPoint.x = bbox.left;
    svgPoint.y = bbox.top;
    const topLeft = svgPoint.matrixTransform(screenCTM.inverse());

    svgPoint.x = bbox.right;
    svgPoint.y = bbox.bottom;
    const bottomRight = svgPoint.matrixTransform(screenCTM.inverse());

    const padding = 5;
    selectionBox.attr({
        x: topLeft.x - padding,
        y: topLeft.y - padding,
        width: (bottomRight.x - topLeft.x) + (padding * 2),
        height: (bottomRight.y - topLeft.y) + (padding * 2)
    });
}
```

#### Step 4: Clean Up app.js References

Update `resizeSVGCanvas()` and `normalizeCanvasCoordinates()` to use the new selection box positioning approach instead of trying to apply transforms.

## Benefits of This Approach

1. **No transform synchronization needed** - Selection box is positioned absolutely in SVG coordinates
2. **Uses standard Snap.svg patterns** - Transform string concatenation is well-documented and reliable
3. **Visual accuracy** - `getBoundingClientRect()` gives the actual rendered position
4. **Simpler code** - No matrix manipulation or coordinate conversion for drag deltas
5. **No duplicate boxes** - Clean removal and recreation of selection box

## References

- [Snap.svg drag event handler - Stack Overflow](https://stackoverflow.com/questions/19559349/snap-svg-drag-event-handler)
- [Snap Drag Handler Tutorial](http://svg.dabbles.info/snaptut-drag)
- [getBBox() not updating after drag - GitHub Issue](https://github.com/adobe-webplatform/Snap.svg/issues/277)
- [Get coordinates of svg group on drag - Stack Overflow](https://stackoverflow.com/questions/19774494/get-coordinates-of-svg-group-on-drag-with-snap-svg)

## Files to Modify

1. `js/dragHandler.js` - Complete rewrite of drag and selection box logic
2. `js/app.js` - Update `resizeSVGCanvas()` and `normalizeCanvasCoordinates()` selection box updates
