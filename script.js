// Constants
const MAX_COLORS = 21;
const DRAG_THRESHOLD = 2;
const MIN_CROP_SIZE = 10;
const ZOOM_DELTA = 0.1;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;
const MAX_UNDO_STACK = 10;

// State
let colors = [];
let currentImage = null;
let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;
let isCropMode = false;
let cropStartX = 0;
let cropStartY = 0;
let cropEndX = 0;
let cropEndY = 0;
let cropPrefillMode = null; // 'basic' or 'advanced'
let hasEverHadColors = false; // Track if we've ever had colors
let undoStack = []; // Stack to store previous color states

// DOM Elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const imageInput = document.getElementById('imageInput');
const uploadBtn = document.getElementById('uploadBtn');
const prefillBtn = document.getElementById('prefillBtn');
const prefillCropBtn = document.getElementById('prefillCropBtn');
const prefillAdvancedBtn = document.getElementById('prefillAdvancedBtn');
const prefillAdvancedCropBtn = document.getElementById('prefillAdvancedCropBtn');
const exportBtn = document.getElementById('exportBtn');
const exportImageBtn = document.getElementById('exportImageBtn');
const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undoBtn');
const paletteGrid = document.getElementById('paletteGrid');
const colorCount = document.getElementById('colorCount');
const zoomLevel = document.getElementById('zoomLevel');
const uploadOverlay = document.getElementById('uploadOverlay');

// Event Listeners
uploadBtn.addEventListener('click', () => imageInput.click());
uploadOverlay.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', handleImageUpload);
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('mouseleave', handleMouseUp);
canvas.addEventListener('wheel', handleWheel, { passive: false });
prefillBtn.addEventListener('click', prefillPalette);
prefillCropBtn.addEventListener('click', () => startCropMode('basic'));
prefillAdvancedBtn.addEventListener('click', prefillAdvancedPalette);
prefillAdvancedCropBtn.addEventListener('click', () => startCropMode('advanced'));
exportBtn.addEventListener('click', exportColors);
exportImageBtn.addEventListener('click', exportPaletteImage);
clearBtn.addEventListener('click', clearAll);
undoBtn.addEventListener('click', undo);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if (e.ctrlKey && e.key === 'c' && colors.length > 0) {
        e.preventDefault();
        exportColors();
    }
    if (e.ctrlKey && e.key === 'e' && colors.length > 0) {
        e.preventDefault();
        exportPaletteImage();
    }
    if (e.ctrlKey && e.key === 's' && currentImage && !isCropMode) {
        e.preventDefault();
        startCropMode('basic');
    }
    if (e.ctrlKey && e.key === 'd' && currentImage && !isCropMode) {
        e.preventDefault();
        startCropMode('advanced');
    }
});

// Image Upload Handler
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        alert('Please upload a JPG, PNG, or WEBP image.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            initializeCanvas();
            uploadOverlay.style.display = 'none';
            
            // Show prefill button groups when image is loaded
            showElements([
                prefillBtn.parentElement, 
                prefillAdvancedBtn.parentElement
            ]);
            enableButtons([prefillBtn, prefillCropBtn, prefillAdvancedBtn, prefillAdvancedCropBtn]);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Initialize canvas with image
function initializeCanvas() {
    if (!currentImage) return;

    const pane = canvas.parentElement;
    const paneWidth = pane.clientWidth;
    const paneHeight = pane.clientHeight;

    // Set canvas to fill the pane
    canvas.width = paneWidth;
    canvas.height = paneHeight;

    // Calculate zoom to fill the canvas
    const scaleX = paneWidth / currentImage.width;
    const scaleY = paneHeight / currentImage.height;
    zoom = Math.max(scaleX, scaleY); // Use max to fill, not min

    // Center the image
    panX = (paneWidth / zoom - currentImage.width) / 2;
    panY = (paneHeight / zoom - currentImage.height) / 2;

    drawImage();
    updateZoomDisplay();
}

// Draw image on canvas
function drawImage() {
    if (!currentImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();
    
    // Apply transformations
    ctx.translate(panX * zoom, panY * zoom);
    ctx.scale(zoom, zoom);
    
    // Draw image at origin
    ctx.drawImage(currentImage, 0, 0);
    
    ctx.restore();
}

// Draw crop rectangle overlay
function drawCropRectangle() {
    if (!isCropMode || cropStartX === null) return;
    
    ctx.save();
    
    // Draw semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Clear the selected area
    const x = Math.min(cropStartX, cropEndX);
    const y = Math.min(cropStartY, cropEndY);
    const w = Math.abs(cropEndX - cropStartX);
    const h = Math.abs(cropEndY - cropStartY);
    
    ctx.clearRect(x, y, w, h);
    
    // Redraw image in the cleared area
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(panX * zoom, panY * zoom);
    ctx.scale(zoom, zoom);
    ctx.drawImage(currentImage, 0, 0);
    ctx.restore();
    
    // Draw border around selection
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    
    ctx.restore();
}

// Helper: Get canvas coordinates from mouse event
function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

// Helper: Convert canvas coordinates to image coordinates
function canvasToImageCoords(canvasX, canvasY) {
    return {
        x: (canvasX - panX * zoom) / zoom,
        y: (canvasY - panY * zoom) / zoom
    };
}

// Helper: Enable multiple buttons
function enableButtons(buttons) {
    buttons.forEach(btn => btn.disabled = false);
}

// Helper: Show multiple elements
function showElements(elements) {
    elements.forEach(el => {
        if (el) el.classList.remove('hidden');
    });
}

// Helper: Save current state to undo stack
function saveState() {
    // Create a deep copy of the current colors array
    undoStack.push([...colors]);
    
    // Keep only the last MAX_UNDO_STACK states
    if (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
    }
    
    updateUndoButton();
}

// Helper: Update undo button state
function updateUndoButton() {
    if (undoBtn) {
        undoBtn.disabled = undoStack.length === 0;
    }
}

// Handle canvas click for color picking
function pickColorAtPoint(e) {
    if (!currentImage || colors.length >= MAX_COLORS) return;

    const { x: canvasX, y: canvasY } = getCanvasCoords(e);
    const { x: imageX, y: imageY } = canvasToImageCoords(canvasX, canvasY);

    // Check if click is within image bounds
    if (imageX < 0 || imageY < 0 || imageX >= currentImage.width || imageY >= currentImage.height) {
        return;
    }

    // Save state before modification
    saveState();

    // Sample 3x3 area and average
    const color = sampleArea(Math.floor(imageX), Math.floor(imageY));
    const hex = rgbToHex(color.r, color.g, color.b);

    colors.push(hex);
    renderPalette();
}

// Sample 3x3 pixel area and return average color
function sampleArea(x, y) {
    // Create a temporary canvas to read the original image data
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = currentImage.width;
    tempCanvas.height = currentImage.height;
    tempCtx.drawImage(currentImage, 0, 0);

    let r = 0, g = 0, b = 0, count = 0;

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const px = x + dx;
            const py = y + dy;

            if (px >= 0 && py >= 0 && px < currentImage.width && py < currentImage.height) {
                const imageData = tempCtx.getImageData(px, py, 1, 1).data;
                r += imageData[0];
                g += imageData[1];
                b += imageData[2];
                count++;
            }
        }
    }

    return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
    };
}

// Mouse wheel zoom
function handleWheel(e) {
    if (!currentImage) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? (1 - ZOOM_DELTA) : (1 + ZOOM_DELTA);
    zoom *= delta;
    zoom = Math.max(ZOOM_MIN, Math.min(zoom, ZOOM_MAX));

    drawImage();
    updateZoomDisplay();
}

// Pan functionality and crop selection
let hasDragged = false;

function handleMouseDown(e) {
    if (!currentImage || e.button !== 0) return;
    
    const { x: canvasX, y: canvasY } = getCanvasCoords(e);
    
    if (isCropMode) {
        // Start crop selection
        cropStartX = canvasX;
        cropStartY = canvasY;
        cropEndX = canvasX;
        cropEndY = canvasY;
        canvas.style.cursor = 'crosshair';
    } else {
        // Normal pan mode
        isPanning = true;
        hasDragged = false;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        canvas.style.cursor = 'grabbing';
    }
}

function handleMouseMove(e) {
    if (!currentImage) return;
    
    const { x: canvasX, y: canvasY } = getCanvasCoords(e);
    
    if (isCropMode && cropStartX !== null) {
        // Update crop rectangle
        cropEndX = canvasX;
        cropEndY = canvasY;
        drawImage();
        drawCropRectangle();
    } else if (isPanning) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        // Check if there's any movement
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
            hasDragged = true;
        }

        panX += dx / zoom;
        panY += dy / zoom;

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        drawImage();
    }
}

function handleMouseUp(e) {
    if (isCropMode && cropStartX !== null) {
        // Complete crop selection and execute prefill
        executeCropPrefill();
        isCropMode = false;
        cropStartX = null;
        canvas.style.cursor = 'crosshair';
        drawImage(); // Redraw without crop rectangle
    } else if (isPanning) {
        isPanning = false;
        canvas.style.cursor = 'crosshair';
        
        // Only pick color if we didn't drag
        if (!hasDragged) {
            pickColorAtPoint(e);
        }
        
        hasDragged = false;
    }
}

// Update zoom display
function updateZoomDisplay() {
    zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
}

// Convert RGB to HEX
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

// Convert HEX to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Convert RGB to HSL for hue sorting
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

// Sort colors by hue
function sortByHue(colorArray) {
    return colorArray.slice().sort((a, b) => {
        const rgbA = hexToRgb(a);
        const rgbB = hexToRgb(b);
        const hslA = rgbToHsl(rgbA.r, rgbA.g, rgbA.b);
        const hslB = rgbToHsl(rgbB.r, rgbB.g, rgbB.b);
        return hslA.h - hslB.h;
    });
}

// Render palette in sidebar
function renderPalette(animateNew = true) {
    const sorted = sortByHue(colors);
    
    // Store existing colors to detect which are new
    const existingColors = new Set(
        Array.from(paletteGrid.querySelectorAll('.color-block'))
            .map(block => block.querySelector('.color-hex').textContent)
    );
    
    paletteGrid.innerHTML = '';

    if (sorted.length === 0) {
        paletteGrid.innerHTML = '<div class="palette-empty">No colors selected yet</div>';
    } else {
        sorted.forEach((hex, index) => {
            const isNewColor = animateNew && !existingColors.has(hex.toUpperCase());
            const block = createColorBlock(hex, index, !isNewColor);
            paletteGrid.appendChild(block);
        });
    }

    colorCount.textContent = colors.length;
    
    // Show export/clear/undo buttons on first color addition
    if (colors.length > 0 && !hasEverHadColors) {
        hasEverHadColors = true;
        showElements([exportBtn, exportImageBtn, clearBtn, undoBtn]);
    }
    
    // Enable/disable based on color count
    exportBtn.disabled = colors.length === 0;
    exportImageBtn.disabled = colors.length === 0;
    clearBtn.disabled = colors.length === 0;
    updateUndoButton();
}

// Create color block element
function createColorBlock(hex, index, skipAnimation = false) {
    const block = document.createElement('div');
    block.className = 'color-block';
    if (skipAnimation) {
        block.classList.add('no-animation');
    }
    block.style.background = hex;

    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = hex;

    const hexLabel = document.createElement('div');
    hexLabel.className = 'color-hex';
    hexLabel.textContent = hex.toUpperCase();

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        removeColor(hex, index);
    };

    block.appendChild(swatch);
    block.appendChild(hexLabel);
    block.appendChild(deleteBtn);

    // Copy to clipboard on click
    block.addEventListener('click', () => {
        navigator.clipboard.writeText(hex);
        showTooltip(block, 'Copied!');
    });

    return block;
}

// Remove color from palette
function removeColor(hex, index) {
    // Find the actual index in unsorted array
    const actualIndex = colors.indexOf(hex);
    if (actualIndex > -1) {
        saveState();
        
        // Find the color block element to animate
        const colorBlocks = document.querySelectorAll('.color-block');
        const blockToRemove = colorBlocks[index];
        
        if (blockToRemove) {
            // Animate only the removed block
            blockToRemove.style.animation = 'colorBlockFadeOut 0.2s ease forwards';
            
            // Remove from array and re-render after animation
            setTimeout(() => {
                colors.splice(actualIndex, 1);
                renderPalette(false); // Don't animate existing colors, only truly new ones
            }, 200);
        } else {
            // Fallback if element not found
            colors.splice(actualIndex, 1);
            renderPalette(false);
        }
    }
}

// Undo to previous state
function undo() {
    if (undoStack.length === 0) return;
    
    // Restore the last saved state
    colors = undoStack.pop();
    updateUndoButton();
    renderPalette();
    showNotification('Undo successful');
}

// Start crop mode
function startCropMode(mode) {
    isCropMode = true;
    cropPrefillMode = mode;
    cropStartX = null;
    canvas.style.cursor = 'crosshair';
    showNotification('Draw a rectangle to select the area for color extraction');
}

// Execute prefill on cropped area
function executeCropPrefill() {
    if (!currentImage || cropStartX === null) return;
    
    // Convert canvas coordinates to image coordinates
    const x1 = Math.min(cropStartX, cropEndX);
    const y1 = Math.min(cropStartY, cropEndY);
    const x2 = Math.max(cropStartX, cropEndX);
    const y2 = Math.max(cropStartY, cropEndY);
    
    const imgCoords1 = canvasToImageCoords(x1, y1);
    const imgCoords2 = canvasToImageCoords(x2, y2);
    
    const imgX1 = Math.max(0, Math.floor(imgCoords1.x));
    const imgY1 = Math.max(0, Math.floor(imgCoords1.y));
    const imgX2 = Math.min(currentImage.width, Math.floor(imgCoords2.x));
    const imgY2 = Math.min(currentImage.height, Math.floor(imgCoords2.y));
    
    const cropWidth = imgX2 - imgX1;
    const cropHeight = imgY2 - imgY1;
    
    if (cropWidth < MIN_CROP_SIZE || cropHeight < MIN_CROP_SIZE) {
        showNotification('Selection too small. Please try again.');
        return;
    }
    
    // Create a cropped version of the image
    const cropCanvas = document.createElement('canvas');
    const cropCtx = cropCanvas.getContext('2d');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    
    cropCtx.drawImage(currentImage, imgX1, imgY1, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    // Create temporary image from cropped canvas
    const croppedImg = new Image();
    croppedImg.onload = () => {
        if (cropPrefillMode === 'basic') {
            prefillPaletteFromImage(croppedImg);
        } else {
            prefillAdvancedPaletteFromImage(croppedImg);
        }
    };
    croppedImg.src = cropCanvas.toDataURL();
}

// Prefill palette using ColorThief
function prefillPalette() {
    prefillPaletteFromImage(currentImage);
}

function prefillPaletteFromImage(image) {
    if (!image) return;

    try {
        saveState();
        
        const colorThief = new ColorThief();
        const palette = colorThief.getPalette(image, 20);

        colors = palette.map(rgb => rgbToHex(rgb[0], rgb[1], rgb[2]));
        renderPalette();
    } catch (error) {
        console.error('ColorThief error:', error);
        alert('Failed to extract colors. Make sure the image is loaded correctly.');
    }
}

// Advanced prefill: 5 main colors + 3 variations of each (20 total)
function prefillAdvancedPalette() {
    prefillAdvancedPaletteFromImage(currentImage);
}

function prefillAdvancedPaletteFromImage(image) {
    if (!image) return;

    try {
        saveState();
        
        const colorThief = new ColorThief();
        const mainPalette = colorThief.getPalette(image, 5);
        
        colors = [];
        
        // For each of the 5 main colors, create variations
        mainPalette.forEach((rgb, index) => {
            const baseHex = rgbToHex(rgb[0], rgb[1], rgb[2]);
            colors.push(baseHex);
            
            if (index === 0) {
                // Top color gets 4 variations (5 total including base)
                const variations = createColorVariations(rgb[0], rgb[1], rgb[2], 4);
                colors.push(...variations);
            } else {
                // Next 4 colors get 3 variations each (16 total including bases)
                const variations = createColorVariations(rgb[0], rgb[1], rgb[2], 3);
                colors.push(...variations);
            }
        });
        
        renderPalette();
    } catch (error) {
        console.error('ColorThief error:', error);
        alert('Failed to extract colors. Make sure the image is loaded correctly.');
    }
}

// Create variations of a color
function createColorVariations(r, g, b, count = 3) {
    const hsl = rgbToHsl(r, g, b);
    const variations = [];
    
    // Variation 1: Lighter (increase lightness by 15%)
    const lighter = hslToRgb(hsl.h, hsl.s, Math.min(100, hsl.l + 15));
    variations.push(rgbToHex(lighter.r, lighter.g, lighter.b));
    
    // Variation 2: Darker (decrease lightness by 15%)
    const darker = hslToRgb(hsl.h, hsl.s, Math.max(0, hsl.l - 15));
    variations.push(rgbToHex(darker.r, darker.g, darker.b));
    
    // Variation 3: Desaturated (decrease saturation by 30%)
    const desaturated = hslToRgb(hsl.h, Math.max(0, hsl.s - 30), hsl.l);
    variations.push(rgbToHex(desaturated.r, desaturated.g, desaturated.b));
    
    // Variation 4 (only for count = 4): More saturated (increase saturation by 20%)
    if (count >= 4) {
        const saturated = hslToRgb(hsl.h, Math.min(100, hsl.s + 20), hsl.l);
        variations.push(rgbToHex(saturated.r, saturated.g, saturated.b));
    }
    
    return variations.slice(0, count);
}

// Convert HSL to RGB
function hslToRgb(h, s, l) {
    h = h / 360;
    s = s / 100;
    l = l / 100;
    
    let r, g, b;
    
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

// Export colors to clipboard
function exportColors() {
    if (colors.length === 0) return;

    const exported = colors.join(', ');
    navigator.clipboard.writeText(exported).then(() => {
        showNotification('Palette exported to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// Export palette as image
function exportPaletteImage() {
    if (colors.length === 0) return;

    // Create a canvas for the palette
    const paletteCanvas = document.createElement('canvas');
    const pCtx = paletteCanvas.getContext('2d');
    
    // Configure dimensions (each square is 100x100)
    const squareSize = 100;
    const columns = 7; // 7 columns for 21 colors
    const rows = Math.ceil(colors.length / columns);
    
    paletteCanvas.width = columns * squareSize;
    paletteCanvas.height = rows * squareSize;
    
    // Fill with white background
    pCtx.fillStyle = '#ffffff';
    pCtx.fillRect(0, 0, paletteCanvas.width, paletteCanvas.height);
    
    // Draw each color square
    colors.forEach((color, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = col * squareSize;
        const y = row * squareSize;
        
        // Draw color square
        pCtx.fillStyle = color;
        pCtx.fillRect(x, y, squareSize, squareSize);
        
        // Draw border
        pCtx.strokeStyle = '#333333';
        pCtx.lineWidth = 2;
        pCtx.strokeRect(x, y, squareSize, squareSize);
        
        // Draw hex label
        pCtx.fillStyle = getContrastColor(color);
        pCtx.font = 'bold 12px monospace';
        pCtx.textAlign = 'center';
        pCtx.textBaseline = 'middle';
        pCtx.fillText(color.toUpperCase(), x + squareSize / 2, y + squareSize / 2);
    });
    
    // Download the image
    paletteCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'color-palette.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Palette image downloaded!');
    });
}

// Get contrasting text color (black or white) for a background color
function getContrastColor(hexColor) {
    const rgb = hexToRgb(hexColor);
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Clear all colors
function clearAll() {
    if (colors.length === 0) return;

    saveState();
    
    // Fade out all color blocks
    const colorBlocks = document.querySelectorAll('.color-block');
    colorBlocks.forEach((block, index) => {
        setTimeout(() => {
            block.style.animation = 'colorBlockFadeOut 0.3s ease forwards';
        }, index * 30); // Stagger the fade out
    });
    
    // Clear colors after animation completes
    setTimeout(() => {
        colors = [];
        renderPalette();
    }, colorBlocks.length * 30 + 300);
}

// Show notification with stacking
let notificationOffset = 0;
const NOTIFICATION_HEIGHT = 50; // Approximate height including margin

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    // Position this notification below existing ones
    notification.style.top = `${80 + notificationOffset}px`;
    notificationOffset += NOTIFICATION_HEIGHT;
    
    document.body.appendChild(notification);

    // When this notification exits, move up remaining notifications
    setTimeout(() => {
        notification.classList.add('notification-exit');
        notificationOffset -= NOTIFICATION_HEIGHT;
        
        // Shift all notifications below this one upward
        const allNotifications = document.querySelectorAll('.notification:not(.notification-exit)');
        allNotifications.forEach(notif => {
            const currentTop = parseInt(notif.style.top);
            if (currentTop > parseInt(notification.style.top)) {
                notif.style.top = `${currentTop - NOTIFICATION_HEIGHT}px`;
            }
        });
        
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Show tooltip on element
function showTooltip(element, message) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = message;
    element.style.position = 'relative';
    element.appendChild(tooltip);
    setTimeout(() => tooltip.remove(), 1000);
}

// Initial render
renderPalette();
