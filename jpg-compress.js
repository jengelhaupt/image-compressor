const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const qualityInput = document.getElementById("jpgQ");
const qualityLabel = document.getElementById("jpgVal");
const qualityWrapper = document.getElementById("jpg");

let files = [];
let images = [];
let previewItems = [];
let zipFiles = [];

/* =========================
   QUALITY CONTROL
========================= */
qualityLabel.textContent = qualityInput.value;

// Wert live anzeigen
qualityInput.oninput = () => {
    qualityLabel.textContent = qualityInput.value;
};

// Erst rendern beim Loslassen
qualityInput.onchange = () => {
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

dropzone.ondragleave = () => {
    dropzone.classList.remove("dragover");
};

dropzone.ondrop = async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    files = [...e.dataTransfer.files];
    await prepareImages();
    await render();
};

/* =========================
   FILE INPUT
========================= */
fileInput.onchange = async (e) => {
    files = [...e.target.files];
    await prepareImages();
    await render();
};

/* =========================
   PREPARE IMAGES
========================= */
async function prepareImages() {
    images = [];
    previewItems = [];
    preview.innerHTML = "";

    for (const file of files) {
        if (!file.type.match(/jpeg/)) continue;

        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();

        images.push({ file, img });

        const container = document.createElement("div");
        container.className = "previewItem";

        const originalImg = document.createElement("img");
        originalImg.src = img.src;

        const compressedImg = document.createElement("img");

        const info = document.createElement("div");
        info.className = "info";

        const download = document.createElement("a");
        download.className = "download";
        download.textContent = "Datei herunterladen";

        container.append(originalImg, compressedImg, info, download);
        preview.appendChild(container);

        previewItems.push({ compressedImg, info, download });
    }
}

/* =========================
   RENDER JPG
========================= */
async function render() {
    if (!images.length) return;

    zipFiles = [];
    const quality = Math.min(0.99, qualityInput.value / 100);

    for (let i = 0; i < images.length; i++) {
        const { file, img } = images[i];
        const p = previewItems[i];

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        let blob = await new Promise((r) =>
            canvas.toBlob(r, "image/jpeg", quality)
        );

        if (blob.size >= file.size) blob = file;

        zipFiles.push({ name: file.name, blob });

        p.compressedImg.src = URL.createObjectURL(blob);

        const saved = 100 - (blob.size / file.size) * 100;
        p.info.textContent =
            `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

        p.download.href = URL.createObjectURL(blob);
        p.download.download = file.name;
    }

const sliderBottom =
    qualityWrapper.getBoundingClientRect().bottom + window.scrollY;

const previewTop =
    preview.getBoundingClientRect().top + window.scrollY;

if (previewTop > sliderBottom) {
    window.scrollTo({
        top: previewTop - qualityWrapper.offsetHeight - 16,
        behavior: "smooth"
    });
}

/* =========================
   ZIP DOWNLOAD
========================= */
zipBtn.onclick = async () => {
    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach((f) => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jpg-komprimiert.zip";
    a.click();
};
