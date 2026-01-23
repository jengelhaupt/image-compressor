const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

/* =========================
   CONTROLS (nur PNG)
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
    requestAnimationFrame(() => {
        preview.scrollIntoView({ behavior: "smooth" });
    });
};

/* =========================
   UPLOAD EVENTS
========================= */
fileInput.onchange = async (e) => {
    files = [...e.target.files].filter(f => f.type === "image/png");
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
    originalImages = await Promise.all(
        files.map((file) =>
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
function quantizeSimple(ctx, w, h, colors) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const levels = Math.round(Math.cbrt(colors));
    const step = 255 / (levels - 1);

    for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.round(d[i] / step) * step;
        d[i + 1] = Math.round(d[i + 1] / step) * step;
        d[i + 2] = Math.round(d[i + 2] / step) * step;
    }

    ctx.putImageData(img, 0, 0);
}

function ditherFS(ctx, w, h, colors) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const levels = Math.round(Math.cbrt(colors));
    const step = 255 / (levels - 1);

    function q(v) {
        return Math.round(v / step) * step;
    }

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
   RENDER PNG - STUFENWEISE KOMPRESSIEREN
========================= */
async function render() {
    zipFiles = [];
    if (!originalImages.length) return;

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const p = previewItems[i];
        const percent = Number(controlInput.value);

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        // Ausgangsgröße: z.B. 256x256
        let step = 1;  // Step-Wert für den Kompressionsprozess
        let targetWidth = img.width;
        let targetHeight = img.height;
        
        while (targetWidth > 256 || targetHeight > 256) {
            targetWidth = Math.floor(targetWidth * 0.75);  // 25% Reduktion in jeder Stufe
            targetHeight = Math.floor(targetHeight * 0.75);

            // Bild wird immer kleiner
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetHeight;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.drawImage(img, 0, 0, targetWidth, targetHeight);

            // Kompression anwenden
            quantizeSimple(tempCtx, targetWidth, targetHeight, percent);  // Optional: ditherFS statt quantizeSimple
            let blob = await new Promise((r) => tempCanvas.toBlob(r, "image/png"));
            if (blob.size >= file.size) blob = file; // Verhindern, dass die Kompression das Bild vergrößert

            zipFiles.push({ name: file.name, blob });
            p.compressedImg.src = URL.createObjectURL(blob);

            const saved = 100 - (blob.size / file.size) * 100;
            p.infoDiv.textContent = `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

            if (targetWidth <= 256 && targetHeight <= 256) {
                break; // Stoppe, wenn die Zielgröße erreicht ist
            }
        }

        p.downloadLink.href = URL.createObjectURL(blob);
        p.downloadLink.download = file.name;
    }
}

/* =========================
   ZIP
========================= */
zipBtn.onclick = async () => {
    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach((f) => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `png-komprimiert.zip`;
    a.click();
};
