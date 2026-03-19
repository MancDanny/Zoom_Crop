# Zoom Crop — ComfyUI Custom Node

An interactive, Photoshop-style zoom & crop tool for ComfyUI. Load an image, visually position and resize a crop box with handles, then execute to output the cropped region as an IMAGE tensor.

![Zoom Crop node](https://raw.githubusercontent.com/MancDanny/Zoom_Crop/main/docs/preview.png)

---

## Features

### Crop Box
- Draw a new crop region by clicking and dragging on empty canvas area
- **Move** the crop box by dragging inside it
- **Resize** using 8 corner and edge handles (tl, tc, tr, ml, mr, bl, bc, br)
- Handles are generously sized and have an expanded hover detection area
- Green crop border with rule-of-thirds grid overlay

### Toolbar
| Button | Function |
|--------|----------|
| **Fit** | Reset zoom/pan to show the full image |
| **1:1** | Toggle square aspect ratio lock — snaps crop to a square immediately |
| **🔒** | Lock/unlock crop position — prevents accidental moves |
| **Max** | Expand crop box to the full image dimensions |
| **50%** | Reset crop to a centred 50% of the image |
| **Paste** | Paste an image from the clipboard (Ctrl+V also works) |
| **Push >** | Crop the region, upload it, and push the filename to connected downstream nodes, then mute this node |
| **Enable** | Re-enable the node after a Push (hidden until Push is used) |
| **Adv** | Toggle the Advanced panel (preset ratios + numeric X/Y/W/H fields) |

### Advanced Panel
- **Preset aspect ratios**: Free, 1:1, 4:3, 3:4, 16:9, 9:16, SDXL 1:1 (1024×1024), SDXL 3:2 (1152×768), SDXL 2:3 (768×1152)
- **Numeric inputs**: X, Y, W, H — type exact pixel coordinates directly

### Navigation
- **Zoom**: Scroll wheel (centred on cursor)
- **Pan**: Space + drag, or middle-mouse drag
- **Cursor**: Changes contextually — crosshair (draw), move, directional resize arrows, grab (pan)

### Image Input
- **File picker**: Select any image from the ComfyUI input folder (with upload support)
- **input_image slot**: Connect an upstream IMAGE node — the canvas loads automatically after execution

### Push Mechanism
1. Renders the cropped region to an offscreen canvas
2. Uploads as PNG to the ComfyUI input folder (alternates between `zoom_crop_push_a.png` / `_b.png` to force reload)
3. Pushes the filename to directly connected downstream nodes' `image` widgets
4. Falls back to finding the nearest node to the right with an `image` widget
5. Mutes this node so the downstream node uses its own file widget

### Node Output
| Output | Type | Description |
|--------|------|-------------|
| `cropped_image` | IMAGE | The cropped region as a float32 tensor [B, H, W, C] |

---

## Installation

### Option A — ComfyUI Manager (recommended)
Search for **"Zoom Crop"** in ComfyUI Manager and click Install.

### Option B — Manual
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/MancDanny/Zoom_Crop.git
```
Then restart ComfyUI.

### Option C — Direct download
Download the ZIP from the [Releases](https://github.com/MancDanny/Zoom_Crop/releases) page, extract to `ComfyUI/custom_nodes/Zoom_Crop/`, restart ComfyUI.

**No extra Python dependencies** — uses only `torch`, `numpy`, `Pillow`, and `folder_paths` (all included in ComfyUI).

---

## Usage

1. Add the **Zoom Crop** node from the menu (search "Zoom" or find under `image/crop`)
2. Select an image from the file picker, or connect an upstream IMAGE to the `input_image` slot
3. Draw or adjust the crop box on the canvas
4. Click **Queue Prompt** to output the cropped IMAGE tensor
5. Optionally use **Push >** to send the crop directly to a downstream load image node

### Working with large images
All handle sizes, border widths, and hover detection areas scale automatically with image resolution — they remain visually consistent regardless of whether your image is 512px or 8192px.

---

## Companion Node

**Comfy Sketch Pad** (`Comfy_sketch`) — An interactive drawing and annotation node with R/G/B brushes, lazy mouse, polyline tool, and more. The Push button can send cropped images directly into a Sketch Pad for mask painting.

---

## Changelog

### v2.0.0
- Lock crop position toggle (🔒)
- Max button — expands crop to full image
- 50% Reset button — centres crop at 50% of image
- Advanced panel with preset aspect ratios (4:3, 16:9, SDXL, etc.) and numeric X/Y/W/H inputs
- Paste image from clipboard (button + Ctrl+V)
- Green crop border, no dark overlay outside crop region
- Handle sizes, border widths, and hover detection all scale correctly with image resolution
- `input_image` optional slot — connect upstream IMAGE nodes
- Auto-enables on workflow reload (no longer stays muted)
- Aspect ratio maintained on node resize
- Toolbar reorganised: Fit | 1:1 | 🔒 | Max | 50% | Paste | Push > | Adv

### v1.0.0
- Initial release
- Single canvas with zoom/pan
- Crop box with 8 handles
- 1:1 ratio lock
- Push to downstream nodes
- JSON crop data serialisation

---

## License

MIT
