const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

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
} else if (ACTIVE === "webp") {
    controlInput = document.getElementById("webpQ");
    controlLabel = document.getElementById("webpVal");
} else if (ACTIVE === "png") {
    controlInput = document.getElementById("pngC");
    controlLabel = document.getElementById("pngVal");
} else if (ACTIVE === "pdf") {
    controlInput = document.getElementById("pdfQ");
    controlLabel = document.getElementById("pdfVal");
}

if (controlInput) {
    controlInput.addEventListener("input", () => {
        controlLabel.textContent = controlInput.value;
        render();
    });
}

/* =========================
   DRAG & DROP & FILE INPUT
========================= */
dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length === 0) return;
    files = [...e.dataTransfer.files];
    await prepareImages();
    await render();
    requestAnimationFrame(() => preview.scrollIntoView({ behavior: "smooth" }));
});

fileInput.addEventListener("change", async (e) => {
    if (e.target.files.length === 0) return;
    files = [...e.target.files];
    await prepareImages();
    await render();
    requestAnimationFrame(() => preview.scrollIntoView({ behavior: "smooth" }));
});

/* =========================
   PREPARE IMAGES
========================= */
async function prepareImages() {
    originalImages = await Promise.all(
        files.map(
            (file) =>
                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = URL.createObjectURL(file);
                    img.onload = () => resolve({ file, img });
                    img.onerror = reject;
                })
        )
    );

    preview.innerHTML = "";
    previewItems = [];

    originalImages.forEach((item) => {
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
   PNG QUANTIZE & DITHER
========================= */
function sliderToColors(v) {
    if (v < 25) return 8;
    if (v < 50) return 32;
    if (v < 75) return 64;
    if (v < 90) return 128;
    return 256;
}

function ditherFS(imgData, w, h, colors) {
    const d = imgData.data;
    const levels = Math.round(Math.cbrt(colors));
    const step = 255 / (levels - 1);

    const q = (v) => Math.round(v / step) * step;

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

                spread(1, 0, 7 / 16);
                spread(-1, 1, 3 / 16);
                spread(0, 1, 5 / 16);
                spread(1, 1, 1 / 16);
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
            p.infoDiv.textContent = `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(blob.size/1024).toFixed(1)} KB`;
            p.compressedImg.src = "";
            p.downloadLink.href = URL.createObjectURL(blob);
            p.downloadLink.download = file.name;
            continue;
        }

        /* -------- WEBP -------- */
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
            p.infoDiv.textContent = `Original ${(file.size/1024).toFixed(1)} KB → WebP ${(blob.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
            p.downloadLink.href = URL.createObjectURL(blob);
            p.downloadLink.download = newName;
            continue;
        }

        /* -------- JPG / PNG -------- */
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        if (percent >= 100) {
            zipFiles.push({ name: file.name, blob: file });
            p.compressedImg.src = URL.createObjectURL(file);
            p.infoDiv.textContent = `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(file.size/1024).toFixed(1)} KB (0%)`;
            p.downloadLink.href = URL.createObjectURL(file);
            p.downloadLink.download = file.name;
            continue;
        }

        if (ACTIVE === "jpg") {
            const quality = Math.min(0.99, percent / 100);
            let blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
            if (blob.size >= file.size) blob = file;
            zipFiles.push({ name: file.name, blob });
            p.compressedImg.src = URL.createObjectURL(blob);
            const saved = 100 - (blob.size / file.size * 100);
            p.infoDiv.textContent = `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(blob.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
            p.downloadLink.href = URL.createObjectURL(blob);
            p.downloadLink.download = file.name;
            continue;
        }

        if (ACTIVE === "png") {
            const colors = sliderToColors(percent);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            ditherFS(imgData, canvas.width, canvas.height, colors);
            const d = imgData.data;

            const paletteMap = {};
            const palette = [];
            const indexedPixels = new Uint8Array(canvas.width * canvas.height);

            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = (y * canvas.width + x) * 4;
                    const key = `${d[i]},${d[i+1]},${d[i+2]},${d[i+3]}`;
                    let idx = paletteMap[key];
                    if (idx === undefined) {
                        idx = palette.length / 4;
                        paletteMap[key] = idx;
                        palette.push(d[i], d[i+1], d[i+2], d[i+3]);
                    }
                    indexedPixels[y * canvas.width + x] = idx;
                }
            }

            const pngBuffer = UPNG.encode([indexedPixels], canvas.width, canvas.height, palette.length / 4, palette);
            const blob = new Blob([pngBuffer], { type: "image/png" });

            zipFiles.push({ name: file.name, blob });
            p.compressedImg.src = URL.createObjectURL(blob);
            const saved = 100 - (blob.size / file.size * 100);
            p.infoDiv.textContent = `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(blob.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
            p.downloadLink.href = URL.createObjectURL(blob);
            p.downloadLink.download = file.name;
        }
    }
}

/* =========================
   ZIP
========================= */
zipBtn.addEventListener("click", async () => {
    if (!zipFiles.length) return;
    const zip = new JSZip();
    zipFiles.forEach(f => zip.file(f.name, f.blob));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ACTIVE}-komprimiert.zip`;
    a.click();
});
