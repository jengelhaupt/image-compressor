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
   PREPARE IMAGES
===================================================== */

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

/* =====================================================
   IMAGE PROCESSING HELPERS
===================================================== */

function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

/* ---------- Chroma Smoothing (R + B) ---------- */

function smoothChroma(ctx, w, h, strength) {

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const copy = new Uint8ClampedArray(d);

    const radius = strength > 0.25 ? 2 : 1;

    for (let y = radius; y < h - radius; y++) {
        for (let x = radius; x < w - radius; x++) {

            let sumR = 0, sumB = 0, count = 0;

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const i = ((y + dy) * w + (x + dx)) * 4;
                    sumR += copy[i];
                    sumB += copy[i + 2];
                    count++;
                }
            }

            const i = (y * w + x) * 4;
            const avgR = sumR / count;
            const avgB = sumB / count;

            d[i]     = lerp(d[i],     avgR, strength);
            d[i + 2] = lerp(d[i + 2], avgB, strength);
        }
    }

    ctx.putImageData(img, 0, 0);
}

/* ---------- Mini Unsharp Mask ---------- */

function sharpen(ctx, w, h, amount = 0.18) {

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const copy = new Uint8ClampedArray(d);

    const radius = 1;

    for (let y = radius; y < h - radius; y++) {
        for (let x = radius; x < w - radius; x++) {

            for (let c = 0; c < 3; c++) {

                let sum = 0;
                let count = 0;

                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const i = ((y + dy) * w + (x + dx)) * 4 + c;
                        sum += copy[i];
                        count++;
                    }
                }

                const i = (y * w + x) * 4 + c;
                const blur = sum / count;
                const detail = copy[i] - blur;

                d[i] = copy[i] + detail * amount;
            }
        }
    }

    ctx.putImageData(img, 0, 0);
}

/* =====================================================
   RENDER JPG
===================================================== */

async function render() {

    if (!images.length) return;

    zipFiles = [];

    const qPercent = Number(qualityInput.value);

    /* ---- Nicht-lineare Kurve ---- */
    const quality = Math.min(
        0.99,
        Math.pow(qPercent / 100, 1.6)
    );

    for (let i = 0; i < images.length; i++) {

        const { file, img } = images[i];
        const p = previewItems[i];

        /* ---- Early Skip ---- */
        if (qPercent > 85) {

            zipFiles.push({ name: file.name, blob: file });

            p.compressedImg.src = img.src;
            p.info.textContent = "Original übernommen (bereits gut optimiert)";
            p.download.href = img.src;
            p.download.download = file.name;

            continue;
        }

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0);

        /* ---- Chroma smoothing ---- */
        if (qPercent < 80) {
            const strength = Math.min(0.35, (80 - qPercent) / 100);
            smoothChroma(ctx, canvas.width, canvas.height, strength);
        }

        /* ---- Sharpen ---- */
        if (qPercent < 75) {
            sharpen(ctx, canvas.width, canvas.height, 0.18);
        }

        let blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", quality)
        );

        /* ---- Wenn größer als Original → Original behalten ---- */
        if (blob.size >= file.size * 0.98) {
            blob = file;
        }

        zipFiles.push({ name: file.name, blob });

        p.compressedImg.src = URL.createObjectURL(blob);

        const saved = 100 - (blob.size / file.size) * 100;

        p.info.textContent =
            `Original ${(file.size / 1024).toFixed(1)} KB → ` +
            `Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

        p.download.href = URL.createObjectURL(blob);
        p.download.download = file.name;
    }

    /* ---- Scroll Behaviour ---- */

    const sliderBottom =
        qualityWrapper.getBoundingClientRect().bottom + window.scrollY;

    const previewTop =
        preview.getBoundingClientRect().top + window.scrollY;

    if (previewTop > sliderBottom) {
        window.scrollTo({
            top: previewTop - qualityWrapper.offsetHeight - 40,
            behavior: "smooth"
        });
    }
}

/* =====================================================
   ZIP DOWNLOAD
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
