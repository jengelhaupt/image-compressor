/* =====================================================
   ELEMENTS
===================================================== */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

/* =====================================================
   DROPZONE ERROR MESSAGE
===================================================== */

function showDropzoneError(message) {

    const oldError = dropzone.querySelector(".dz-error");
    if (oldError) oldError.remove();

    const error = document.createElement("div");
    error.className = "dz-error";
    error.textContent = message;

    dropzone.appendChild(error);
   
    dropzone.classList.remove("flash"); 
    void dropzone.offsetWidth; 
    dropzone.classList.add("flash");

    setTimeout(() => {
        error.remove();
    }, 5000);
}

/* =====================================================
   STATE
===================================================== */

let files = [];
let images = [];
let previewItems = [];
let zipFiles = [];

/* =====================================================
   DRAG & DROP
===================================================== */

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

/* =====================================================
   FILE INPUT
===================================================== */

fileInput.onchange = async (e) => {
    files = [...e.target.files];
    await prepareImages();
    await render();
};

/* =========================
   LANGUAGE
========================= */

let currentLang = document.documentElement.lang
    .toLowerCase()
    .startsWith("tr") ? "tr" : "de";

const translations = {
    de: { download: "Datei herunterladen" },
    tr: { download: "Dosyayı indir" }
};

function t(key) {
    return translations[currentLang][key] || key;
}

function updateDownloadButtons() {
    document.querySelectorAll(".download").forEach(btn => {
        btn.textContent = t("download");
    });
}

/* =====================================================
   PREPARE IMAGES
===================================================== */

async function prepareImages() {

    images = [];
    previewItems = [];
    preview.innerHTML = "";

    for (const file of files) {

        if (!file.type.match(/jpeg/)) {
            showDropzoneError(`"${file.name}" → Nur JPG erlaubt.`);
            continue;
        }

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
        download.textContent = t("download");

        container.append(originalImg, compressedImg, info, download);
        preview.appendChild(container);

        previewItems.push({ compressedImg, info, download });
    }
}

/* =====================================================
   SMART COMPRESSION (≤100KB)
===================================================== */

async function compressTo100KB(img) {

    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");

    let width = img.width;
    let height = img.height;

    let quality = 0.9;

    while (true) {

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, "image/jpeg", quality)
        );

        if (blob.size <= 100 * 1024) {
            return blob;
        }

        // 1. Qualität reduzieren
        if (quality > 0.4) {
            quality *= 0.8;
        }
        // 2. Wenn Qualität schon niedrig → Bild verkleinern
        else {
            width *= 0.85;
            height *= 0.85;
        }

        // Sicherheitsbremse
        if (width < 300 || height < 300) {
            return blob;
        }
    }
}

/* =====================================================
   RENDER
===================================================== */

async function render() {

    if (!images.length) return;

    zipFiles = [];

    for (let i = 0; i < images.length; i++) {

        const { file, img } = images[i];
        const p = previewItems[i];

        const blob = await compressTo100KB(img);

        zipFiles.push({ name: file.name, blob });

        const url = URL.createObjectURL(blob);

        p.compressedImg.src = url;

        const saved = 100 - (blob.size / file.size) * 100;

        p.info.textContent =
            `Original ${(file.size / 1024).toFixed(1)} KB → ` +
            `Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

        p.download.href = url;
        p.download.download = file.name;
    }
}

/* =====================================================
   ZIP DOWNLOAD
===================================================== */

zipBtn.onclick = async () => {

    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach(f => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jpg-unter-100kb.zip";
    a.click();
};
