/* =====================================================
   CONFIG
===================================================== */

const MAX_PIXELS = 50_000_000;   // Schutz vor Canvas-Limits / Speicherproblemen
const ENABLE_DITHER = true;      // Rauschen vergrössert die Datei meist -> ggf. auf false setzen

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

const currentLang = document.documentElement.lang
    .toLowerCase()
    .startsWith("tr") ? "tr" : "de";

const translations = {
    de: {
        download: "Datei herunterladen",
        processing: "Wird verarbeitet …",
        originalKept: "Original übernommen",
        noGain: "Keine Ersparnis – Original behalten",
        original: "Original",
        now: "Neu",
        unsupported: (n) => `Dateiformat "${n}" wird nicht unterstützt. Nur JPG erlaubt.`,
        broken: (n) => `"${n}" konnte nicht geladen werden.`,
        tooBig: (n) => `"${n}" ist zu gross (max. ${MAX_PIXELS / 1e6} Megapixel).`,
        zipName: "jpg-komprimiert.zip"
    },
    tr: {
        download: "Dosyayı indir",
        processing: "İşleniyor …",
        originalKept: "Orijinal kullanıldı",
        noGain: "Kazanç yok – orijinal korundu",
        original: "Orijinal",
        now: "Yeni",
        unsupported: (n) => `"${n}" dosya biçimi desteklenmiyor. Yalnızca JPG.`,
        broken: (n) => `"${n}" yüklenemedi.`,
        tooBig: (n) => `"${n}" çok büyük (maks. ${MAX_PIXELS / 1e6} megapiksel).`,
        zipName: "jpg-sikistirilmis.zip"
    }
};

function t(key, ...args) {
    const v = translations[currentLang][key];
    return typeof v === "function" ? v(...args) : v ?? key;
}

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

    setTimeout(() => error.remove(), 5000);
}

/* =====================================================
   STATE
===================================================== */

let files = [];
let images = [];
let previewItems = [];
let zipFiles = [];

let renderToken = 0;       // bricht veraltete Render-Läufe ab
let originalUrls = [];     // Object-URLs der Originale
let resultUrls = [];       // Object-URLs der komprimierten Bilder

function revokeAll(list) {
    list.forEach((u) => URL.revokeObjectURL(u));
    list.length = 0;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* =====================================================
   QUALITY CONTROL
===================================================== */

qualityLabel.textContent = qualityInput.value;

qualityInput.addEventListener("input", () => {
    qualityLabel.textContent = qualityInput.value;
});

qualityInput.addEventListener("change", () => render());

/* =====================================================
   DRAG & DROP / FILE INPUT
===================================================== */

async function handleFiles(list) {
    files = [...list];
    await prepareImages();
    await render({ scroll: true });
}

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
    await handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", async (e) => {
    const list = [...e.target.files];
    e.target.value = ""; // gleiche Datei kann erneut gewählt werden
    await handleFiles(list);
});

/* =====================================================
   PREPARE IMAGES
===================================================== */

async function prepareImages() {
    renderToken++;                 // laufenden Render abbrechen
    revokeAll(originalUrls);
    revokeAll(resultUrls);

    images = [];
    previewItems = [];
    zipFiles = [];
    preview.innerHTML = "";

    for (const file of files) {

        if (!file.type.match(/jpeg/)) {
            showDropzoneError(t("unsupported", file.name));
            continue;
        }

        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;

        try {
            await img.decode();
        } catch {
            URL.revokeObjectURL(url);
            showDropzoneError(t("broken", file.name));
            continue;
        }

        if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
            URL.revokeObjectURL(url);
            showDropzoneError(t("tooBig", file.name));
            continue;
        }

        originalUrls.push(url);
        images.push({ file, img });

        const container = document.createElement("div");
        container.className = "previewItem";

        const originalImg = document.createElement("img");
        originalImg.src = url;

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
   IMAGE PROCESSING HELPERS
===================================================== */

function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Separabler Box-Blur (im Innenbereich identisch zum 2D-Fenstermittel) – deutlich schneller als 2D-Fenster
function boxBlur(src, w, h, r) {
    const size = 2 * r + 1;
    const tmp = new Float64Array(w * h);
    const out = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let k = -r; k <= r; k++) {
                const xx = Math.min(w - 1, Math.max(0, x + k));
                sum += src[row + xx];
            }
            tmp[row + x] = sum / size;
        }
    }

    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let sum = 0;
            for (let k = -r; k <= r; k++) {
                const yy = Math.min(h - 1, Math.max(0, y + k));
                sum += tmp[yy * w + x];
            }
            out[y * w + x] = sum / size;
        }
    }

    return out;
}

/* =====================================================
   ROT-ADAPTIVES CHROMA SMOOTHING
===================================================== */

function smoothChromaYCbCr(ctx, w, h, strength) {

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const n = w * h;

    const radius = strength > 0.25 ? 2 : 1;

    const yArr = new Float32Array(n);
    const cbArr = new Float32Array(n);
    const crArr = new Float32Array(n);

    for (let i = 0, p = 0; p < n; i += 4, p++) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        yArr[p]  = 0.299 * r + 0.587 * g + 0.114 * b;
        cbArr[p] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
        crArr[p] =  0.5 * r - 0.418688 * g - 0.081312 * b + 128;
    }

    const cbBlur = boxBlur(cbArr, w, h, radius);
    const crBlur = boxBlur(crArr, w, h, radius);

    const redStrength = Math.min(0.6, strength * 1.8);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {

            const p = y * w + x;
            const i = p * 4;

            let cb = cbArr[p];
            let cr = crArr[p];

            // Wie bisher: Randpixel (Abstand < radius) bleiben ungeglättet
            if (x >= radius && x < w - radius && y >= radius && y < h - radius) {
                const isRed = cr > 150 && cb < 120;
                const s = isRed ? redStrength : strength;
                cb = Math.fround(cb * (1 - s) + cbBlur[p] * s);
                cr = Math.fround(cr * (1 - s) + crBlur[p] * s);
            }

            const lum = yArr[p];

            d[i]     = clamp(lum + 1.402 * (cr - 128));
            d[i + 1] = clamp(lum - 0.344136 * (cb - 128) - 0.714136 * (cr - 128));
            d[i + 2] = clamp(lum + 1.772 * (cb - 128));
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

/* =====================================================
   DITHER
===================================================== */

function addDither(ctx, w, h, amount = 0.8) {

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
        const noise = (Math.random() - 0.5) * amount;
        d[i]     = clamp(d[i] + noise);
        d[i + 1] = clamp(d[i + 1] + noise);
        d[i + 2] = clamp(d[i + 2] + noise);
    }

    ctx.putImageData(imgData, 0, 0);
}

/* =====================================================
   RENDER
===================================================== */

function formatInfo(file, blob) {
    const saved = 100 - (blob.size / file.size) * 100;
    return `${t("original")} ${(file.size / 1024).toFixed(1)} KB → ` +
           `${t("now")} ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
}

async function render({ scroll = false } = {}) {

    if (!images.length) return;

    const token = ++renderToken;

    revokeAll(resultUrls);
    zipFiles = [];

    const results = [];
    const qPercent = Number(qualityInput.value);
    const quality = Math.min(0.99, Math.pow(qPercent / 100, 1.3));

    for (let i = 0; i < images.length; i++) {

        const { file, img } = images[i];
        const p = previewItems[i];

        p.info.textContent = t("processing");
        await nextFrame(); // UI bleibt bedienbar
        if (token !== renderToken) return;

        if (qPercent > 99) {
            results.push({ name: file.name, blob: file });
            p.compressedImg.src = img.src;
            p.info.textContent = t("originalKept");
            p.download.href = img.src;
            p.download.download = file.name;
            continue;
        }

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0);

        if (qPercent < 80) {
            const strength = Math.min(0.4, (80 - qPercent) / 90);
            smoothChromaYCbCr(ctx, canvas.width, canvas.height, strength);
        }

        if (ENABLE_DITHER && qPercent < 75) {
            addDither(ctx, canvas.width, canvas.height, 0.8);
        }

        let blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", quality)
        );

        // Canvas-Speicher freigeben
        canvas.width = canvas.height = 0;

        if (token !== renderToken) return;

        let kept = false;
        if (!blob || blob.size >= file.size * 0.98) {
            blob = file;
            kept = true;
        }

        results.push({ name: file.name, blob });

        const url = URL.createObjectURL(blob);
        resultUrls.push(url);

        p.compressedImg.src = url;
        p.info.textContent = kept ? t("noGain") : formatInfo(file, blob);
        p.download.href = url;
        p.download.download = file.name;
    }

    zipFiles = results;

    // Nur nach neuem Upload scrollen, nicht bei jeder Slider-Änderung
    if (scroll) {
        preview.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

/* =====================================================
   ZIP
===================================================== */

function uniqueName(name, used) {
    if (!used.has(name)) { used.add(name); return name; }
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let n = 2;
    while (used.has(`${base}-${n}${ext}`)) n++;
    const result = `${base}-${n}${ext}`;
    used.add(result);
    return result;
}

zipBtn.addEventListener("click", async () => {

    if (!zipFiles.length || typeof JSZip === "undefined") return;

    const zip = new JSZip();
    const used = new Set();
    zipFiles.forEach((f) => zip.file(uniqueName(f.name, used), f.blob));

    const blob = await zip.generateAsync({ type: "blob" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t("zipName");
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 10000);
});
