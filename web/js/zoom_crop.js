import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// ── Toolbar builder ────────────────────────────────────────────────────
function createToolbar(state, redrawFn, node, canvas) {
    const toolbar = document.createElement("div");
    toolbar.style.cssText = `
        display: flex; align-items: center; gap: 4px;
        padding: 4px 8px; background: #1e1e2e;
        border-bottom: 1px solid #333; flex-wrap: wrap;
        min-height: 28px; user-select: none;
    `;

    function btn(label, title, onClick) {
        const b = document.createElement("button");
        b.textContent = label;
        b.title = title;
        b.style.cssText = `
            min-width: 26px; height: 24px; border: 1px solid #555;
            color: #ccc; font-weight: bold; border-radius: 4px;
            cursor: pointer; font-size: 11px; padding: 0 6px;
            background: #333;
        `;
        b.addEventListener("mouseenter", () => { b.style.background = "#555"; });
        b.addEventListener("mouseleave", () => { b.style.background = "#333"; });
        b.addEventListener("click", (e) => { e.stopPropagation(); onClick(e); });
        b.addEventListener("mousedown", (e) => e.stopPropagation());
        return b;
    }

    function sep() {
        const s = document.createElement("div");
        s.style.cssText = "width:1px; height:20px; background:#444; margin:0 3px;";
        return s;
    }

    // Fit / Zoom Extents — resets zoom/pan so image fills the canvas
    const fitBtn = btn("Fit", "Zoom to fit image in view", () => {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        if (redrawFn) redrawFn();
    });
    toolbar.appendChild(fitBtn);

    toolbar.appendChild(sep());

    // 1:1 ratio lock toggle
    const ratioBtn = btn("1:1", "Lock crop to square (1:1 ratio)", () => {
        state.lockRatio = !state.lockRatio;
        updateRatioBtn();
        if (state.lockRatio) {
            // Snap existing crop to square immediately
            const size = Math.min(state.crop.width, state.crop.height);
            state.crop.width = size;
            state.crop.height = size;
            // Clamp to image bounds
            if (state.crop.x + size > state.imageWidth) state.crop.x = state.imageWidth - size;
            if (state.crop.y + size > state.imageHeight) state.crop.y = state.imageHeight - size;
            if (redrawFn) redrawFn();
        }
    });
    function updateRatioBtn() {
        if (state.lockRatio) {
            ratioBtn.style.background = "#2a5a2a";
            ratioBtn.style.color = "#8f8";
            ratioBtn.style.borderColor = "#8f8";
        } else {
            ratioBtn.style.background = "#333";
            ratioBtn.style.color = "#ccc";
            ratioBtn.style.borderColor = "#555";
        }
    }
    ratioBtn.addEventListener("mouseenter", () => {
        ratioBtn.style.background = state.lockRatio ? "#3a7a3a" : "#555";
    });
    ratioBtn.addEventListener("mouseleave", () => {
        ratioBtn.style.background = state.lockRatio ? "#2a5a2a" : "#333";
    });
    updateRatioBtn();
    toolbar.appendChild(ratioBtn);

    // Lock crop position toggle
    const lockBtn = btn("\uD83D\uDD12", "Lock crop position (prevent accidental moves/resizes)", () => {
        state.lockCrop = !state.lockCrop;
        updateLockBtn();
        if (redrawFn) redrawFn();
    });
    function updateLockBtn() {
        if (state.lockCrop) {
            lockBtn.style.background = "#5a2a2a";
            lockBtn.style.color = "#f88";
            lockBtn.style.borderColor = "#f88";
            lockBtn.title = "Crop locked \u2014 click to unlock";
        } else {
            lockBtn.style.background = "#333";
            lockBtn.style.color = "#ccc";
            lockBtn.style.borderColor = "#555";
            lockBtn.title = "Lock crop position";
        }
    }
    lockBtn.addEventListener("mouseenter", () => { lockBtn.style.background = state.lockCrop ? "#7a3a3a" : "#555"; });
    lockBtn.addEventListener("mouseleave", () => { lockBtn.style.background = state.lockCrop ? "#5a2a2a" : "#333"; });
    state._lockBtn = lockBtn;
    state._updateLockBtn = updateLockBtn;
    toolbar.appendChild(lockBtn);

    // Max — expand crop to full image
    const maxBtn = btn("Max", "Set crop to full image", () => {
        state.crop = { x: 0, y: 0, width: state.imageWidth, height: state.imageHeight };
        if (redrawFn) redrawFn();
    });
    toolbar.appendChild(maxBtn);

    // Reset — crop to centered 50%
    const resetBtn = btn("50%", "Reset crop to centered 50%", () => {
        const w = Math.round(state.imageWidth * 0.5);
        const h = Math.round(state.imageHeight * 0.5);
        state.crop = {
            x: Math.round((state.imageWidth - w) / 2),
            y: Math.round((state.imageHeight - h) / 2),
            width: w, height: h,
        };
        if (redrawFn) redrawFn();
    });
    toolbar.appendChild(resetBtn);

    toolbar.appendChild(sep());

    // Push button — upload current image (cropped or not) and send to connected/adjacent nodes
    const pushBtn = btn("Push >", "Push image to the next node", async () => {
        if (!state._bgImage) return;

        const crop = state.crop;
        const cx = Math.round(Math.max(0, crop.x));
        const cy = Math.round(Math.max(0, crop.y));
        const cw = Math.round(Math.min(crop.width, state.imageWidth - cx));
        const ch = Math.round(Math.min(crop.height, state.imageHeight - cy));

        if (cw < 1 || ch < 1) return;

        // Render the cropped region
        const offscreen = document.createElement("canvas");
        offscreen.width = cw;
        offscreen.height = ch;
        const offCtx = offscreen.getContext("2d");
        offCtx.drawImage(state._bgImage, cx, cy, cw, ch, 0, 0, cw, ch);

        // Convert to blob and upload to ComfyUI input folder
        const blob = await new Promise((resolve) =>
            offscreen.toBlob(resolve, "image/png")
        );
        // Alternate between two filenames so downstream watchers
        // always see a value change and reload the image
        state._pushToggle = !state._pushToggle;
        const pushName = state._pushToggle
            ? "zoom_crop_push_a.png"
            : "zoom_crop_push_b.png";

        const formData = new FormData();
        formData.append("image", blob, pushName);
        formData.append("overwrite", "true");

        try {
            const resp = await api.fetchApi("/upload/image", {
                method: "POST",
                body: formData,
            });

            if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
            const result = await resp.json();
            const uploadedName = result.name;

            let pushed = false;

            // Strategy 1: Push to directly connected downstream nodes
            if (node.outputs) {
                for (const output of node.outputs) {
                    if (!output.links) continue;
                    for (const linkId of output.links) {
                        const link = app.graph.links[linkId];
                        if (!link) continue;
                        const targetNode = app.graph.getNodeById(link.target_id);
                        if (!targetNode) continue;

                        const imgWidget = targetNode.widgets?.find(
                            (w) => w.name === "image"
                        );
                        if (imgWidget) {
                            imgWidget.value = uploadedName;
                            if (imgWidget.callback)
                                imgWidget.callback(uploadedName);
                            pushed = true;
                        }
                    }
                }
            }

            // Strategy 2: If no connected nodes had image widgets,
            // find the closest node to the right with an image widget
            if (!pushed) {
                const myX = node.pos[0];
                const myY = node.pos[1];
                let closestNode = null;
                let closestDist = Infinity;

                for (const n of app.graph._nodes) {
                    if (n.id === node.id) continue;
                    const imgW = n.widgets?.find((w) => w.name === "image");
                    if (!imgW) continue;
                    if (n.pos[0] <= myX) continue; // only nodes to the right

                    const dist = Math.hypot(n.pos[0] - myX, n.pos[1] - myY);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestNode = n;
                    }
                }

                if (closestNode) {
                    const imgWidget = closestNode.widgets.find(
                        (w) => w.name === "image"
                    );
                    if (imgWidget) {
                        imgWidget.value = uploadedName;
                        if (imgWidget.callback)
                            imgWidget.callback(uploadedName);
                        pushed = true;
                    }
                }
            }

            // Mute this ZoomCrop node after push
            // Mode 2 = NEVER (muted) — node doesn't execute and outputs nothing.
            // This ensures Sketch Pad falls back to its file widget (the pushed image)
            // instead of receiving corrupt pass-through data from bypass mode.
            node.mode = 2;
            app.graph.setDirtyCanvas(true, true);

            // Disable all buttons except Enable
            if (state._disableToolbar) state._disableToolbar();
        } catch (err) {
            console.error("Push failed:", err);
            pushBtn.textContent = "Error!";
            pushBtn.style.color = "#f88";
            setTimeout(() => {
                pushBtn.textContent = "Push >";
                pushBtn.style.color = "#8cf";
            }, 1500);
        }
    });
    pushBtn.style.background = "#2a3a5a";
    pushBtn.style.color = "#8cf";
    pushBtn.addEventListener("mouseenter", () => {
        pushBtn.style.background = "#3a5a7a";
    });
    pushBtn.addEventListener("mouseleave", () => {
        pushBtn.style.background = "#2a3a5a";
    });

    // Paste button — before Push in toolbar order
    const pasteBtn = btn("Paste", "Paste image from clipboard (Ctrl+V)", async () => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find((t) => t.startsWith("image/"));
                if (!imageType) continue;
                const blob = await item.getType(imageType);
                await state._uploadAndSetImage(blob, node);
                return;
            }
        } catch (err) {
            console.error("ZoomCrop paste failed:", err);
        }
    });
    pasteBtn.style.background = "#2a3a5a";
    pasteBtn.style.color = "#8cf";
    pasteBtn.addEventListener("mouseenter", () => { pasteBtn.style.background = "#3a5a7a"; });
    pasteBtn.addEventListener("mouseleave", () => { pasteBtn.style.background = "#2a3a5a"; });
    toolbar.appendChild(pasteBtn);

    toolbar.appendChild(sep());

    toolbar.appendChild(pushBtn);

    // Enable button — re-activates this node after it was bypassed by Push
    const enableBtn = btn("Enable", "Re-enable this node for execution", () => {
        node.mode = 0; // LiteGraph mode 0 = ALWAYS (active)
        app.graph.setDirtyCanvas(true, true);
        if (state._enableToolbar) state._enableToolbar();
    });
    enableBtn.style.background = "#4a3a1a";
    enableBtn.style.color = "#fd8";
    enableBtn.style.display = "none"; // hidden until Push disables the node
    enableBtn.addEventListener("mouseenter", () => { enableBtn.style.background = "#6a5a2a"; });
    enableBtn.addEventListener("mouseleave", () => { enableBtn.style.background = "#4a3a1a"; });
    toolbar.appendChild(enableBtn);

    // Store refs so Push can swap button visibility
    state._pushBtn = pushBtn;
    state._enableBtn = enableBtn;

    toolbar.appendChild(sep());

    // All buttons that should be disabled when node is muted
    const actionBtns = [fitBtn, ratioBtn, lockBtn, maxBtn, resetBtn, pasteBtn, pushBtn];

    // Helper: disable all action buttons (called by Push)
    state._disableToolbar = () => {
        for (const b of actionBtns) {
            b.disabled = true;
            b.style.opacity = "0.35";
            b.style.pointerEvents = "none";
        }
        pushBtn.style.display = "none";
        enableBtn.style.display = "";
    };

    // Helper: re-enable all action buttons (called by Enable)
    state._enableToolbar = () => {
        for (const b of actionBtns) {
            b.disabled = false;
            b.style.opacity = "1";
            b.style.pointerEvents = "auto";
        }
        enableBtn.style.display = "none";
        pushBtn.style.display = "";
    };

    toolbar.appendChild(sep());

    // Crop info label
    const infoLabel = document.createElement("span");
    infoLabel.style.cssText = "color: #aaa; font-size: 10px; margin-left: auto;";
    infoLabel.textContent = "No crop";
    toolbar.appendChild(infoLabel);

    state._infoLabel = infoLabel;

    return toolbar;
}

// ── Hit-test helpers ────────────────────────────────────────────────────
const HANDLE_SIZE = 12;       // visual size of anchor squares (50% larger)
const HANDLE_HIT  = 28;       // hit-detection radius in screen px (generous hover area)

function getHandles(crop) {
    const { x, y, width, height } = crop;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = x + width;
    const b = y + height;
    return {
        tl: { x: x, y: y },
        tc: { x: cx, y: y },
        tr: { x: r, y: y },
        ml: { x: x, y: cy },
        mr: { x: r, y: cy },
        bl: { x: x, y: b },
        bc: { x: cx, y: b },
        br: { x: r, y: b },
    };
}

function hitTestHandles(mx, my, crop, zoom, canvas) {
    const handles = getHandles(crop);
    const rect = canvas.getBoundingClientRect();
    const displayScale = canvas.width / (rect.width || canvas.offsetWidth || canvas.width);
    const threshold = HANDLE_HIT * displayScale / zoom;
    for (const [key, pos] of Object.entries(handles)) {
        if (Math.abs(mx - pos.x) < threshold && Math.abs(my - pos.y) < threshold) {
            return key;
        }
    }
    return null;
}

function hitTestCropBox(mx, my, crop) {
    return (
        mx >= crop.x && mx <= crop.x + crop.width &&
        my >= crop.y && my <= crop.y + crop.height
    );
}

function getCursorForHandle(handle) {
    const cursors = {
        tl: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", br: "nwse-resize",
        tc: "ns-resize", bc: "ns-resize", ml: "ew-resize", mr: "ew-resize",
    };
    return cursors[handle] || "default";
}

// ── Canvas drawing ──────────────────────────────────────────────────────
function drawCropOverlay(ctx, canvas, state) {
    const { crop, imageWidth, imageHeight, zoom, panX, panY } = state;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state._bgImage) return;

    // displayScale converts screen px sizes to image px sizes
    const rect = canvas.getBoundingClientRect();
    const displayScale = canvas.width / (rect.width || canvas.offsetWidth || canvas.width);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw image
    ctx.drawImage(state._bgImage, 0, 0, imageWidth, imageHeight);

    // Crop border (green dashed) — 1.875 screen px
    ctx.strokeStyle = "#00e676";
    ctx.lineWidth = 1.875 * displayScale / zoom;
    const dashLen = 6 * displayScale / zoom;
    const gapLen  = 4 * displayScale / zoom;
    ctx.setLineDash([dashLen, gapLen]);
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
    ctx.setLineDash([]);

    // Rule of thirds grid (subtle green) — 0.5 screen px
    ctx.strokeStyle = "rgba(0, 230, 118, 0.25)";
    ctx.lineWidth = 0.5 * displayScale / zoom;
    for (let i = 1; i <= 2; i++) {
        const gx = crop.x + (crop.width * i) / 3;
        const gy = crop.y + (crop.height * i) / 3;
        ctx.beginPath();
        ctx.moveTo(gx, crop.y);
        ctx.lineTo(gx, crop.y + crop.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(crop.x, gy);
        ctx.lineTo(crop.x + crop.width, gy);
        ctx.stroke();
    }

    // Resize handles — HANDLE_SIZE screen px
    const handles = getHandles(crop);
    const hs = HANDLE_SIZE * displayScale / zoom;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1 * displayScale / zoom;
    for (const pos of Object.values(handles)) {
        ctx.fillRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
        ctx.strokeRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
    }

    ctx.restore();

    // Update info label
    if (state._infoLabel) {
        const w = Math.round(crop.width);
        const h = Math.round(crop.height);
        const zoomPct = Math.round(zoom * 100);
        state._infoLabel.textContent = `${w} x ${h} px | ${zoomPct}%`;
    }
}

// ── Mouse interaction ───────────────────────────────────────────────────
function initInteraction(canvas, state, redrawFn) {
    let mode = null;
    let activeHandle = null;
    let startX = 0, startY = 0;
    let startCrop = null;
    let spaceDown = false;

    function toImageCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        const imgX = (canvasX - state.panX) / state.zoom;
        const imgY = (canvasY - state.panY) / state.zoom;
        return { imgX, imgY, canvasX, canvasY };
    }

    function clampCrop(crop) {
        crop.x = Math.max(0, Math.min(crop.x, state.imageWidth - 1));
        crop.y = Math.max(0, Math.min(crop.y, state.imageHeight - 1));
        crop.width = Math.max(1, Math.min(crop.width, state.imageWidth - crop.x));
        crop.height = Math.max(1, Math.min(crop.height, state.imageHeight - crop.y));
    }

    function onMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        const { imgX, imgY, canvasX, canvasY } = toImageCoords(e);

        if (spaceDown || e.button === 1) {
            mode = "pan";
            startX = canvasX;
            startY = canvasY;
            canvas.style.cursor = "grabbing";
            return;
        }

        // When crop is locked, no crop interaction (only pan allowed)
        if (state.lockCrop) return;

        const handle = hitTestHandles(imgX, imgY, state.crop, state.zoom, canvas);
        if (handle) {
            mode = "resize";
            activeHandle = handle;
            startX = imgX;
            startY = imgY;
            startCrop = JSON.parse(JSON.stringify(state.crop));
            canvas.style.cursor = getCursorForHandle(handle);
            return;
        }

        if (hitTestCropBox(imgX, imgY, state.crop)) {
            mode = "move";
            startX = imgX;
            startY = imgY;
            startCrop = JSON.parse(JSON.stringify(state.crop));
            canvas.style.cursor = "move";
            return;
        }

        mode = "draw";
        startX = Math.max(0, Math.min(imgX, state.imageWidth));
        startY = Math.max(0, Math.min(imgY, state.imageHeight));
        startCrop = JSON.parse(JSON.stringify(state.crop));
        state.crop = { x: startX, y: startY, width: 0, height: 0 };
        canvas.style.cursor = "crosshair";
    }

    function onMouseMove(e) {
        e.preventDefault();
        if (mode) e.stopPropagation();

        const { imgX, imgY, canvasX, canvasY } = toImageCoords(e);

        if (mode === "pan") {
            state.panX += canvasX - startX;
            state.panY += canvasY - startY;
            startX = canvasX;
            startY = canvasY;
            redrawFn();
            return;
        }

        if (mode === "draw") {
            const clampedX = Math.max(0, Math.min(imgX, state.imageWidth));
            const clampedY = Math.max(0, Math.min(imgY, state.imageHeight));
            let x1 = Math.min(startX, clampedX);
            let y1 = Math.min(startY, clampedY);
            let x2 = Math.max(startX, clampedX);
            let y2 = Math.max(startY, clampedY);

            if (state.lockRatio) {
                const ratio = (state.aspectW || 1) / (state.aspectH || 1);
                let w = x2 - x1;
                let h = y2 - y1;
                // Pick dominant dimension based on drag direction
                if (w / ratio >= h) { h = w / ratio; }
                else { w = h * ratio; }
                if (clampedX >= startX) { x1 = startX; x2 = startX + w; }
                else { x2 = startX; x1 = startX - w; }
                if (clampedY >= startY) { y1 = startY; y2 = startY + h; }
                else { y2 = startY; y1 = startY - h; }
                // Clamp to image bounds
                x1 = Math.max(0, x1); y1 = Math.max(0, y1);
                x2 = Math.min(state.imageWidth, x2); y2 = Math.min(state.imageHeight, y2);
            }

            state.crop = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
            redrawFn();
            return;
        }

        if (mode === "move") {
            const dx = imgX - startX;
            const dy = imgY - startY;
            state.crop.x = startCrop.x + dx;
            state.crop.y = startCrop.y + dy;
            state.crop.x = Math.max(0, Math.min(state.crop.x, state.imageWidth - state.crop.width));
            state.crop.y = Math.max(0, Math.min(state.crop.y, state.imageHeight - state.crop.height));
            redrawFn();
            return;
        }

        if (mode === "resize") {
            const dx = imgX - startX;
            const dy = imgY - startY;
            const sc = startCrop;

            let newX = sc.x, newY = sc.y, newW = sc.width, newH = sc.height;

            if (activeHandle.includes("l")) { newX = sc.x + dx; newW = sc.width - dx; }
            if (activeHandle.includes("r")) { newW = sc.width + dx; }
            if (activeHandle.includes("t")) { newY = sc.y + dy; newH = sc.height - dy; }
            if (activeHandle.includes("b")) { newH = sc.height + dy; }

            if (newW < 1) { newW = 1; if (activeHandle.includes("l")) newX = sc.x + sc.width - 1; }
            if (newH < 1) { newH = 1; if (activeHandle.includes("t")) newY = sc.y + sc.height - 1; }

            if (state.lockRatio) {
                const ratio = (state.aspectW || 1) / (state.aspectH || 1);
                // Use the larger dimension to enforce the aspect ratio
                if (newW / ratio >= newH) { newH = newW / ratio; }
                else { newW = newH * ratio; }
                if (activeHandle.includes("l")) newX = sc.x + sc.width - newW;
                if (activeHandle.includes("t")) newY = sc.y + sc.height - newH;
            }

            state.crop = { x: newX, y: newY, width: newW, height: newH };
            clampCrop(state.crop);
            redrawFn();
            return;
        }

        if (!mode) {
            if (state.lockCrop) {
                canvas.style.cursor = spaceDown ? "grab" : "default";
            } else {
                const handle = hitTestHandles(imgX, imgY, state.crop, state.zoom, canvas);
                if (handle) {
                    canvas.style.cursor = getCursorForHandle(handle);
                } else if (hitTestCropBox(imgX, imgY, state.crop)) {
                    canvas.style.cursor = "move";
                } else {
                    canvas.style.cursor = spaceDown ? "grab" : "crosshair";
                }
            }
        }
    }

    function onMouseUp(e) {
        if (e) e.preventDefault();
        if (mode === "draw" && state.crop.width < 2 && state.crop.height < 2) {
            if (startCrop) {
                state.crop = startCrop;
            }
        }
        mode = null;
        activeHandle = null;
        canvas.style.cursor = spaceDown ? "grab" : "crosshair";
        redrawFn();
    }

    function onWheel(e) {
        e.preventDefault();
        e.stopPropagation();

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        const oldZoom = state.zoom;
        const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        state.zoom = Math.max(0.1, Math.min(20, state.zoom * zoomFactor));

        state.panX = mouseX - (mouseX - state.panX) * (state.zoom / oldZoom);
        state.panY = mouseY - (mouseY - state.panY) * (state.zoom / oldZoom);

        redrawFn();
    }

    function onKeyDown(e) {
        if (!canvas.offsetParent) return;
        if (e.code === "Space" && !spaceDown) {
            spaceDown = true;
            if (!mode) canvas.style.cursor = "grab";
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        if (e.code === "Space") {
            spaceDown = false;
            if (!mode) canvas.style.cursor = "crosshair";
        }
    }

    function onDocMouseMove(e) {
        if (!mode) return;
        e.preventDefault();
        e.stopPropagation();
        onMouseMove(e);
    }

    function onDocMouseUp(e) {
        if (!mode) return;
        e.stopPropagation();
        onMouseUp(e);
    }

    canvas.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        onMouseDown(e);
    }, true);

    document.addEventListener("mousemove", onDocMouseMove, true);
    document.addEventListener("mouseup", onDocMouseUp, true);

    canvas.addEventListener("pointermove", (e) => {
        if (mode) return;
        if (state.lockCrop) {
            canvas.style.cursor = spaceDown ? "grab" : "default";
            return;
        }
        const { imgX, imgY } = toImageCoords(e);
        const handle = hitTestHandles(imgX, imgY, state.crop, state.zoom, canvas);
        if (handle) {
            canvas.style.cursor = getCursorForHandle(handle);
        } else if (hitTestCropBox(imgX, imgY, state.crop)) {
            canvas.style.cursor = "move";
        } else {
            canvas.style.cursor = spaceDown ? "grab" : "crosshair";
        }
    }, true);

    canvas.addEventListener("wheel", (e) => {
        e.stopPropagation();
        e.preventDefault();
        onWheel(e);
    }, { capture: true, passive: false });

    canvas.addEventListener("touchstart", (e) => {
        e.stopPropagation();
        e.preventDefault();
        onMouseDown(e);
    }, { capture: true, passive: false });
    document.addEventListener("touchmove", (e) => {
        if (!mode) return;
        e.preventDefault();
        onMouseMove(e);
    }, { capture: true, passive: false });
    document.addEventListener("touchend", (e) => {
        if (!mode) return;
        onMouseUp(e);
    }, true);

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    return { cleanup: () => {
        document.removeEventListener("mousemove", onDocMouseMove, true);
        document.removeEventListener("mouseup", onDocMouseUp, true);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
    }};
}

// ── Image background watcher ────────────────────────────────────────────
function watchImageWidget(node, canvas, state, redrawFn) {
    let lastVal = null;

    function loadBackground(imageName) {
        if (!imageName) return;
        state.lastImageSrc = imageName;

        let subfolder = "";
        let filename = imageName;
        const sepIdx = imageName.lastIndexOf("/");
        if (sepIdx > -1) {
            subfolder = imageName.substring(0, sepIdx);
            filename = imageName.substring(sepIdx + 1);
        }

        const cacheBust = `&t=${Date.now()}`;
        const url = api.apiURL(
            `/view?filename=${encodeURIComponent(filename)}&type=input&subfolder=${encodeURIComponent(subfolder)}${cacheBust}`
        );

        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            state.imageWidth = img.naturalWidth;
            state.imageHeight = img.naturalHeight;
            state._bgImage = img;

            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            // Default crop: centered 50% of image
            const cropW = Math.round(img.naturalWidth * 0.5);
            const cropH = Math.round(img.naturalHeight * 0.5);
            const cropX = Math.round((img.naturalWidth - cropW) / 2);
            const cropY = Math.round((img.naturalHeight - cropH) / 2);
            state.crop = { x: cropX, y: cropY, width: cropW, height: cropH };
            state.zoom = 1;
            state.panX = 0;
            state.panY = 0;

            // Resize node to fit aspect ratio
            const aspect = img.naturalWidth / img.naturalHeight;
            const nodeWidth = Math.max(380, node.size[0]);
            const canvasDisplayH = nodeWidth / aspect;
            const totalH = canvasDisplayH + 120;
            node.setSize([nodeWidth, totalH]);

            redrawFn();
        };
        img.src = url;
    }

    // Expose forceReload so Revert button can trigger it
    state._forceReload = () => {
        const imageWidget = node.widgets?.find((w) => w.name === "image");
        if (imageWidget?.value) {
            lastVal = null;
            state.lastImageSrc = null;
            state._bgImage = null;
            loadBackground(imageWidget.value);
        }
    };

    const interval = setInterval(() => {
        const imageWidget = node.widgets?.find((w) => w.name === "image");
        if (imageWidget && imageWidget.value !== lastVal) {
            lastVal = imageWidget.value;
            loadBackground(imageWidget.value);
        }
    }, 500);

    const origOnRemoved = node.onRemoved;
    node.onRemoved = function () {
        clearInterval(interval);
        origOnRemoved?.apply(this, arguments);
    };

    requestAnimationFrame(() => {
        const imageWidget = node.widgets?.find((w) => w.name === "image");
        if (imageWidget?.value) loadBackground(imageWidget.value);
    });
}

// ── Main extension ──────────────────────────────────────────────────────
app.registerExtension({
    name: "Comfy.ZoomCrop",

    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== "ZoomCrop") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origOnNodeCreated?.apply(this, arguments);
            const node = this;

            // ── State ──
            const state = {
                crop: { x: 0, y: 0, width: 512, height: 512 },
                zoom: 1,
                panX: 0,
                panY: 0,
                imageWidth: 512,
                imageHeight: 512,
                lastImageSrc: null,
                _bgImage: null,
                _infoLabel: null,
                _forceReload: null,
                _pushToggle: false,
                _pasteToggle: false,
                lockRatio: false,
                lockCrop: false,
                aspectW: 1,
                aspectH: 1,
                _uploadAndSetImage: null,
            };

            // ── Container ──
            const container = document.createElement("div");
            container.style.cssText = `
                display: flex; flex-direction: column;
                width: 100%; background: #1a1a2e;
                border-radius: 4px; overflow: hidden;
            `;

            // ── Canvas ──
            const canvas = document.createElement("canvas");
            canvas.width = 512;
            canvas.height = 512;
            canvas.style.cssText = `
                width: 100%; cursor: crosshair;
                background: #222; display: block;
            `;

            const ctx = canvas.getContext("2d");

            function redraw() {
                drawCropOverlay(ctx, canvas, state);
            }

            // ── Toolbar ──
            const toolbar = createToolbar(state, redraw, node, canvas);
            container.appendChild(toolbar);

            // ── Advanced panel (hidden until toggled) ──
            const advPanel = document.createElement("div");
            advPanel.style.cssText = `
                display: none; flex-direction: column; gap: 5px;
                padding: 6px 8px; background: #1a1a30;
                border-bottom: 1px solid #333;
            `;

            // Preset aspect ratios row
            const ratioRow = document.createElement("div");
            ratioRow.style.cssText = "display: flex; align-items: center; gap: 4px; flex-wrap: wrap;";
            const ratioRowLabel = document.createElement("span");
            ratioRowLabel.textContent = "Ratio:";
            ratioRowLabel.style.cssText = "color: #aaa; font-size: 10px; min-width: 30px;";
            ratioRow.appendChild(ratioRowLabel);

            const ratioPresets = [
                { label: "Free", w: 0, h: 0 },
                { label: "1:1", w: 1, h: 1 },
                { label: "4:3", w: 4, h: 3 },
                { label: "3:4", w: 3, h: 4 },
                { label: "16:9", w: 16, h: 9 },
                { label: "9:16", w: 9, h: 16 },
                { label: "SDXL 1:1", w: 1, h: 1 },
                { label: "SDXL 3:2", w: 3, h: 2 },
                { label: "SDXL 2:3", w: 2, h: 3 },
            ];
            let activeRatioBtn = null;
            ratioPresets.forEach(({ label, w, h }) => {
                const rb = document.createElement("button");
                rb.textContent = label;
                rb.style.cssText = `
                    height: 20px; border: 1px solid #555; color: #ccc;
                    border-radius: 3px; cursor: pointer; font-size: 10px; padding: 0 5px;
                    background: #333;
                `;
                rb.addEventListener("mousedown", (e) => e.stopPropagation());
                rb.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (activeRatioBtn) {
                        activeRatioBtn.style.background = "#333";
                        activeRatioBtn.style.color = "#ccc";
                        activeRatioBtn.style.borderColor = "#555";
                    }
                    activeRatioBtn = rb;
                    rb.style.background = "#2a5a2a";
                    rb.style.color = "#8f8";
                    rb.style.borderColor = "#8f8";

                    if (w === 0) {
                        // Free — unlock ratio
                        state.lockRatio = false;
                        state.aspectW = 1;
                        state.aspectH = 1;
                    } else {
                        state.lockRatio = true;
                        state.aspectW = w;
                        state.aspectH = h;
                        // Snap existing crop to new ratio immediately
                        const newW = state.crop.width;
                        const newH = Math.round(newW / (w / h));
                        state.crop.height = Math.min(newH, state.imageHeight - state.crop.y);
                        if (state.crop.y + state.crop.height > state.imageHeight)
                            state.crop.y = state.imageHeight - state.crop.height;
                    }
                    redraw();
                });
                ratioRow.appendChild(rb);
            });
            advPanel.appendChild(ratioRow);

            // Numeric X / Y / W / H fields
            const numRow = document.createElement("div");
            numRow.style.cssText = "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;";

            function makeNumField(labelText, getter, setter) {
                const wrap = document.createElement("div");
                wrap.style.cssText = "display: flex; align-items: center; gap: 3px;";
                const lbl = document.createElement("span");
                lbl.textContent = labelText + ":";
                lbl.style.cssText = "color: #aaa; font-size: 10px;";
                const inp = document.createElement("input");
                inp.type = "number";
                inp.min = "0";
                inp.style.cssText = `
                    width: 56px; height: 20px; background: #2a2a3e;
                    border: 1px solid #555; color: #eee; font-size: 10px;
                    border-radius: 3px; padding: 0 4px; text-align: right;
                `;
                inp.addEventListener("mousedown", (e) => e.stopPropagation());
                inp.addEventListener("change", (e) => {
                    e.stopPropagation();
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) setter(v);
                    redraw();
                });
                wrap.appendChild(lbl);
                wrap.appendChild(inp);
                numRow.appendChild(wrap);
                return inp;
            }

            const xInp = makeNumField("X", () => state.crop.x, (v) => {
                state.crop.x = Math.max(0, Math.min(v, state.imageWidth - state.crop.width));
            });
            const yInp = makeNumField("Y", () => state.crop.y, (v) => {
                state.crop.y = Math.max(0, Math.min(v, state.imageHeight - state.crop.height));
            });
            const wInp = makeNumField("W", () => state.crop.width, (v) => {
                state.crop.width = Math.max(1, Math.min(v, state.imageWidth - state.crop.x));
            });
            const hInp = makeNumField("H", () => state.crop.height, (v) => {
                state.crop.height = Math.max(1, Math.min(v, state.imageHeight - state.crop.y));
            });
            advPanel.appendChild(numRow);

            // Sync numeric fields with current crop (on interval)
            const syncInterval = setInterval(() => {
                if (advPanel.style.display === "none") return;
                xInp.value = Math.round(state.crop.x);
                yInp.value = Math.round(state.crop.y);
                wInp.value = Math.round(state.crop.width);
                hInp.value = Math.round(state.crop.height);
            }, 100);

            // Add "Adv" toggle button to toolbar
            const advBtn = document.createElement("button");
            advBtn.textContent = "Adv";
            advBtn.title = "Toggle advanced options (ratios, numeric fields)";
            advBtn.style.cssText = `
                min-width: 26px; height: 24px; border: 1px solid #555;
                color: #ccc; font-weight: bold; border-radius: 4px;
                cursor: pointer; font-size: 11px; padding: 0 6px;
                background: #333;
            `;
            advBtn.addEventListener("mousedown", (e) => e.stopPropagation());
            advBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const visible = advPanel.style.display !== "none";
                advPanel.style.display = visible ? "none" : "flex";
                advBtn.style.background = visible ? "#333" : "#2a3a5a";
                advBtn.style.color = visible ? "#ccc" : "#8cf";
                advBtn.style.borderColor = visible ? "#555" : "#8cf";
            });
            toolbar.appendChild(advBtn);

            // Add advPanel cleanup to node removal
            const _origOnRemovedAdv = node.onRemoved;
            node.onRemoved = function () {
                clearInterval(syncInterval);
                _origOnRemovedAdv?.apply(this, arguments);
            };

            container.appendChild(advPanel);
            container.appendChild(canvas);

            // ── Init interaction ──
            const interaction = initInteraction(canvas, state, redraw);

            // ── Helper: get crop coords relative to original file on disk ──
            function getOriginalCropData() {
                return JSON.stringify({
                    x: Math.round(state.crop.x),
                    y: Math.round(state.crop.y),
                    width: Math.round(state.crop.width),
                    height: Math.round(state.crop.height),
                });
            }

            // ── Register DOM widget ──
            const widget = node.addDOMWidget(
                "crop_data",
                "customwidget",
                container,
                {
                    getValue: () => getOriginalCropData(),
                    setValue: (v) => {
                        if (v && typeof v === "string") {
                            try {
                                const data = JSON.parse(v);
                                if (data.x !== undefined) {
                                    state.crop = {
                                        x: data.x || 0,
                                        y: data.y || 0,
                                        width: data.width || state.imageWidth,
                                        height: data.height || state.imageHeight,
                                    };
                                    redraw();
                                }
                            } catch (e) { /* ignore invalid JSON */ }
                        }
                    },
                    getMinHeight: () => 300,
                }
            );

            widget.serializeValue = async () => getOriginalCropData();

            // ── Watch image widget (sets state._forceReload) ──
            watchImageWidget(node, canvas, state, redraw);

            // ── Load image from connected input_image when upstream executes ──
            const onExecuted = (event) => {
                const detail = event.detail;
                if (!detail?.output?.images?.length) return;

                // Check if input_image slot exists and is connected
                const inputSlot = node.inputs?.find((i) => i.name === "input_image");
                if (!inputSlot?.link) return;

                // Verify the executed node is the upstream source
                const link = app.graph.links[inputSlot.link];
                if (!link || String(link.origin_id) !== String(detail.node)) return;

                const imgInfo = detail.output.images[0];
                const url = api.apiURL(
                    `/view?filename=${encodeURIComponent(imgInfo.filename)}&type=${encodeURIComponent(imgInfo.type)}&subfolder=${encodeURIComponent(imgInfo.subfolder || "")}&t=${Date.now()}`
                );

                const img = new window.Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    state.imageWidth = img.naturalWidth;
                    state.imageHeight = img.naturalHeight;
                    state._bgImage = img;
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;

                    // Keep existing crop if same dimensions, else reset to 50%
                    const sameSize =
                        state.crop.width > 0 &&
                        state.crop.x + state.crop.width <= img.naturalWidth &&
                        state.crop.y + state.crop.height <= img.naturalHeight;
                    if (!sameSize) {
                        const cw = Math.round(img.naturalWidth * 0.5);
                        const ch = Math.round(img.naturalHeight * 0.5);
                        state.crop = {
                            x: Math.round((img.naturalWidth - cw) / 2),
                            y: Math.round((img.naturalHeight - ch) / 2),
                            width: cw,
                            height: ch,
                        };
                    }

                    // Resize node to fit aspect ratio
                    const aspect = img.naturalWidth / img.naturalHeight;
                    const nodeWidth = Math.max(380, node.size[0]);
                    node.setSize([nodeWidth, nodeWidth / aspect + 120]);

                    redraw();
                };
                img.src = url;
            };
            api.addEventListener("executed", onExecuted);

            // ── Hide the auto-generated image preview ──
            node.onDrawBackground = function() {};
            node.setSizeForImage = function() {};
            let _blockedImgs = null;
            Object.defineProperty(node, "imgs", {
                get: function() { return null; },
                set: function(v) { _blockedImgs = v; },
                configurable: true,
            });
            const hidePreview = () => {
                const pw = node.widgets?.find(
                    (w) => w.name === "$$canvas-image-preview" || w.name === "preview"
                );
                if (pw) {
                    pw.computeSize = () => [0, -4];
                    if (pw.element) pw.element.style.display = "none";
                }
            };
            hidePreview();
            setTimeout(hidePreview, 500);
            setTimeout(hidePreview, 1500);

            // ── Clipboard paste ──
            state._uploadAndSetImage = async (blob, targetNode) => {
                state._pasteToggle = !state._pasteToggle;
                const name = state._pasteToggle
                    ? "zoom_crop_paste_a.png"
                    : "zoom_crop_paste_b.png";
                const formData = new FormData();
                formData.append("image", blob, name);
                formData.append("overwrite", "true");
                try {
                    const resp = await api.fetchApi("/upload/image", {
                        method: "POST",
                        body: formData,
                    });
                    if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
                    const result = await resp.json();
                    const imageWidget = targetNode.widgets?.find(
                        (w) => w.name === "image"
                    );
                    if (imageWidget) {
                        imageWidget.value = result.name;
                        if (imageWidget.callback)
                            imageWidget.callback(result.name);
                    }
                } catch (err) {
                    console.error("ZoomCrop upload failed:", err);
                }
            };

            const onPaste = (e) => {
                if (!canvas.offsetParent) return;
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                    if (item.type.startsWith("image/")) {
                        e.preventDefault();
                        const blob = item.getAsFile();
                        state._uploadAndSetImage(blob, node);
                        return;
                    }
                }
            };
            document.addEventListener("paste", onPaste);

            // Cleanup on removal
            const origOnRemoved = node.onRemoved;
            node.onRemoved = function () {
                interaction.cleanup();
                document.removeEventListener("paste", onPaste);
                api.removeEventListener("executed", onExecuted);
                origOnRemoved?.apply(this, arguments);
            };

            // ── Node resize handler — maintain image aspect ratio ──
            let _resizing = false;
            const origOnResize = node.onResize;
            node.onResize = function (size) {
                origOnResize?.apply(this, arguments);
                if (state._bgImage && !_resizing) {
                    const aspect = state.imageWidth / state.imageHeight;
                    const targetH = Math.round(size[0] / aspect) + 120;
                    if (Math.abs(size[1] - targetH) > 2) {
                        _resizing = true;
                        node.setSize([size[0], targetH]);
                        _resizing = false;
                    }
                }
                requestAnimationFrame(() => redraw());
            };

            node.setSize([400, 480]);
        };

        // ── Restore on workflow load ──
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            origOnConfigure?.apply(this, arguments);

            // Always start enabled — don't stay muted from a previous Push
            this.mode = 0;

            if (!info?.widgets_values) return;

            const vals = info.widgets_values;
            let cropDataStr = null;

            if (Array.isArray(vals)) {
                cropDataStr = vals.find(
                    (v) => typeof v === "string" && v.startsWith("{")
                );
            } else if (vals.crop_data) {
                cropDataStr = vals.crop_data;
            }

            if (cropDataStr) {
                requestAnimationFrame(() => {
                    const w = this.widgets?.find((w) => w.name === "crop_data");
                    if (w?.options?.setValue) {
                        w.options.setValue(cropDataStr);
                    }
                });
            }
        };
    },
});
