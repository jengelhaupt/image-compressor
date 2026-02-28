/* =====================================================
   ELEMENTS
===================================================== */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const qualityInput = document.getElementById("jpgQ");
const qualityLabel = document.getElementById("jpgVal");
const qualityWrapper = document.getElementById("jpg");

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
   QUALITY CONTROL
===================================================== */

qualityLabel.textContent = qualityInput.value;

qualityInput.oninput = () => {
    qualityLabel.textContent = qualityInput.value;
};

qualityInput.onchange = () => {
    render();
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

/* =====================================================
   LANGUAGE
===================================================== */

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

/* =====================================================
   PREPARE IMAGES
===================================================== */

async function prepareImages() {
    images = [];
    previewItems = [];
    preview.innerHTML = "";

    for (const file of files) {

        if (!file.type.match(/jpeg/)) {
            showDropzoneError(`Dateiformat "${file.name}" wird nicht unterstützt. Nur JPG erlaubt.`);
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
   RENDER
===================================================== */

const worker = new Worker("https://free-img-compressor.de/js/jpg-worker.js"); // Worker lokal
const workerPromises = new Map();

worker.onmessage = (e) => {
    if (e.data.type === "error") {
        console.error("Worker-Fehler:", e.data.message, e.data.stack);
        return;
    }

    const { id, blob } = e.data;
    const resolve = workerPromises.get(id);
    if (resolve) {
        resolve(blob);
        workerPromises.delete(id);
    }
};

async function render() {
    if (!images.length) return;

    zipFiles = [];
    const qPercent = Number(qualityInput.value);
    const quality = Math.min(0.99, Math.pow(qPercent / 100, 1.3));

    const tasks = images.map(async ({ file, img }, i) => {
        const p = previewItems[i];

        if (qPercent > 99) {
            zipFiles.push({ name: file.name, blob: file });
            p.compressedImg.src = img.src;
            p.info.textContent = "Original übernommen";
            p.download.href = img.src;
            p.download.download = file.name;
            return;
        }

        // Canvas erzeugen
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const id = crypto.randomUUID();
        const promise = new Promise(res => workerPromises.set(id, res));

        // ImageData als ArrayBuffer an Worker schicken (Transferable)
        worker.postMessage({
            id,
            width: imgData.width,
            height: imgData.height,
            data: imgData.data.buffer,
            quality,
            qPercent
        }, [imgData.data.buffer]);

        let blob = await promise;
        if (blob.size >= file.size * 0.98) blob = file;

        zipFiles.push({ name: file.name, blob });

        p.compressedImg.src = URL.createObjectURL(blob);
        const saved = 100 - (blob.size / file.size) * 100;
        p.info.textContent = `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
        p.download.href = URL.createObjectURL(blob);
        p.download.download = file.name;
    });

    await Promise.all(tasks);

    // Scroll zur Vorschau
    preview.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* =====================================================
   ZIP
===================================================== */

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
