const ACTIVE = typeof MODE !== "undefined" ? MODE : "jpg";

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

/* =========================
   CONTROLS
========================= */
let controlInput, controlLabel;

if (ACTIVE === "jpg") {
    controlInput = document.getElementById("jpgQ");
    controlLabel = document.getElementById("jpgVal");
}
if (ACTIVE === "webp") {
    controlInput = document.getElementById("webpQ");
    controlLabel = document.getElementById("webpVal");
}
if (ACTIVE === "png") {
    controlInput = document.getElementById("pngC");
    controlLabel = document.getElementById("pngVal");
}
if (ACTIVE === "pdf") {
    controlInput = document.getElementById("pdfQ");
    controlLabel = document.getElementById("pdfVal");
}

if (controlInput) {
    controlInput.oninput = () => {
        controlLabel.textContent = controlInput.value;
        render();
    };
}

/* =========================
   DRAG & DROP
========================= */
dropzone.onclick = () => fileInput.click();
dropzone.ondragover = e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
};
dropzone.ondragleave = () => dropzone.classList.remove("dragover");

/* =========================
   UPLOAD EVENTS
========================= */
fileInput.onchange = async e => {
    files = [...e.target.files];
    await prepareImages();
    await render();
    requestAnimationFrame(() => {
        preview.scrollIntoView({ behavior: "smooth" });
    });
};

dropzone.ondrop = async e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    files = [...e.dataTransfer.files];
    await prepareImages();
    await render();
    requestAnimationFrame(() => {
        preview.scrollIntoView({ behavior: "smooth" });
    });
};

/* =========================
   PREPARE IMAGES
========================= */
async function prepareImages() {
    originalImages = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => resolve({ file, img });
        img.onerror = reject;
    })));

    preview.innerHTML = "";
    previewItems = [];

    originalImages.forEach(item => {
        const container = document.createElement("div");
        container.className = "previewItem";

        const origImg = document.createElement("img");
        origImg.src = URL.createObjectURL(item.file);

        const compressedImg = document.createElement("img");
        const infoDiv = document.createElement("div");
        infoDiv.className = "info";

        const downloadLink = document.createElement("a");
        downloadLink.className = "download";
        downloadLink.textContent = "Datei herunterladen";

        container.append(origImg, compressedImg, infoDiv, downloadLink);
        preview.appendChild(container);

        previewItems.push({ origImg, compressedImg, infoDiv, downloadLink });
    });
}

/* =========================
   PNG QUANTIZE / DITHER
========================= */
function sliderToColors(v) {
    return Math.max(8, Math.round((v / 100) ** 2 * 256));
}

function ditherFS(imgData, w, h, colors) {
    const d = imgData.data;
    const levels = Math.round(Math.cbrt(colors));
    const step = 255 / (levels - 1);

    function q(v) { return Math.round(v / step) * step; }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) {
                const old = d[i + c];
                const neu = q(old);
                const err = old - neu;
                d[i + c] = neu;

                const spread = (dx, dy, f) => {
                    const ni = ((y + dy) * w + (x + dx)) * 4 + c;
                    if (ni >= 0 && ni < d.length) d[ni] += err * f;
                };

                spread(1, 0, 7/16);
                spread(-1, 1, 3/16);
                spread(0, 1, 5/16);
                spread(1, 1, 1/16);
            }
        }
    }
}

/* =========================
   RENDER
========================= */
async function render() {
    zipFiles = [];
    if (!originalImages.length) return;

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const p = previewItems[i];
        const percent = Number(controlInput.value);

        /* -------- PDF -------- */
        if (ACTIVE === "pdf" && file.type === "application/pdf") {
            const bytes = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(bytes);
            const outBytes = await pdf.save({ compress: true });
            const blob = new Blob([outBytes]);
            zipFiles.push({ name: file.name, blob });

            p.infoDiv.textContent =
                `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(blob.size/1024).toFixed(1)} KB`;
            p.compressedImg.src = "";
            p.downloadLink.href = URL.createObjectURL(blob);
            p.downloadLink.download = file.name;
            continue;
        }

        /* -------- WEBP CONVERT -------- */
        if (ACTIVE === "webp") {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const quality = Math.min(0.99, percent / 100);
            let blob = await new Promise(r => canvas.toBlob(r, "image/webp", quality));
            if (blob.size >= file.size) blob = file;

            const newName = file.name.replace(/\.(jpg|jpeg|png|webp)$/i, ".webp");
            zipFiles.push({ name: newName, blob });
            p.compressedImg.src = URL.createObjectURL(blob);

            const saved = 100 - (blob.size / file.size * 100);
            p.infoDiv.textContent =
                `Original ${(file.size/1024).toFixed(1)} KB → WebP ${(blob.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
            p.downloadLink.href = URL.createObjectURL(blob);
            p.downloadLink.download = newName;
            continue;
        }

        /* -------- JPG / PNG ohne Kompression -------- */
        if (percent >= 100) {
            zipFiles.push({ name: file.name, blob: file });
            p.compressedImg.src = URL.createObjectURL(file);
            p.infoDiv.textContent =
                `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(file.size/1024).toFixed(1)} KB (0%)`;
            p.downloadLink.href = URL.createObjectURL(file);
            p.downloadLink.download = file.name;
            continue;
        }

        /* -------- CANVAS PREP -------- */
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        let type = ACTIVE === "jpg" ? "image/jpeg" : "image/png";
        let quality = ACTIVE === "jpg" ? Math.min(0.99, percent / 100) : 1;
       

        /* -------- PNG 8-BIT DITHER + UPNG -------- */
if (ACTIVE === "png") {
    const colors = Math.min(256, sliderToColors(percent));

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    // Canvas-Daten auslesen
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Dithering anwenden
    ditherFS(imgData, canvas.width, canvas.height, colors);

    const d = imgData.data;

    // Palette-Map
    const paletteMap = {};
    const palette = [];
    const indexedPixels = new Uint8Array(canvas.width * canvas.height);

    let paletteIndex = 0;

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
            const key = `${r},${g},${b},${a}`;

            if (paletteMap[key] === undefined) {
                if (paletteIndex >= colors) {
                    // Palette voll: fallback auf nächsten existierenden Index (kürzeste Distanz)
                    let minDist = Infinity, nearest = 0;
                    for (let j = 0; j < palette.length; j += 4) {
                        const dr = r - palette[j];
                        const dg = g - palette[j+1];
                        const db = b - palette[j+2];
                        const da = a - palette[j+3];
                        const dist = dr*dr + dg*dg + db*db + da*da;
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = j / 4;
                        }
                    }
                    indexedPixels[y * canvas.width + x] = nearest;
                    continue;
                }
                paletteMap[key] = paletteIndex;
                palette.push(r, g, b, a);
                paletteIndex++;
            }

            indexedPixels[y * canvas.width + x] = paletteMap[key];
        }
    }

    // UPNG-Buffer erstellen
    const pngBuffer = UPNG.encode([indexedPixels], canvas.width, canvas.height, 8, palette);
    const blob = new Blob([pngBuffer], { type: "image/png" });

    zipFiles.push({ name: file.name, blob });
    p.compressedImg.src = URL.createObjectURL(blob);

    const saved = 100 - (blob.size / file.size * 100);
    p.infoDiv.textContent = `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(blob.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

    p.downloadLink.href = URL.createObjectURL(blob);
    p.downloadLink.download = file.name;

    continue;
}

        /* -------- JPG -------- */
        if (ACTIVE === "jpg") {
            let ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            let blob = await new Promise(r => canvas.toBlob(r, type, quality));
            if (blob.size >= file.size) blob = file;

            zipFiles.push({ name: file.name, blob });
            p.compressedImg.src = URL.createObjectURL(blob);

            const saved = 100 - (blob.size / file.size * 100);
            p.infoDiv.textContent =
                `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(file.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

            p.downloadLink.href = URL.createObjectURL(blob);
            p.downloadLink.download = file.name;
        }
    }
}

/* =========================
   ZIP
========================= */
zipBtn.onclick = async () => {
    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach(f => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ACTIVE}-komprimiert.zip`;
    a.click();
};
