/**
 * File Handler Module
 * Handles SVG import and export operations
 */

/**
 * Import SVG file and load it into the canvas
 * @param {File} file - The SVG file to import
 * @param {Snap} snapInstance - The Snap.svg instance
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 */
function importSVG(file, snapInstance, onSuccess, onError) {
    // Validate file type
    if (!file.name.endsWith('.svg') && file.type !== 'image/svg+xml') {
        if (onError) {
            onError('Invalid file type. Please select an SVG file.');
        }
        return;
    }

    // Create FileReader to read the file
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const svgContent = e.target.result;

            // Parse the SVG content
            parseSVGContent(svgContent, snapInstance, onSuccess, onError);

        } catch (error) {
            console.error('Error reading SVG file:', error);
            if (onError) {
                onError('Error reading file: ' + error.message);
            }
        }
    };

    reader.onerror = function(error) {
        console.error('FileReader error:', error);
        if (onError) {
            onError('Failed to read file');
        }
    };

    // Read the file as text
    reader.readAsText(file);
}

/**
 * Parse SVG content and add elements to canvas
 * @param {string} svgContent - The SVG content as string
 * @param {Snap} snapInstance - The Snap.svg instance
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 */
function parseSVGContent(svgContent, snapInstance, onSuccess, onError) {
    try {
        // Create a temporary container to parse the SVG
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');

        // Check for parsing errors
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid SVG format');
        }

        const svgElement = doc.querySelector('svg');
        if (!svgElement) {
            throw new Error('No SVG element found in file');
        }

        // Get all drawable elements from the imported SVG
        const elements = svgElement.querySelectorAll('line, circle, ellipse, rect, polygon, polyline, path, text, g');

        if (elements.length === 0) {
            if (onError) {
                onError('No drawable elements found in SVG file');
            }
            return;
        }

        let importedCount = 0;

        // Import each element into the canvas
        elements.forEach(element => {
            try {
                // Create a Snap element from the DOM element
                const snapElement = Snap(element.cloneNode(true));

                // Add the element to the canvas
                snapInstance.append(snapElement);

                // Make the imported element draggable and selectable
                if (typeof makeElementDraggable === 'function') {
                    makeElementDraggable(snapElement);
                }

                snapElement.data('draggable', true);
                snapElement.data('imported', true);

                importedCount++;
            } catch (err) {
                console.warn('Could not import element:', element, err);
            }
        });

        if (onSuccess) {
            onSuccess(importedCount);
        }

    } catch (error) {
        console.error('Error parsing SVG:', error);
        if (onError) {
            onError('Error parsing SVG: ' + error.message);
        }
    }
}

/**
 * Export the current canvas as an SVG file
 * @param {Snap} snapInstance - The Snap.svg instance
 * @param {string} filename - The filename for the exported SVG (default: 'drawing.svg')
 */
function exportSVG(snapInstance, filename = 'drawing.svg') {
    try {
        // Get the SVG element
        const svgElement = snapInstance.node;

        // Clone the SVG to avoid modifying the original
        const svgClone = svgElement.cloneNode(true);

        // Clean up any selection boxes or temporary elements
        const selectionBoxes = svgClone.querySelectorAll('.selection-box');
        selectionBoxes.forEach(box => box.remove());

        // Get the SVG string
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgClone);

        // Add XML declaration and proper formatting
        svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString;

        // Create a blob from the SVG string
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });

        // Create a download link and trigger download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;

        // Trigger the download
        document.body.appendChild(link);
        link.click();

        // Clean up
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        return true;
    } catch (error) {
        console.error('Error exporting SVG:', error);
        return false;
    }
}

/**
 * Get a formatted filename with timestamp
 * @returns {string} Filename with timestamp
 */
function getExportFilename() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `svg-drawing-${timestamp}-${time}.svg`;
}
