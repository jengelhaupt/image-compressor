const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const ACTIVE = typeof MODE !== "undefined" ? MODE : "jpg";

let files = [];
let zipFiles = [];
let originalImages = []; // Originalbilder cachen
let previewItems = [];   // Container für Preview-Elemente

/* Controls */
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

/* Slider: nur Kompression aktualisieren */
if (controlInput) {
    controlInput.oninput = () => {
        controlLabel.textContent = controlInput.value;
        render(); // nur Canvas neu komprimieren
    };
}

/* Drag & Drop */
dropzone.onclick = () => fileInput.click();
dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add("dragover"); };
dropzone.ondragleave = () => dropzone.classList.remove("dragover");

/* Upload / Drop Events */
fileInput.onchange = async e => {
    files = [...e.target.files];
    await prepareImages();
    render();
    preview.scrollIntoView({ behavior: "smooth" });
};

dropzone.ondrop = async e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    files = [...e.dataTransfer.files];
    await prepareImages();
    render();
    preview.scrollIntoView({ behavior: "smooth" });
};

// Originalbilder laden und cachen
async function prepareImages() {
    originalImages = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => resolve({ file, img });
        img.onerror = reject;
    })));

    // Preview-Container einmalig erstellen
    preview.innerHTML = "";
    previewItems = [];
    for (let i = 0; i < originalImages.length; i++) {
        const item = originalImages[i];
        const container = document.createElement("div");
        container.className = "previewItem";

        const origImg = document.createElement("img");
        origImg.src = URL.createObjectURL(item.file);

        const compressedImg = document.createElement("img"); // wird per Canvas aktualisiert
        compressedImg.dataset.index = i;

        const infoDiv = document.createElement("div");
        infoDiv.className = "info";

        const downloadLink = document.createElement("a");
        downloadLink.className = "download";
        downloadLink.download = item.file.name;

        container.appendChild(origImg);
        container.appendChild(compressedImg);
        container.appendChild(infoDiv);
        container.appendChild(downloadLink);

        preview.appendChild(container);
        previewItems.push({ container, origImg, compressedImg, infoDiv, downloadLink });
    }
}

/* PNG Quantisierung */
function quantize(ctx, w, h, colors) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const step = Math.max(1, Math.floor(256 / Math.cbrt(colors)));
    for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.floor(d[i]     / step) * step;
        d[i + 1] = Math.floor(d[i + 1] / step) * step;
        d[i + 2] = Math.floor(d[i + 2] / step) * step;
    }
    ctx.putImageData(img, 0, 0);
}

/* Render: nur Canvas-Kompression auf vorhandene Bilder */
async function render() {
    zipFiles = [];
    if (originalImages.length === 0) return;

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const previewItem = previewItems[i];

        // PDF
        if (ACTIVE === "pdf" && file.type === "application/pdf") {
            const bytes = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(bytes);
            const outBytes = await pdf.save({ useObjectStreams: true, compress: true });

            zipFiles.push({ name: file.name, blob: new Blob([outBytes]) });
            previewItem.infoDiv.innerHTML = `
                Original: ${(file.size/1024).toFixed(1)} KB<br>
                Neu: ${(outBytes.byteLength/1024).toFixed(1)} KB
                (PDF komprimiert)
            `;
            previewItem.downloadLink.href = URL.createObjectURL(new Blob([outBytes]));
            previewItem.downloadLink.download = file.name;
            continue;
        }

        // Bilder
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        let type = ACTIVE === "jpg" ? "image/jpeg" : ACTIVE === "webp" ? "image/webp" : "image/png";
        let quality = (ACTIVE === "png") ? 1 : controlInput.value / 100;
        if (ACTIVE === "png") quantize(ctx, canvas.width, canvas.height, controlInput.value);

        const blob = await new Promise(r => canvas.toBlob(r, type, quality));
        zipFiles.push({ name: file.name, blob });

        // Nur den src des bestehenden <img> aktualisieren
        previewItem.compressedImg.src = URL.createObjectURL(blob);

        const saved = 100 - (blob.size / file.size * 100);
        previewItem.infoDiv.textContent = `Original ${(file.size/1024).toFixed(1)} KB → Neu ${(blob.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

        previewItem.downloadLink.href = URL.createObjectURL(blob);
        previewItem.downloadLink.download = file.name;
    }
}

/* ZIP */
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
