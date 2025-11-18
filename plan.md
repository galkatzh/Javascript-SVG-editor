# SVG Editor Implementation Plan

## Overview
Build a vanilla JavaScript SVG editor using Snap.svg library (loaded via CDN) with capabilities for drawing, importing, and manipulating SVG shapes.

## Project Structure

```
Javascript-SVG-editor/
├── index.html          # Main HTML file
├── css/
│   └── style.css       # Styling for the editor
├── js/
│   ├── app.js          # Main application controller
│   ├── toolbar.js      # Toolbar and UI controls
│   ├── shapes.js       # Shape drawing functionality
│   ├── fileHandler.js  # SVG import/export
│   └── dragHandler.js  # Drag and select functionality
└── assets/
    └── icons/          # Optional: toolbar icons
```

## Technology Stack
- **Snap.svg**: CDN link `https://cdnjs.cloudflare.com/ajax/libs/snap.svg/0.5.1/snap.svg-min.js`
- **Vanilla JavaScript**: ES6+ features
- **HTML5**: File API for importing SVG files
- **CSS3**: Modern styling and flexbox layout

## Core Features Implementation

### 1. HTML Structure (index.html)

**Components:**
- Header with title
- Toolbar with:
  - Tool selection buttons (line, circle, square, scribble, select/drag, delete)
  - Color picker input
  - Line width slider/input
  - Import SVG button
  - Clear canvas button
- Main SVG canvas area
- Status bar (optional)

**Key Elements:**
```html
- <div id="toolbar">
  - <button> for each tool
  - <input type="color"> for color selection
  - <input type="number"> for line width
  - <input type="file" accept=".svg"> for import
- <div id="canvas-container">
  - <svg id="svg-canvas"> (Snap.svg will attach here)
```

### 2. CSS Styling (css/style.css)

**Layout:**
- Flexbox layout for toolbar and canvas
- Fixed toolbar at top or side
- Full-height canvas area
- Responsive design considerations

**Styling:**
- Active tool highlighting
- Cursor changes based on active tool
- Visual feedback for selected shapes
- Clean, modern UI with good contrast

### 3. Core Application (js/app.js)

**State Management:**
```javascript
const editorState = {
  activeTool: 'select',      // current tool
  strokeColor: '#000000',     // current color
  strokeWidth: 2,             // current line width
  selectedElement: null,      // currently selected shape
  isDrawing: false,           // drawing state flag
  startPoint: { x: 0, y: 0 }  // for drawing operations
}
```

**Initialization:**
1. Initialize Snap.svg on the canvas element
2. Set up event listeners for toolbar controls
3. Set up canvas event listeners (mousedown, mousemove, mouseup)
4. Initialize default tool and settings

### 4. Toolbar Functionality (js/toolbar.js)

**Tool Selection:**
- Radio button or toggle group behavior
- Visual indication of active tool
- Update cursor style based on tool

**Controls:**
- Color picker: Update `strokeColor` in state
- Line width: Update `strokeWidth` in state
- Import button: Trigger file input dialog
- Clear canvas: Remove all elements (with confirmation)

**Event Handlers:**
```javascript
- handleToolChange(tool)
- handleColorChange(color)
- handleWidthChange(width)
- handleImport()
- handleClear()
```

### 5. Shape Drawing (js/shapes.js)

#### 5.1 Line Drawing
**Implementation:**
- On mousedown: Store start point
- On mousemove: Draw temporary line with Snap.svg `line()`
- On mouseup: Finalize line, add to canvas
- Apply current color and width

**Snap.svg Methods:**
```javascript
const line = snap.line(x1, y1, x2, y2).attr({
  stroke: strokeColor,
  strokeWidth: strokeWidth
});
```

#### 5.2 Circle Drawing
**Implementation:**
- On mousedown: Store center point
- On mousemove: Calculate radius from distance
- Draw circle with Snap.svg `circle()`
- On mouseup: Finalize circle

**Snap.svg Methods:**
```javascript
const circle = snap.circle(cx, cy, radius).attr({
  fill: 'none',
  stroke: strokeColor,
  strokeWidth: strokeWidth
});
```

#### 5.3 Square/Rectangle Drawing
**Implementation:**
- On mousedown: Store start corner
- On mousemove: Calculate width/height
- Draw rectangle with Snap.svg `rect()`
- On mouseup: Finalize rectangle

**Snap.svg Methods:**
```javascript
const rect = snap.rect(x, y, width, height).attr({
  fill: 'none',
  stroke: strokeColor,
  strokeWidth: strokeWidth
});
```

#### 5.4 Scribble/Freehand Drawing
**Implementation:**
- On mousedown: Start path, store first point
- On mousemove: Append points to path array
- Use Snap.svg `path()` with smooth curves
- On mouseup: Finalize path

**Snap.svg Methods:**
```javascript
const pathString = `M${points[0].x},${points[0].y} ${points.slice(1).map(p => `L${p.x},${p.y}`).join(' ')}`;
const path = snap.path(pathString).attr({
  fill: 'none',
  stroke: strokeColor,
  strokeWidth: strokeWidth
});
```

**Helper Functions:**
```javascript
- createLine(x1, y1, x2, y2, attrs)
- createCircle(cx, cy, radius, attrs)
- createRect(x, y, width, height, attrs)
- createPath(points, attrs)
- getMousePosition(event) // Get SVG coordinates
```

### 6. File Import (js/fileHandler.js)

**SVG Import:**
- Use HTML5 File API to read file
- Parse SVG content
- Use Snap.svg `Snap.load()` or `Snap.parse()` to import
- Append loaded SVG to canvas

**Implementation Steps:**
1. Trigger file input on import button click
2. Read file as text using FileReader
3. Parse SVG string with Snap.svg
4. Append to main SVG canvas
5. Make imported elements selectable and draggable

**Code Pattern:**
```javascript
function importSVG(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const svgContent = e.target.result;
    const fragment = Snap.parse(svgContent);
    snap.append(fragment);
    // Make all children draggable/selectable
  };
  reader.readAsText(file);
}
```

**Alternative using Snap.load:**
```javascript
Snap.load(url, function(loadedFragment) {
  snap.append(loadedFragment);
});
```

### 7. Drag Functionality (js/dragHandler.js)

**Selection:**
- Click on shape to select it
- Visual feedback (highlight stroke, add selection box)
- Store reference in `editorState.selectedElement`

**Dragging:**
- Use Snap.svg `.drag()` method
- Handle three events: start, move, end
- Preserve element transforms

**Implementation:**
```javascript
element.drag(
  // Move handler
  function(dx, dy) {
    this.attr({
      transform: this.data('origTransform') + (this.data('origTransform') ? "T" : "t") + [dx, dy]
    });
  },
  // Start handler
  function() {
    this.data('origTransform', this.transform().local);
  },
  // End handler
  function() {
    // Optional: save position
  }
);
```

**Functions:**
```javascript
- selectElement(element)
- deselectElement()
- makeElementDraggable(element)
- highlightSelected(element)
```

### 8. Delete Functionality

**Implementation:**
- When delete tool is active or delete key pressed
- Remove selected element from SVG
- Clear selection state

**Code:**
```javascript
function deleteSelected() {
  if (editorState.selectedElement) {
    editorState.selectedElement.remove();
    editorState.selectedElement = null;
  }
}
```

**Enhancements:**
- Keyboard shortcut (Delete key)
- Delete button in toolbar
- Confirmation for multiple deletes

## Development Phases

### Phase 1: Setup and Basic Structure
1. Create HTML structure with toolbar and canvas
2. Add Snap.svg CDN link
3. Create basic CSS layout
4. Initialize Snap.svg instance
5. Set up state management

**Deliverable:** Basic UI with working Snap.svg canvas

### Phase 2: Drawing Tools
1. Implement tool selection system
2. Add line drawing
3. Add circle drawing
4. Add rectangle drawing
5. Add scribble/freehand drawing
6. Implement color picker integration
7. Implement line width control

**Deliverable:** All drawing tools functional with customization

### Phase 3: Selection and Dragging
1. Implement click-to-select functionality
2. Add visual selection feedback
3. Implement drag functionality for shapes
4. Handle edge cases (dragging while drawing, etc.)

**Deliverable:** Interactive shape manipulation

### Phase 4: Import and Delete
1. Implement SVG file import
2. Make imported elements draggable
3. Add delete functionality
4. Add keyboard shortcuts

**Deliverable:** Full CRUD operations on shapes

### Phase 5: Polish and UX
1. Add visual feedback (cursors, hover effects)
2. Implement clear/reset canvas
3. Add error handling
4. Optimize performance
5. Add tooltips/help text
6. Test cross-browser compatibility

**Deliverable:** Production-ready SVG editor

## Key Technical Considerations

### SVG Coordinate System
- Use `getBoundingClientRect()` to convert screen coordinates to SVG coordinates
- Account for canvas offset and scroll position
- Helper function: `getSVGCoordinates(event, svgElement)`

### Event Handling
- Prevent default behaviors where needed
- Handle mouse events on SVG canvas
- Distinguish between drawing and selecting
- Implement event delegation for dynamically created shapes

### Snap.svg Specific
- Elements created with Snap return Snap elements (not native SVG)
- Use `.attr()` for getting/setting attributes
- Use `.remove()` to delete elements
- Chain methods for cleaner code
- Store metadata with `.data()` method

### Performance
- Avoid excessive DOM manipulation
- Use event delegation
- Debounce/throttle mousemove events for scribble
- Consider limiting points in freehand paths

### Browser Compatibility
- Test File API support
- Test color picker input support (fallback for old browsers)
- Ensure SVG rendering consistency

## Testing Checklist

- [ ] All drawing tools create correct shapes
- [ ] Color picker updates all new shapes
- [ ] Line width control works for all shapes
- [ ] Shapes can be selected by clicking
- [ ] Selected shapes can be dragged
- [ ] Imported SVG files appear correctly
- [ ] Imported shapes are draggable
- [ ] Delete removes selected shapes
- [ ] Multiple shapes can be created
- [ ] UI is responsive and intuitive
- [ ] No console errors
- [ ] Cross-browser compatibility

## Future Enhancements (Optional)

- Export canvas as SVG file
- Undo/Redo functionality
- Multi-select with Ctrl/Cmd
- Resize handles for shapes
- Layer management
- Copy/paste shapes
- Snap to grid
- Zoom in/out
- Fill color (in addition to stroke)
- Text tool
- Group/ungroup elements

## Resources

- **Snap.svg Docs**: http://snapsvg.io/docs/
- **Snap.svg Tutorials**: http://svg.dabbles.info/
- **MDN SVG Reference**: https://developer.mozilla.org/en-US/docs/Web/SVG
- **File API**: https://developer.mozilla.org/en-US/docs/Web/API/File_API

## Conclusion

This plan provides a structured approach to building a fully functional SVG editor using vanilla JavaScript and Snap.svg. By following the phases sequentially, we ensure a solid foundation before adding advanced features. The modular file structure allows for easy maintenance and future enhancements.
