/* =====================================================
   MOZJPEG (Squoosh WASM)
===================================================== */

import { ImagePool } from "https://unpkg.com/@squoosh/lib@0.4.0/build/index.js";

const imagePool = new ImagePool(navigator.hardwareConcurrency || 4);

/* 🔥 Preload MozJPEG (verhindert ersten Lag) */
async function preloadMozJPEG() {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(1, 1);
    const image = imagePool.ingestImage(imageData);
    await image.encode({ mozjpeg: { quality: 75 } });
    console.log("MozJPEG vorgeladen ✅");
}

preloadMozJPEG();

/* MozJPEG Encode */
async function encodeMozJPEG(canvas, qualityPercent) {

    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;

    const imageData = ctx.getImageData(0, 0, width, height);
    const image = imagePool.ingestImage(imageData);

    await image.encode({
        mozjpeg: {
            quality: qualityPercent,
            progressive: true,
            trellis: true,
            trellisDC: true,
            optimizeCoding: true,
            quantTable: 3,
            chromaSubsampling: "4:4:4"
        }
    });

    const { binary } = await image.encodedWith.mozjpeg;

    return new Blob([binary], { type: "image/jpeg" });
}

/* =====================================================
   GLOBAL DRAG BLOCK (WICHTIG!)
===================================================== */

["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
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

dropzone.addEventListener("dragover", () => {
    dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", async (e) => {
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
   OPTIONAL DITHER (gegen Banding)
===================================================== */

function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

function addDither(ctx, w, h, amount = 0.6) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
        const noise = (Math.random() - 0.5) * amount;
        d[i]     = clamp(d[i] + noise);
        d[i + 1] = clamp(d[i + 1] + noise);
        d[i + 2] = clamp(d[i + 2] + noise);
    }

    ctx.putImageData(img, 0, 0);
}

/* =====================================================
   RENDER (MOZJPEG)
===================================================== */

async function render() {

    if (!images.length) return;

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

        if (qPercent < 75) {
            addDither(ctx, canvas.width, canvas.height, 0.6);
        }

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
