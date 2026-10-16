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
        waiting: "Wartet …",
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
        waiting: "Bekliyor …",
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
   PROGRESS BAR (Styles + Helper)
===================================================== */

(function injectProgressStyles() {
    if (document.getElementById("pg-styles")) return;
    const st = document.createElement("style");
    st.id = "pg-styles";
    st.textContent = `
        .pg-progress{display:none;margin:6px 0}
        .pg-progress.active{display:block}
        .pg-track{height:8px;border-radius:999px;background:rgba(128,128,128,.25);overflow:hidden}
        .pg-bar{height:100%;width:0;border-radius:999px;background:var(--progress-color,#2563eb);transition:width .15s linear}
        .pg-label{font-size:.85em;margin-top:4px;opacity:.85}
        .previewItem.pg-busy .pg-compressed{opacity:.45;transition:opacity .2s}
    `;
    document.head.appendChild(st);
})();

const fmtPct = (n) => currentLang === "tr" ? `%${n}` : `${n} %`;

function setProgress(p, frac, text) {
    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    p.bar.style.width = pct + "%";
    p.progress.setAttribute("aria-valuenow", String(pct));
    p.label.textContent = `${text ?? t("processing")} ${fmtPct(pct)}`;
}

function showProgress(p, on) {
    p.progress.classList.toggle("active", on);
    p.container.classList.toggle("pg-busy", on);
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

// Gibt dem Browser Zeit zum Zeichnen (mit Fallback, falls der Tab im Hintergrund ist)
const paintYield = () => new Promise((r) => {
    requestAnimationFrame(() => r());
    setTimeout(r, 100);
});

// Schneller Yield ohne Throttling
const yieldChannel = new MessageChannel();
const yieldToUI = () => new Promise((r) => {
    yieldChannel.port1.onmessage = () => r();
    yieldChannel.port2.postMessage(0);
});

const CANCELLED = Symbol("cancelled");
let lastYield = 0;

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
        compressedImg.className = "pg-compressed";

        const info = document.createElement("div");
        info.className = "info";

        const progress = document.createElement("div");
        progress.className = "pg-progress";
        progress.setAttribute("role", "progressbar");
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", "100");
        progress.setAttribute("aria-valuenow", "0");

        const track = document.createElement("div");
        track.className = "pg-track";
        const bar = document.createElement("div");
        bar.className = "pg-bar";
        track.appendChild(bar);

        const label = document.createElement("div");
        label.className = "pg-label";

        progress.append(track, label);

        const infoText = document.createElement("span");
        info.append(progress, infoText);

        const download = document.createElement("a");
        download.className = "download";
        download.textContent = t("download");

        container.append(originalImg, compressedImg, info, download);
        preview.appendChild(container);

        previewItems.push({ container, compressedImg, info, infoText, progress, bar, label, download });
    }
}

/* =====================================================
   IMAGE PROCESSING HELPERS
===================================================== */

function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Separabler Box-Blur (im Innenbereich identisch zum 2D-Fenstermittel)
// tick(f): meldet Fortschritt 0..1 und gibt dem Browser zwischendurch Luft
async function boxBlur(src, w, h, r, tick) {
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
        await tick(0.5 * (y / h));
    }

    // Vertikal zeilenweise (cache-freundlich), Summationsreihenfolge je Pixel unverändert
    const acc = new Float64Array(w);
    for (let y = 0; y < h; y++) {
        acc.fill(0);
        for (let k = -r; k <= r; k++) {
            const base = Math.min(h - 1, Math.max(0, y + k)) * w;
            for (let x = 0; x < w; x++) acc[x] += tmp[base + x];
        }
        const row = y * w;
        for (let x = 0; x < w; x++) out[row + x] = acc[x] / size;
        await tick(0.5 + 0.5 * (y / h));
    }

    return out;
}

/* =====================================================
   ROT-ADAPTIVES CHROMA SMOOTHING
===================================================== */

async function smoothChromaYCbCr(ctx, w, h, strength, tick) {

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const n = w * h;

    const radius = strength > 0.25 ? 2 : 1;

    const yArr = new Float32Array(n);
    const cbArr = new Float32Array(n);
    const crArr = new Float32Array(n);

    for (let y = 0; y < h; y++) {
        for (let x = 0, p = y * w, i = p * 4; x < w; x++, p++, i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            yArr[p]  = 0.299 * r + 0.587 * g + 0.114 * b;
            cbArr[p] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
            crArr[p] =  0.5 * r - 0.418688 * g - 0.081312 * b + 128;
        }
        await tick(0.1 * (y / h));
    }

    const cbBlur = await boxBlur(cbArr, w, h, radius, (f) => tick(0.1 + 0.3 * f));
    const crBlur = await boxBlur(crArr, w, h, radius, (f) => tick(0.4 + 0.3 * f));

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
        await tick(0.7 + 0.3 * (y / h));
    }

    ctx.putImageData(imgData, 0, 0);
}

/* =====================================================
   DITHER
===================================================== */

async function addDither(ctx, w, h, amount, tick) {

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const rowLen = w * 4;

    for (let y = 0; y < h; y++) {
        const end = (y + 1) * rowLen;
        for (let i = y * rowLen; i < end; i += 4) {
            const noise = (Math.random() - 0.5) * amount;
            d[i]     = clamp(d[i] + noise);
            d[i + 1] = clamp(d[i + 1] + noise);
            d[i + 2] = clamp(d[i + 2] + noise);
        }
        await tick(y / h);
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

// toBlob liefert keinen Fortschritt -> weiche Annäherung bis zum Ergebnis
function encodeWithProgress(canvas, quality, onFrac) {
    return new Promise((resolve) => {
        let f = 0;
        const timer = setInterval(() => {
            f += (0.95 - f) * 0.08;
            onFrac(f);
        }, 100);
        canvas.toBlob((b) => {
            clearInterval(timer);
            resolve(b);
        }, "image/jpeg", quality);
    });
}

async function render({ scroll = false } = {}) {

    if (!images.length) return;

    const token = ++renderToken;
    const cancelled = () => token !== renderToken;

    revokeAll(resultUrls);
    zipFiles = [];

    const results = [];
    const qPercent = Number(qualityInput.value);
    const quality = Math.min(0.99, Math.pow(qPercent / 100, 1.3));

    // Alle Bilder zunächst als "wartend" markieren
    previewItems.forEach((p) => {
        p.infoText.textContent = "";
        setProgress(p, 0, t("waiting"));
        showProgress(p, true);
    });

    // Fortschritt-Mapper: f (0..1) -> Bereich [lo, hi] des Gesamtbalkens, mit Yield im Zeitraster
    const makeTick = (p, lo, hi) => async (f) => {
        const now = performance.now();
        if (now - lastYield < 30) return;
        setProgress(p, lo + (hi - lo) * f);
        await yieldToUI();
        lastYield = performance.now();
        if (cancelled()) throw CANCELLED;
    };

    try {
        for (let i = 0; i < images.length; i++) {

            const { file, img } = images[i];
            const p = previewItems[i];

            setProgress(p, 0.02);
            await paintYield();
            if (cancelled()) return;
            lastYield = performance.now();

            if (qPercent > 99) {
                results.push({ name: file.name, blob: file });
                p.compressedImg.src = img.src;
                p.infoText.textContent = t("originalKept");
                p.download.href = img.src;
                p.download.download = file.name;
                showProgress(p, false);
                continue;
            }

            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");

            ctx.drawImage(img, 0, 0);

            // Fortschrittsbereiche der einzelnen Schritte
            let pos = 0.05;
            const take = (wgt) => { const r = [pos, pos + wgt]; pos += wgt; return r; };

            const doSmooth = qPercent < 80;
            const doDither = ENABLE_DITHER && qPercent < 75;

            if (doSmooth) {
                const [lo, hi] = take(0.5);
                const strength = Math.min(0.4, (80 - qPercent) / 90);
                await smoothChromaYCbCr(ctx, canvas.width, canvas.height, strength, makeTick(p, lo, hi));
            }

            if (doDither) {
                const [lo, hi] = take(0.1);
                await addDither(ctx, canvas.width, canvas.height, 0.8, makeTick(p, lo, hi));
            }

            const encLo = pos;
            const encHi = 0.98;
            setProgress(p, encLo);

            let blob = await encodeWithProgress(canvas, quality, (f) =>
                setProgress(p, encLo + (encHi - encLo) * f)
            );

            // Canvas-Speicher freigeben
            canvas.width = canvas.height = 0;

            if (cancelled()) return;

            let kept = false;
            if (!blob || blob.size >= file.size * 0.98) {
                blob = file;
                kept = true;
            }

            results.push({ name: file.name, blob });

            const url = URL.createObjectURL(blob);
            resultUrls.push(url);

            setProgress(p, 1);

            p.compressedImg.src = url;
            p.infoText.textContent = kept ? t("noGain") : formatInfo(file, blob);
            p.download.href = url;
            p.download.download = file.name;

            showProgress(p, false);
        }
    } catch (e) {
        if (e === CANCELLED) return;
        throw e;
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
