/**
 * Shapes Module - Drawing functionality for SVG Editor
 * Contains functions for creating and manipulating shapes
 */

/**
 * Draw a line between two points
 * @param {Object} snap - Snap.svg instance
 * @param {Object} start - Start point {x, y}
 * @param {Object} end - End point {x, y}
 * @param {Object} attrs - Drawing attributes (stroke, strokeWidth, etc.)
 * @returns {Object} Snap.svg line element
 */
function drawLine(snap, start, end, attrs) {
    const line = snap.line(start.x, start.y, end.x, end.y);
    line.attr(attrs);
    return line;
}

/**
 * Update line endpoint
 * @param {Object} line - Snap.svg line element
 * @param {Object} end - New end point {x, y}
 */
function updateLine(line, end) {
    line.attr({
        x2: end.x,
        y2: end.y
    });
}

/**
 * Draw a circle
 * @param {Object} snap - Snap.svg instance
 * @param {Object} center - Center point {x, y}
 * @param {number} radius - Circle radius
 * @param {Object} attrs - Drawing attributes
 * @returns {Object} Snap.svg circle element
 */
function drawCircle(snap, center, radius, attrs) {
    const circle = snap.circle(center.x, center.y, Math.abs(radius));
    circle.attr(attrs);
    return circle;
}

/**
 * Update circle radius
 * @param {Object} circle - Snap.svg circle element
 * @param {number} radius - New radius
 */
function updateCircle(circle, radius) {
    circle.attr({
        r: Math.abs(radius)
    });
}

/**
 * Calculate distance between two points
 * @param {Object} p1 - First point {x, y}
 * @param {Object} p2 - Second point {x, y}
 * @returns {number} Distance
 */
function calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Draw a rectangle
 * @param {Object} snap - Snap.svg instance
 * @param {Object} start - Start corner {x, y}
 * @param {Object} end - End corner {x, y}
 * @param {Object} attrs - Drawing attributes
 * @returns {Object} Snap.svg rect element
 */
function drawRect(snap, start, end, attrs) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    const rect = snap.rect(x, y, width, height);
    rect.attr(attrs);
    return rect;
}

/**
 * Update rectangle dimensions
 * @param {Object} rect - Snap.svg rect element
 * @param {Object} start - Start corner {x, y}
 * @param {Object} end - End corner {x, y}
 */
function updateRect(rect, start, end) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    rect.attr({
        x: x,
        y: y,
        width: width,
        height: height
    });
}

/**
 * Create a path from an array of points
 * @param {Array} points - Array of points [{x, y}, ...]
 * @returns {string} SVG path string
 */
function createPathFromPoints(points) {
    if (points.length === 0) return '';

    let pathString = `M${points[0].x},${points[0].y}`;

    if (points.length === 1) {
        // Single point - draw a small circle
        return pathString;
    }

    // Use quadratic curves for smoother scribble
    for (let i = 1; i < points.length; i++) {
        const point = points[i];

        if (i === 1) {
            // First segment - line to second point
            pathString += ` L${point.x},${point.y}`;
        } else {
            // Subsequent segments - use quadratic curve for smoothness
            const prevPoint = points[i - 1];
            const midX = (prevPoint.x + point.x) / 2;
            const midY = (prevPoint.y + point.y) / 2;
            pathString += ` Q${prevPoint.x},${prevPoint.y} ${midX},${midY}`;
        }
    }

    // Add final point
    if (points.length > 2) {
        const lastPoint = points[points.length - 1];
        pathString += ` L${lastPoint.x},${lastPoint.y}`;
    }

    return pathString;
}

/**
 * Draw a scribble path
 * @param {Object} snap - Snap.svg instance
 * @param {Array} points - Array of points [{x, y}, ...]
 * @param {Object} attrs - Drawing attributes
 * @returns {Object} Snap.svg path element
 */
function drawScribble(snap, points, attrs) {
    const pathString = createPathFromPoints(points);
    const path = snap.path(pathString);
    path.attr(attrs);
    return path;
}

/**
 * Update scribble path with new points
 * @param {Object} path - Snap.svg path element
 * @param {Array} points - Array of points [{x, y}, ...]
 */
function updateScribble(path, points) {
    const pathString = createPathFromPoints(points);
    path.attr({
        d: pathString
    });
}

/**
 * Draw a marquee (rubber-band) selection rectangle
 * @param {Object} snap - Snap.svg instance
 * @param {Object} start - Start corner {x, y}
 * @returns {Object} Snap.svg rect element
 */
function drawMarquee(snap, start) {
    const marquee = snap.rect(start.x, start.y, 0, 0);
    marquee.attr({
        fill: 'rgba(0, 170, 255, 0.08)',
        stroke: '#00aaff',
        strokeWidth: 1,
        strokeDasharray: '5,5',
        class: 'marquee-box'
    });
    return marquee;
}

/**
 * Update the marquee rectangle to span from start to the current point
 * @param {Object} marquee - Snap.svg rect element
 * @param {Object} start - Start corner {x, y}
 * @param {Object} current - Current corner {x, y}
 */
function updateMarquee(marquee, start, current) {
    marquee.attr({
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y)
    });
}

/**
 * Get default drawing attributes
 * @param {string} color - Stroke color
 * @param {number} width - Stroke width
 * @param {string} fillColor - Fill color
 * @param {boolean} fillTransparent - Whether fill should be transparent
 * @param {number} opacity - Shape opacity (0-1)
 * @returns {Object} Attributes object
 */
function getDefaultAttributes(color, width, fillColor = '#ffffff', fillTransparent = false, opacity = 1.0) {
    return {
        fill: fillTransparent ? 'none' : fillColor,
        stroke: color,
        strokeWidth: width,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        opacity: opacity
    };
}
