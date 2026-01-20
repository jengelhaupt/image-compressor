const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const ACTIVE = typeof MODE !== "undefined" ? MODE : "jpg";

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

/* Controls */
let controlInput, controlLabel;

if (ACTIVE === "jpg") {
    controlInput = document.getElementById("jpgQ");
    controlLabel = document.getElementById("jpgVal");
}
if (ACTIVE === "png") {
    controlInput = document.getElementById("pngC");
    controlLabel = document.getElementById("pngVal");
}
if (ACTIVE === "webp") {
    controlInput = document.getElementById("webpQ");
    controlLabel = document.getElementById("webpVal");
}
if (ACTIVE === "pdf") {
    controlInput = document.getElementById("pdfQ");
    controlLabel = document.getElementById("pdfVal");
}

/* Slider */
if (controlInput) {
    controlInput.oninput = () => {
        controlLabel.textContent = controlInput.value;
        render();
    };
}

/* Drag & Drop */
dropzone.onclick = () => fileInput.click();
dropzone.ondragover = e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
};
dropzone.ondragleave = () => dropzone.classList.remove("dragover");

/* Upload */
fileInput.onchange = async e => {
    files = [...e.target.files];
    await prepareImages();
    render();
};

dropzone.ondrop = async e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    files = [...e.dataTransfer.files];
    await prepareImages();
    render();
};

/* Prepare images */
async function prepareImages() {

    // WebP-Mode: nur JPG / PNG / WebP erlauben
    if (ACTIVE === "webp") {
        files = files.filter(f =>
            f.type === "image/jpeg" ||
            f.type === "image/png" ||
            f.type === "image/webp"
        );
    }

    originalImages = await Promise.all(
        files.map(file => new Promise((resolve, reject) => {
            if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
                return reject();
            }
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
        downloadLink.textContent = "Einzeln herunterladen";
        downloadLink.download = file.name;

        container.append(origImg, compressedImg, infoDiv, downloadLink);
        preview.appendChild(container);

        previewItems.push({ origImg, compressedImg, infoDiv, downloadLink });
    });
}

/* PNG Quantisierung (unangetastet) */
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

/* Render */
async function render() {
    zipFiles = [];
    if (!originalImages.length) return;

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const ui = previewItems[i];

        /* PDF */
        if (ACTIVE === "pdf" && file.type === "application/pdf") {
            const bytes = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(bytes);
            const outBytes = await pdf.save({ useObjectStreams: true, compress: true });
            const blob = new Blob([outBytes]);

            zipFiles.push({ name: file.name, blob });
            ui.infoDiv.textContent =
                `Original ${(file.size/1024).toFixed(1)} KB → ` +
                `${(blob.size/1024).toFixed(1)} KB`;
            ui.downloadLink.href = URL.createObjectURL(blob);
            continue;
        }

        /* Images */
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const type =
            ACTIVE === "jpg"  ? "image/jpeg" :
            ACTIVE === "png"  ? "image/png"  :
            "image/webp";

        const quality = ACTIVE === "png" ? 1 : controlInput.value / 100;

        if (ACTIVE === "png") {
            quantize(ctx, canvas.width, canvas.height, controlInput.value);
        }

        let blob = await new Promise(r => canvas.toBlob(r, type, quality));

        // ✅ ZENTRALE & KORREKTE LOGIK
        // Nur übernehmen, wenn wirklich kleiner
        if (blob.size >= file.size) {
            blob = file;
        }

        const outName =
            ACTIVE === "webp"
                ? file.name.replace(/\.(jpe?g|png|webp)$/i, ".webp")
                : file.name;

        zipFiles.push({ name: outName, blob });

        ui.compressedImg.src = URL.createObjectURL(blob);
        ui.downloadLink.href = URL.createObjectURL(blob);
        ui.downloadLink.download = outName;

        if (blob === file) {
            ui.infoDiv.textContent =
                `optimal komprimiert`;
        } else {
            const saved = 100 - (blob.size / file.size * 100);
            ui.infoDiv.textContent =
                `Original ${(file.size/1024).toFixed(1)} KB → ` +
                `Neu ${(blob.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
        }
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
