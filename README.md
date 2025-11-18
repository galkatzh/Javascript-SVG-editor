# SVG Editor

A vanilla JavaScript SVG editor built with Snap.svg for drawing and manipulating SVG shapes.

## Features

- Draw lines, circles, rectangles, and freehand scribbles
- Import existing SVG files
- Choose custom colors and line widths
- Drag shapes to reposition them
- Delete shapes
- Clean, intuitive user interface

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- No build tools required - pure vanilla JavaScript!

### Running the Application

1. Open `index.html` in your web browser
2. You can use a local server for best results:
   ```bash
   # Using Python 3
   python -m http.server 8000

   # Using Python 2
   python -m SimpleHTTPServer 8000

   # Using Node.js http-server
   npx http-server
   ```
3. Navigate to `http://localhost:8000` in your browser

### Testing Phase 1

Phase 1 delivers the basic UI and Snap.svg canvas setup. To test:

1. Open the application in your browser
2. Verify the interface loads correctly with:
   - Header with "SVG Editor" title
   - Toolbar with tool buttons (Select, Line, Circle, Rectangle, Scribble, Delete)
   - Color picker and line width controls
   - Import and Clear buttons
   - White canvas area
   - Status bar at bottom
3. Check the browser console (F12) for "SVG Editor initialized successfully!" message
4. Click different tool buttons - they should highlight when selected
5. Change color and width values - status bar should update
6. Move mouse over canvas - coordinates should display in status bar
7. No console errors should appear

## Project Structure

```
Javascript-SVG-editor/
├── index.html          # Main HTML file
├── css/
│   └── style.css       # Styling
├── js/
│   └── app.js          # Main application logic
├── assets/
│   └── icons/          # Icons (if needed)
├── plan.md             # Implementation plan
└── README.md           # This file
```

## Implementation Status

### Phase 1: Setup and Basic Structure ✅
- [x] Project structure created
- [x] HTML with toolbar and canvas
- [x] CSS styling and layout
- [x] Snap.svg initialization
- [x] State management
- [x] Basic event handlers

### Phase 2: Drawing Tools (Coming Next)
- [ ] Line drawing
- [ ] Circle drawing
- [ ] Rectangle drawing
- [ ] Scribble/freehand drawing
- [ ] Apply colors and widths

### Phase 3: Selection and Dragging
- [ ] Click-to-select
- [ ] Drag functionality
- [ ] Visual selection feedback

### Phase 4: Import and Delete
- [ ] SVG file import
- [ ] Delete selected shapes
- [ ] Keyboard shortcuts

### Phase 5: Polish and UX
- [ ] Final refinements
- [ ] Error handling
- [ ] Performance optimization

## Technologies

- **Snap.svg** - SVG manipulation library
- **Vanilla JavaScript** - No frameworks, pure ES6+
- **HTML5** - Modern semantic markup
- **CSS3** - Flexbox layout and modern styling

## License

MIT License - feel free to use this project for learning or building upon!
