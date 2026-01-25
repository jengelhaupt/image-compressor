const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

/* =========================
   CONTROLS (PNG Farben)
========================= */
const controlInput = document.getElementById("pngC");
const controlLabel = document.getElementById("pngVal");

controlInput.oninput = () => {
    controlLabel.textContent = controlInput.value;
    render();
};

/* =========================
   DRAG & DROP
========================= */
dropzone.onclick = () => fileInput.click();

dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
};

dropzone.ondragleave = () => dropzone.classList.remove("dragover");

dropzone.ondrop = async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    files = [...e.dataTransfer.files].filter(f => f.type === "image/png");
    await prepareImages();
    await render();
};

/* =========================
   FILE UPLOAD
========================= */
fileInput.onchange = async (e) => {
    files = [...e.target.files].filter(f => f.type === "image/png");
    await prepareImages();
    await render();
};

/* =========================
   PREPARE IMAGES
========================= */
async function prepareImages() {
    originalImages = await Promise.all(
        files.map(file => new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => resolve({ file, img });
            img.onerror = reject;
        }))
    );

    preview.innerHTML = "";
    previewItems = [];

    originalImages.forEach(({ file }) => {
        const container = document.createElement("div");
        container.className = "previewItem";

        const origImg = document.createElement("img");
        origImg.src = URL.createObjectURL(file);

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
   QUANTIZE (Basis)
========================= */
function quantizeSimple(ctx, w, h, colors) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    const levels = Math.max(2, Math.round(Math.cbrt(colors)));
    const step = 255 / (levels - 1);

    for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.round(d[i]     / step) * step;
        d[i + 1] = Math.round(d[i + 1] / step) * step;
        d[i + 2] = Math.round(d[i + 2] / step) * step;
    }

    ctx.putImageData(img, 0, 0);
}

/* =========================
   OPTIONAL: DITHERING
========================= */
function ditherFS(ctx, w, h, colors) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    const levels = Math.max(2, Math.round(Math.cbrt(colors)));
    const step = 255 / (levels - 1);
    const q = v => Math.round(v / step) * step;

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
                    if (ni >= 0 && ni < d.length) {
                        d[ni] += err * f;
                    }
                };

                spread(1, 0, 7 / 16);
                spread(-1, 1, 3 / 16);
                spread(0, 1, 5 / 16);
                spread(1, 1, 1 / 16);
            }
        }
    }

    ctx.putImageData(img, 0, 0);
}

/* =========================
   PROGRESSIVE QUANTIZE
========================= */
function quantizeProgressive(ctx, w, h, targetColors, strength) {
    const startColors = 256;
    const colors = Math.round(
        startColors - (startColors - targetColors) * strength
    );
    quantizeSimple(ctx, w, h, colors);
}

/* =========================
   RENDER
========================= */
async function render() {
    if (!originalImages.length) return;
    zipFiles = [];

    const steps = 20;
    const targetColors = Number(controlInput.value);

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const p = previewItems[i];

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        let bestBlob = null;

        for (let s = 0; s <= steps; s++) {
            const strength = s / steps;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            quantizeProgressive(ctx, canvas.width, canvas.height, targetColors, strength);

            if (targetColors < 64) {
                ditherFS(ctx, canvas.width, canvas.height, targetColors);
            }

            const blob = await new Promise(r =>
                canvas.toBlob(r, "image/png")
            );

            if (!bestBlob || blob.size < bestBlob.size) {
                bestBlob = blob;
                p.compressedImg.src = URL.createObjectURL(blob);

                const saved = 100 - (blob.size / file.size) * 100;
                p.infoDiv.textContent =
                    `Original ${(file.size / 1024).toFixed(1)} KB → ` +
                    `Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
            }
        }

        zipFiles.push({ name: file.name, blob: bestBlob });
        p.downloadLink.href = URL.createObjectURL(bestBlob);
        p.downloadLink.download = file.name;
    }
}

/* =========================
   ZIP DOWNLOAD
========================= */
zipBtn.onclick = async () => {
    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach(f => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "png-komprimiert.zip";
    a.click();
};
