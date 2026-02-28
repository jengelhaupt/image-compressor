/* =====================================================
   WORKER SETUP
===================================================== */

// WICHTIG: worker.js darf NICHT im HTML eingebunden sein
let worker;
let isRendering = false;

function createWorker() {
    if (worker) worker.terminate();
    worker = new Worker("worker.js");
}

createWorker();

/* =====================================================
   ELEMENTS
===================================================== */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const qualityInput = document.getElementById("jpgQ");
const qualityLabel = document.getElementById("jpgVal");

/* =====================================================
   LANGUAGE
===================================================== */

let currentLang = document.documentElement.lang
    ?.toLowerCase()
    .startsWith("tr") ? "tr" : "de";

const translations = {
    de: {
        download: "Datei herunterladen",
        original: "Original übernommen",
        errorType: "Nur JPG Dateien erlaubt.",
        zipName: "jpg-komprimiert.zip"
    },
    tr: {
        download: "Dosyayı indir",
        original: "Orijinal kullanıldı",
        errorType: "Sadece JPG dosyaları desteklenir.",
        zipName: "jpg-sikistirilmis.zip"
    }
};

function t(key) {
    return translations[currentLang][key] || key;
}

/* =====================================================
   STATE
===================================================== */

let files = [];
let previewItems = [];
let zipFiles = [];

/* =====================================================
   DROPZONE ERROR
===================================================== */

function showDropzoneError(message) {

    const oldError = dropzone.querySelector(".dz-error");
    if (oldError) oldError.remove();

    const error = document.createElement("div");
    error.className = "dz-error";
    error.textContent = message;

    dropzone.appendChild(error);

    setTimeout(() => error.remove(), 5000);
}

/* =====================================================
   QUALITY CONTROL
===================================================== */

qualityLabel.textContent = qualityInput.value;

qualityInput.oninput = () => {
    qualityLabel.textContent = qualityInput.value;
};

qualityInput.onchange = async () => {

    if (!files.length) return;

    createWorker(); // Worker neu starten
    await render();
};

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
    await preparePreview();
    await render();
};

/* =====================================================
   FILE INPUT
===================================================== */

fileInput.onchange = async (e) => {
    files = [...e.target.files];
    await preparePreview();
    await render();
};

/* =====================================================
   PREPARE PREVIEW
===================================================== */

async function preparePreview() {

    previewItems.forEach(p => {
        if (p.compressedImg.src?.startsWith("blob:")) {
            URL.revokeObjectURL(p.compressedImg.src);
        }
    });

    previewItems = [];
    zipFiles = [];
    preview.innerHTML = "";

    for (const file of files) {

        if (!file.type.match(/jpeg/)) {
            showDropzoneError(t("errorType"));
            continue;
        }

        const container = document.createElement("div");
        container.className = "previewItem";

        const originalImg = document.createElement("img");
        originalImg.src = URL.createObjectURL(file);

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
   WORKER WRAPPER
===================================================== */

function processWithWorker(file, quality) {

    return new Promise((resolve) => {

        const handleMessage = (e) => {
            worker.removeEventListener("message", handleMessage);
            resolve(e.data);
        };

        worker.addEventListener("message", handleMessage);

        worker.postMessage({
            file,
            quality
        });
    });
}

/* =====================================================
   RENDER
===================================================== */

async function render() {

    if (!files.length || isRendering) return;
    isRendering = true;

    zipFiles = [];

    const qPercent = Number(qualityInput.value);

    for (let i = 0; i < files.length; i++) {

        const file = files[i];
        const p = previewItems[i];
        if (!p) continue;

        if (p.compressedImg.src?.startsWith("blob:")) {
            URL.revokeObjectURL(p.compressedImg.src);
        }

        const result = await processWithWorker(file, qPercent);
        if (!result) continue;

        const { blob } = result;
        if (!blob) continue;

        zipFiles.push({ name: file.name, blob });

        const blobURL = URL.createObjectURL(blob);

        p.compressedImg.src = blobURL;
        p.download.href = blobURL;
        p.download.download = file.name;

        const saved = 100 - (blob.size / file.size) * 100;

        p.info.textContent =
            `Original ${(file.size / 1024).toFixed(1)} KB → ` +
            `Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
    }

    isRendering = false;

    preview.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

/* =====================================================
   ZIP
===================================================== */

zipBtn.onclick = async () => {

    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach(f => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = t("zipName");
    a.click();
};
