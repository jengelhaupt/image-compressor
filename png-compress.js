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
   PNG-8 KONVERTIERUNG
========================= */
function quantizeToPNG8(imageData, width, height, maxColors = 256) {
    const colorMap = new Map();
    const colors = [];

    // Sammle alle Farben aus dem Bild
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        const color = (r << 16) | (g << 8) | b;

        if (!colorMap.has(color)) {
            if (colors.length < maxColors) {
                colors.push(color);
                colorMap.set(color, true);
            }
        }
    }

    // Wenn mehr als maxColors, benutze eine Technik wie Median Cut oder K-Means (nicht implementiert hier)
    // Das reduziert die Farben auf maxColors

    // Gehe durch das Bild und ersetze die Farben mit den nächstgelegenen Farben
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        let minDist = Infinity;
        let closestColor = 0;

        for (const color of colors) {
            const cr = (color >> 16) & 0xFF;
            const cg = (color >> 8) & 0xFF;
            const cb = color & 0xFF;
            const dist = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
            if (dist < minDist) {
                minDist = dist;
                closestColor = color;
            }
        }

        imageData.data[i] = (closestColor >> 16) & 0xFF;
        imageData.data[i + 1] = (closestColor >> 8) & 0xFF;
        imageData.data[i + 2] = closestColor & 0xFF;
    }

    return imageData;
}

/* =========================
   RENDER PNG-8 - KOMPRESSIEREN UND QUALITÄT
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

        // Holen wir uns die Bilddaten
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Wenden wir die PNG-8-Quantisierung an
        imageData = quantizeToPNG8(imageData, canvas.width, canvas.height, 256);

        ctx.putImageData(imageData, 0, 0);

        // PNG-8 Konvertierung mit reduzierter Farbpalette und Qualität
        let quality = Math.min(0.99, percent / 100);  // Qualität von 0 bis 1 (100% bis 1%)

        let blob = await new Promise((r) => canvas.toBlob(r, "image/png", quality));

        if (blob.size >= file.size) {
            blob = file;  // Wenn die Qualität das Bild vergrößert, verwenden wir die Originaldatei
        }

        zipFiles.push({ name: file.name, blob });
        p.compressedImg.src = URL.createObjectURL(blob);

        const saved = 100 - (blob.size / file.size) * 100;
        p.infoDiv.textContent = `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
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
