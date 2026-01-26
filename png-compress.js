const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

/* =========================
   CONTROL (QUALITY 1–100)
========================= */
const qualityWrapper = document.getElementById("png");
const controlInput = document.getElementById("pngC");
const controlLabel = document.getElementById("pngVal");

controlLabel.textContent = controlInput.value + "%";
controlInput.oninput = () => {
    controlLabel.textContent = controlInput.value + "%";
};

// Render erst beim Loslassen
controlInput.onchange = () => render();

/* =========================
   DRAG & DROP
========================= */
dropzone.onclick = () => fileInput.click();

dropzone.ondragover = e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
};

dropzone.ondragleave = () =>
    dropzone.classList.remove("dragover");

dropzone.ondrop = async e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    files = [...e.dataTransfer.files].filter(f => f.type === "image/png");
    await prepareImages();
    await render();
};

/* =========================
   FILE INPUT
========================= */
fileInput.onchange = async e => {
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

        previewItems.push({ compressedImg, infoDiv, downloadLink });
    });
}

/* =========================
   FLOYD-STEINBERG DITHERING (optional)
========================= */
function ditherFS(data, w, h, colors) {
    const step = 255 / (colors - 1);
    const q = v => Math.round(v / step) * step;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) {
                const oldVal = data[i + c];
                const newVal = q(oldVal);
                const err = oldVal - newVal;
                data[i + c] = newVal;

                const spread = (dx, dy, factor) => {
                    const ni = ((y + dy) * w + (x + dx)) * 4 + c;
                    if (ni >= 0 && ni < data.length) data[ni] += err * factor;
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
   RENDER MIT UPNG UND OPTIONAL DITHER
========================= */
async function render() {
    if (!originalImages.length) return;
    zipFiles = [];

    const quality = Number(controlInput.value); // 1–100

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const p = previewItems[i];

        let blob;

        // 100% = Originaldatei
        if (quality >= 100) {
            blob = file;
            p.infoDiv.textContent =
                `Original ${(file.size / 1024).toFixed(1)} KB (unverändert)`;
        } else {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            // RGBA korrekt extrahieren
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const rgba = new Uint8Array(imgData.data); // ✅ wichtig: direkt aus ImageData

            // Farben basierend auf Slider
            const maxColors = 256;
            const colors = Math.max(2, Math.round(maxColors * quality / 100));

            // optional: Dithering bei mittlerer Qualität
            if (quality < 80) ditherFS(rgba, canvas.width, canvas.height, colors);

            // UPNG encode
            const pngData = UPNG.encode([rgba], canvas.width, canvas.height, 0, colors);
            blob = new Blob([pngData], { type: "image/png" });

            const saved = 100 - (blob.size / file.size) * 100;
            p.infoDiv.textContent =
                `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
        }

        zipFiles.push({ name: file.name, blob });

        p.compressedImg.src = URL.createObjectURL(blob);
        p.downloadLink.href = URL.createObjectURL(blob);
        p.downloadLink.download = file.name;
    }

    // Scroll: Preview immer im Blick, Slider sichtbar
    const sliderBottom = qualityWrapper.getBoundingClientRect().bottom + window.scrollY;
    const previewTop = preview.getBoundingClientRect().top + window.scrollY;
    const offset = 16; // anpassbarer Abstand

    if (previewTop > sliderBottom) {
        window.scrollTo({
            top: previewTop - qualityWrapper.offsetHeight - offset,
            behavior: "smooth"
        });
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
