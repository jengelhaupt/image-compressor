/* =====================================================
   GLOBAL DRAG BLOCK (verhindert Browser-Öffnen)
===================================================== */

["dragover", "drop"].forEach(eventName => {
    document.addEventListener(eventName, (e) => {
        if (!e.target.closest("#dropzone")) {
            e.preventDefault();
        }
    });
});

/* =====================================================
   MOZJPEG WASM INIT
===================================================== */

let mozjpeg = null;
let mozjpegReady = false;

MozJPEG().then((module) => {
    mozjpeg = module;
    mozjpegReady = true;
    console.log("MozJPEG geladen ✅");
});

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

qualityInput.addEventListener("input", () => {
    qualityLabel.textContent = qualityInput.value;
});

qualityInput.addEventListener("change", () => {
    render();
});

/* =====================================================
   DRAG & DROP
===================================================== */

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    files = [...e.dataTransfer.files];
    await prepareImages();
    await render();
});

fileInput.addEventListener("change", async (e) => {
    files = [...e.target.files];
    await prepareImages();
    await render();
});

/* =====================================================
   PREPARE IMAGES
===================================================== */

async function prepareImages() {

    images = [];
    previewItems = [];
    preview.innerHTML = "";

    for (const file of files) {

        if (!/image\/jpe?g/.test(file.type)) continue;

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
        download.textContent = "Download";

        container.append(originalImg, compressedImg, info, download);
        preview.appendChild(container);

        previewItems.push({ compressedImg, info, download });
    }
}

/* =====================================================
   MOZJPEG ENCODE
===================================================== */

async function encodeMozJPEG(canvas, quality) {

    if (!mozjpegReady) {
        throw new Error("MozJPEG noch nicht geladen");
    }

    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);

    const result = mozjpeg.encode(
        imageData.data,
        width,
        height,
        {
            quality: quality,
            progressive: true,
            optimize_coding: true
        }
    );

    return new Blob([result], { type: "image/jpeg" });
}

/* =====================================================
   RENDER
===================================================== */

async function render() {

    if (!images.length) return;

    if (!mozjpegReady) {
        alert("MozJPEG lädt noch… bitte kurz warten.");
        return;
    }

    zipFiles = [];

    const qPercent = Number(qualityInput.value);

    for (let i = 0; i < images.length; i++) {

        const { file, img } = images[i];
        const p = previewItems[i];

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const blob = await encodeMozJPEG(canvas, qPercent);

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

    preview.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

/* =====================================================
   ZIP DOWNLOAD
===================================================== */

zipBtn.addEventListener("click", async () => {

    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach((f) => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jpg-komprimiert.zip";
    a.click();
});
