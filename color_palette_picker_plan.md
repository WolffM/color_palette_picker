# 🎨 Color Palette Picker App — Design Plan

## 🧭 Overview

A single-page, static web app that allows users to **open an image**, **click on it to pick colors**, and **progressively build a palette**.  
No backend or API required — runs entirely client-side using HTML5 Canvas and vanilla JavaScript.

### 🎯 Goals
- Quickly pick multiple colors from an image.
- See all picked colors in a live-updating sidebar.
- Remove unwanted colors easily.
- Export all selected HEX values (newline or comma-separated).

---

## 🧱 Layout & Components

| Component | Description |
|------------|--------------|
| **Image Pane** | Left-aligned main workspace (~80% width). Displays the uploaded image on an HTML `<canvas>` for pixel-based color detection. |
| **Sidebar Palette** | Right-aligned (~20% width). Displays a grid/list of selected colors with HEX codes and delete buttons. |
| **Toolbar** | Fixed top or bottom bar for key actions: "Upload Image", "Prefill Palette", "Export", "Clear All". |

---

## 🧠 Core Logic

### 1. Image Loading
- `<input type="file">` for local image upload (supports .jpg, .png, .webp).
- Use `FileReader` to load image and draw to `<canvas>`.
- **No cropping or resizing** — maintain original image dimensions.
- **Auto-fit with zoom**: Default zoom level fits image to left pane (80% width).
- **Mouse wheel zoom**: Zoom in/out functionality with pan when zoomed.
- Always display the main pane consistently regardless of image aspect ratio.

### 2. Color Picking

#### Manual Picking
- Listen for `click` events on the canvas.
- Use `ctx.getImageData()` to sample a **small area (3x3 pixels)** and average the color.
- Convert to HEX (`#rrggbb`) and store in `selectedColors` array.
- **No duplicate prevention** — allow multiple instances of the same color.
- **Maximum of 12 colors** to fit in sidebar without scrolling.
- **Ctrl+Z undo**: Removes the last added color.

#### Auto-Extract (Prefill)
- **"Prefill Palette"** button uses JavaScript `color-thief` library.
- Automatically extracts up to 12 dominant colors from the image.
- Uses k-means clustering for intelligent color selection.
- Users can then manually refine by adding/removing colors.
- **Quick workflow**: Prefill → manual adjustment → export.

### 3. Palette Display
- Each selected color appears in the sidebar as:
  - A small colored block (swatch).
  - The HEX code (monospace font).
  - A ✕ (remove button).
- Colors automatically **sort by hue** using HSL conversion.
- **Fixed 12-slot grid** — all colors visible without scrolling.
- **Immediate visual feedback**: Color blocks appear and sort instantly upon selection.

### 4. Export Function
- "Export" button outputs palette as **comma-separated HEX list**:
    ```
    #aabbcc, #112233, #445566
    ```
- Use `navigator.clipboard.writeText()` for copy-to-clipboard.
- **Consistent format** — no user choice needed.
- **Keyboard shortcut**: Ctrl+E for quick export.

---

## 💡 Design Details

### Visual Style
- Neutral gray background for contrast.
- Image pane uses subtle drop shadow and padding.
- Color swatches are 48×48px with rounded corners.
- HEX codes use monospace font; auto-adjust text color for contrast.
- Soft hover animations on color blocks and buttons.

### Color Sorting (Intelligent Mode)
- Convert RGB → HSL → sort by hue value.
- Fallback: preserve selection order if hue sorting disabled.

### Responsive Layout
- Flexbox or CSS Grid for side-by-side layout.
- Scales cleanly down to ~800px width; below that, stack vertically.

---

## ⚙️ Implementation Plan

### File Structure
```
/color-palette-picker/
│
├── index.html     # main page
├── style.css      # layout and theming
└── script.js      # core logic with zoom/pan functionality
```

### Stack
- Pure HTML/CSS/JS (client-side only)
- HTML5 Canvas API
- File API for image upload (.jpg, .png, .webp)
- **ColorThief.js** library for auto color extraction
- No backend required, privacy-safe

---

## 🧩 Pseudocode Summary

```js
let colors = [];
let zoom = 1, panX = 0, panY = 0;

// Manual color picking
canvas.addEventListener('click', e => {
  if (colors.length >= 12) return; // Max 12 colors
  const { x, y } = getCanvasCoords(e);
  const avgColor = sampleArea(ctx, x, y, 3); // 3x3 area sampling
  const hex = rgbToHex(avgColor.r, avgColor.g, avgColor.b);
  colors.push(hex); // No duplicate prevention
  renderPalette();
});

// Auto-extract palette
function prefillPalette() {
  const colorThief = new ColorThief();
  const dominantColors = colorThief.getPalette(imageElement, 12);
  colors = dominantColors.map(rgb => rgbToHex(rgb[0], rgb[1], rgb[2]));
  renderPalette();
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoom *= e.deltaY > 0 ? 0.9 : 1.1; // Zoom in/out
  redrawCanvas();
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'z') {
    colors.pop(); // Undo last color
    renderPalette();
  }
  if (e.ctrlKey && e.key === 'e') {
    exportColors(); // Quick export
  }
});

function renderPalette() {
  const sorted = sortByHue(colors);
  sidebar.innerHTML = '';
  for (const hex of sorted) {
    const block = createColorBlock(hex);
    sidebar.appendChild(block);
  }
}

function exportColors() {
  const hexList = colors.join(', ');
  navigator.clipboard.writeText(hexList);
}
```

---

## 🚀 Optional Enhancements
- **Hover highlight:** briefly show where on the image a selected color came from.  
- **Drag-reorder:** manual color ordering in the sidebar.  
- **Auto-save:** store palette in `localStorage`.  
- **Theme toggle:** switch between light/dark UI.
- **Hybrid workflow:** Mix auto-extracted colors with manual picks.
- **Color quality slider:** Adjust ColorThief extraction sensitivity.

---

## ✅ Summary

This app will be:
- **Local-first & privacy-safe** — nothing leaves your device.
- **Lightweight** — no frameworks or APIs.
- **Functional & minimal** — focused purely on creative workflow.
- **Extensible** — can evolve into a more advanced color tool later.
