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

/* =========================
   LANGUAGE
========================= */

// Aktuelle Sprache (z.B. "de" oder "tr")
let currentLang = navigator.language.startsWith("tr") ? "tr" : "de";

// Übersetzungen
const translations = {
    de: {
        download: "Datei herunterladen"
    },
    tr: {
        download: "Dosyayı indir"
    }
};

// Übersetzungsfunktion
function t(key) {
    return translations[currentLang][key] || key;
}

// Optional: Sprache ändern
function setLanguage(lang) {
    currentLang = lang;
    updateDownloadButtons();
}

// Aktualisiert alle Download-Buttons
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
        download.textContent = t("download");

        container.append(originalImg, compressedImg, info, download);
        preview.appendChild(container);

        previewItems.push({ compressedImg, info, download });
    }
}

/* =====================================================
   IMAGE PROCESSING HELPERS (PRO VERSION)
===================================================== */

function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

/* ---------- RGB <-> YCbCr ---------- */

function rgbToYCbCr(r, g, b) {
    return {
        y:  0.299 * r + 0.587 * g + 0.114 * b,
        cb: -0.168736 * r - 0.331264 * g + 0.5 * b + 128,
        cr:  0.5 * r - 0.418688 * g - 0.081312 * b + 128
    };
}

function yCbCrToRgb(y, cb, cr) {
    return {
        r: clamp(y + 1.402 * (cr - 128)),
        g: clamp(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)),
        b: clamp(y + 1.772 * (cb - 128))
    };
}

/* =====================================================
   CHROMA ONLY SMOOTHING
===================================================== */

function smoothChromaYCbCr(ctx, w, h, strength) {

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    const radius = strength > 0.25 ? 2 : 1;

    const yArr = new Float32Array(w * h);
    const cbArr = new Float32Array(w * h);
    const crArr = new Float32Array(w * h);

    // RGB → YCbCr
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const { y, cb, cr } = rgbToYCbCr(d[i], d[i + 1], d[i + 2]);
        yArr[p] = y;
        cbArr[p] = cb;
        crArr[p] = cr;
    }

    const cbCopy = new Float32Array(cbArr);
    const crCopy = new Float32Array(crArr);

    // Blur nur Cb / Cr
    for (let y = radius; y < h - radius; y++) {
        for (let x = radius; x < w - radius; x++) {

            let sumCb = 0, sumCr = 0, count = 0;

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const idx = (y + dy) * w + (x + dx);
                    sumCb += cbCopy[idx];
                    sumCr += crCopy[idx];
                    count++;
                }
            }

            const i = y * w + x;
            cbArr[i] = cbCopy[i] * (1 - strength) + (sumCb / count) * strength;
            crArr[i] = crCopy[i] * (1 - strength) + (sumCr / count) * strength;
        }
    }

    // Zurück nach RGB (Y bleibt unangetastet)
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const { r, g, b } = yCbCrToRgb(yArr[p], cbArr[p], crArr[p]);
        d[i]     = r;
        d[i + 1] = g;
        d[i + 2] = b;
    }

    ctx.putImageData(img, 0, 0);
}

/* =====================================================
   EDGE-ADAPTIVE SHARPEN
===================================================== */

function sharpenEdges(ctx, w, h, amount = 0.22, threshold = 6) {

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const copy = new Uint8ClampedArray(d);

    const radius = 1;

    for (let y = radius; y < h - radius; y++) {
        for (let x = radius; x < w - radius; x++) {

            for (let c = 0; c < 3; c++) {

                let sum = 0, count = 0;

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

                if (Math.abs(detail) > threshold) {
                    d[i] = clamp(copy[i] + detail * amount);
                }
            }
        }
    }

    ctx.putImageData(img, 0, 0);
}

/* =====================================================
   RENDER
===================================================== */

async function render() {

    if (!images.length) return;

    zipFiles = [];

    const qPercent = Number(qualityInput.value);

    const quality = Math.min(
        0.99,
        Math.pow(qPercent / 100, 1.6)
    );

    for (let i = 0; i < images.length; i++) {

        const { file, img } = images[i];
        const p = previewItems[i];

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

        if (qPercent < 80) {
            const strength = Math.min(0.4, (80 - qPercent) / 90);
            smoothChromaYCbCr(ctx, canvas.width, canvas.height, strength);
        }

        if (qPercent < 49) {
            sharpenEdges(ctx, canvas.width, canvas.height, 0.22, 6);
        }

        let blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", quality)
        );

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
