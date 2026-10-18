/* =====================================================
   CONFIG
===================================================== */

const MAX_PIXELS = 30_000_000;   // Schutz vor Speicherproblemen (Quantisierung ist speicherhungrig)
const MIN_GAIN = 0.98;           // Ergebnis muss mind. 2 % kleiner sein, sonst bleibt das Original

/* =====================================================
   ELEMENTS
===================================================== */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const qualityWrapper = document.getElementById("png");
const controlInput = document.getElementById("pngC");
const controlLabel = document.getElementById("pngVal");

/* =====================================================
   STATE
===================================================== */

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

let renderToken = 0;       // bricht veraltete Render-Läufe ab
let originalUrls = [];     // Object-URLs der Originale
let resultUrls = [];       // Object-URLs der komprimierten Bilder

function revokeAll(list) {
    list.forEach((u) => URL.revokeObjectURL(u));
    list.length = 0;
}

/* =====================================================
   LANGUAGE
===================================================== */

let currentLang = document.documentElement.lang
    .toLowerCase()
    .startsWith("tr") ? "tr" : "de";

const kb = (n) => (n / 1024).toFixed(1);

const translations = {
    de: {
        download: "Datei herunterladen",
        processing: "Wird verarbeitet …",
        waiting: "Wartet …",
        unsupported: (n) => `Dateiformat "${n}" wird nicht unterstützt. Nur PNG erlaubt.`,
        animated: (n) => `"${n}" ist ein animiertes PNG (APNG) und wird übersprungen, damit die Animation nicht verloren geht.`,
        broken: (n) => `"${n}" konnte nicht geladen werden.`,
        tooBig: (n) => `"${n}" ist zu gross (max. ${MAX_PIXELS / 1e6} Megapixel).`,
        original100: (s) => `Original ${kb(s)} KB (unverändert)`,
        result: (o, n, saved, lossless) =>
            `Original ${kb(o)} KB → Neu ${kb(n)} KB (${saved.toFixed(1)}%)` +
            (lossless ? " · verlustfrei" : ""),
        noGain: "Keine Ersparnis – Original behalten",
        error: "Fehler bei der Verarbeitung – Original behalten",
        zipName: "png-komprimiert.zip"
    },
    tr: {
        download: "Dosyayı indir",
        processing: "İşleniyor …",
        waiting: "Bekliyor …",
        unsupported: (n) => `"${n}" dosya biçimi desteklenmiyor. Yalnızca PNG.`,
        animated: (n) => `"${n}" animasyonlu bir PNG (APNG); animasyon kaybolmasın diye atlandı.`,
        broken: (n) => `"${n}" yüklenemedi.`,
        tooBig: (n) => `"${n}" çok büyük (maks. ${MAX_PIXELS / 1e6} megapiksel).`,
        original100: (s) => `Orijinal ${kb(s)} KB (değiştirilmedi)`,
        result: (o, n, saved, lossless) =>
            `Orijinal ${kb(o)} KB → Yeni ${kb(n)} KB (${saved.toFixed(1)}%)` +
            (lossless ? " · kayıpsız" : ""),
        noGain: "Kazanç yok – orijinal korundu",
        error: "İşleme hatası – orijinal korundu",
        zipName: "png-sikistirilmis.zip"
    }
};

function t(key, ...args) {
    const v = translations[currentLang][key];
    return typeof v === "function" ? v(...args) : v ?? key;
}

function setLanguage(lang) {
    currentLang = lang === "tr" ? "tr" : "de";
    updateDownloadButtons();
    previewItems.forEach(renderInfo);
}

function updateDownloadButtons() {
    document.querySelectorAll(".download").forEach((btn) => {
        btn.textContent = t("download");
    });
}

// Info-Text aus gespeichertem Zustand aufbauen (damit Sprachwechsel funktioniert)
function renderInfo(p) {
    const i = p.info;
    if (!i) { p.infoText.textContent = ""; return; }

    switch (i.type) {
        case "original100": p.infoText.textContent = t("original100", i.size); break;
        case "result":      p.infoText.textContent = t("result", i.orig, i.neu, i.saved, i.lossless); break;
        case "noGain":      p.infoText.textContent = t("noGain"); break;
        case "error":       p.infoText.textContent = t("error"); break;
    }
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
        .pg-track{position:relative;height:8px;border-radius:999px;background:rgba(128,128,128,.25);overflow:hidden}
        .pg-bar{height:100%;width:0;border-radius:999px;background:var(--progress-color,#2563eb);transition:width .15s linear}
        .pg-shimmer{position:absolute;top:0;left:0;height:100%;width:40%;will-change:transform;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);
            animation:pg-shimmer 1.2s linear infinite}
        @keyframes pg-shimmer{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
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

// Gibt dem Browser Zeit zum Zeichnen (mit Fallback, falls der Tab im Hintergrund ist)
const paintYield = () => new Promise((r) => {
    requestAnimationFrame(() => r());
    setTimeout(r, 100);
});

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
   CONTROL (QUALITY 1–100)
===================================================== */

controlLabel.textContent = controlInput.value + "%";

controlInput.addEventListener("input", () => {
    controlLabel.textContent = controlInput.value + "%";
});

// Render erst beim Loslassen
controlInput.addEventListener("change", () => render());

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
   PNG PRÜFUNG (Signatur + Animation)
===================================================== */

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

// Prüft den echten Dateiinhalt (nicht nur die Endung) und erkennt animierte PNGs (APNG)
async function inspectPng(file) {
    const sig = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (sig.length < 8 || PNG_SIGNATURE.some((b, i) => sig[i] !== b)) {
        return { valid: false, animated: false };
    }

    let off = 8;
    while (off + 8 <= file.size) {
        const hdr = new DataView(await file.slice(off, off + 8).arrayBuffer());
        const len = hdr.getUint32(0);
        const type = String.fromCharCode(
            hdr.getUint8(4), hdr.getUint8(5), hdr.getUint8(6), hdr.getUint8(7)
        );
        if (type === "acTL") return { valid: true, animated: true };
        if (type === "IDAT" || type === "IEND") break;
        off += 12 + len;
    }

    return { valid: true, animated: false };
}

/* =====================================================
   PREPARE IMAGES
===================================================== */

async function prepareImages() {
    renderToken++;                 // laufenden Render abbrechen
    revokeAll(originalUrls);
    revokeAll(resultUrls);

    originalImages = [];
    previewItems = [];
    zipFiles = [];
    preview.innerHTML = "";

    for (const file of files) {

        if (file.type !== "image/png") {
            showDropzoneError(t("unsupported", file.name));
            continue;
        }

        let check;
        try {
            check = await inspectPng(file);
        } catch {
            check = { valid: false, animated: false };
        }

        if (!check.valid) {
            showDropzoneError(t("unsupported", file.name));
            continue;
        }

        if (check.animated) {
            showDropzoneError(t("animated", file.name));
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
        originalImages.push({ file, img });

        const container = document.createElement("div");
        container.className = "previewItem";

        const origImg = document.createElement("img");
        origImg.src = url;

        const compressedImg = document.createElement("img");
        compressedImg.className = "pg-compressed";

        const infoDiv = document.createElement("div");
        infoDiv.className = "info";

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
        const shimmer = document.createElement("div");
        shimmer.className = "pg-shimmer";
        track.append(bar, shimmer);

        const label = document.createElement("div");
        label.className = "pg-label";

        progress.append(track, label);

        const infoText = document.createElement("span");
        infoDiv.append(progress, infoText);

        const download = document.createElement("a");
        download.className = "download";
        download.textContent = t("download");

        container.append(origImg, compressedImg, infoDiv, download);
        preview.appendChild(container);

        previewItems.push({
            container, compressedImg, infoDiv, infoText,
            progress, bar, label, downloadLink: download, info: null
        });
    }
}

/* =====================================================
   FARBEN ZÄHLEN (bricht ab, sobald das Limit überschritten ist)
===================================================== */

function countColorsUpTo(rgba, limit) {
    const px = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2);
    const seen = new Set();
    for (let i = 0; i < px.length; i++) {
        seen.add(px[i]);
        if (seen.size > limit) return seen.size;
    }
    return seen.size;
}

/* =====================================================
   RENDER MIT UPNG + QUANTIZE
===================================================== */

async function render({ scroll = false } = {}) {

    if (!originalImages.length) return;

    const token = ++renderToken;
    const cancelled = () => token !== renderToken;

    revokeAll(resultUrls);
    zipFiles = [];

    const results = [];
    const quality = Number(controlInput.value); // 1–100

    // Alle Bilder zunächst als "wartend" markieren
    previewItems.forEach((p) => {
        p.info = null;
        renderInfo(p);
        setProgress(p, 0, t("waiting"));
        showProgress(p, true);
    });

    for (let i = 0; i < originalImages.length; i++) {

        const { file, img } = originalImages[i];
        const p = previewItems[i];

        setProgress(p, 0.02);
        await paintYield();
        if (cancelled()) return;

        // Originaldatei übernehmen (100 % oder Fallback)
        const keepOriginal = (info) => {
            results.push({ name: file.name, blob: file });
            p.compressedImg.src = img.src;
            p.downloadLink.href = img.src;
            p.downloadLink.download = file.name;
            p.info = info;
            renderInfo(p);
            showProgress(p, false);
        };

        // 100% = Originaldatei
        if (quality >= 100) {
            keepOriginal({ type: "original100", size: file.size });
            continue;
        }

        try {
            const w = img.naturalWidth;
            const h = img.naturalHeight;

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            setProgress(p, 0.1);

            // RGBA extrahieren (ohne zusätzliche Kopie)
            const imgData = ctx.getImageData(0, 0, w, h);
            canvas.width = canvas.height = 0; // Canvas-Speicher freigeben
            const rgba = new Uint8Array(imgData.data.buffer);

            // Anzahl Farben berechnen
            const maxColors = 256;
            const colors = Math.max(2, Math.round(maxColors * quality / 100));

            // Hat das Bild ohnehin höchstens so viele Farben, ist Quantisieren unnötig
            // (und würde nur Qualität kosten) -> verlustfrei kodieren
            const unique = countColorsUpTo(rgba, colors);
            const lossless = unique <= colors;

            setProgress(p, 0.2);
            await paintYield();
            if (cancelled()) return;

            let pngData;

            if (lossless) {
                pngData = UPNG.encode([rgba.buffer], w, h, 0);
            } else {
                // UPNG.quantize nutzen
                const qres = UPNG.quantize(rgba, colors);
                const palImg = qres.abuf;           // quantisierte Daten
                const palSize = qres.plte.length;   // Palettegröße

                setProgress(p, 0.75);
                await paintYield();
                if (cancelled()) return;

                // UPNG.encode (Aufruf unverändert wie bisher)
                pngData = UPNG.encode([palImg], w, h, 0, palSize);
            }

            if (cancelled()) return;

            const blob = new Blob([pngData], { type: "image/png" });

            // Nicht (nennenswert) kleiner? Dann Original behalten
            if (blob.size >= file.size * MIN_GAIN) {
                keepOriginal({ type: "noGain" });
                continue;
            }

            results.push({ name: file.name, blob });

            const url = URL.createObjectURL(blob);
            resultUrls.push(url);

            setProgress(p, 1);

            p.compressedImg.src = url;
            p.downloadLink.href = url;
            p.downloadLink.download = file.name;

            p.info = {
                type: "result",
                orig: file.size,
                neu: blob.size,
                saved: 100 - (blob.size / file.size) * 100,
                lossless
            };
            renderInfo(p);
            showProgress(p, false);

        } catch (err) {
            console.error(err);
            keepOriginal({ type: "error" });
        }
    }

    zipFiles = results;

    // Scroll: Preview immer im Blick, Slider sichtbar (nur nach neuem Upload)
    if (scroll) {
        const sliderBottom = qualityWrapper.getBoundingClientRect().bottom + window.scrollY;
        const previewTop = preview.getBoundingClientRect().top + window.scrollY;
        const offset = 16; // anpassbarer Abstand

        if (previewTop > sliderBottom) {
            window.scrollTo({
                top: previewTop - qualityWrapper.offsetHeight - offset,
                behavior: "smooth"
            });
        }
    }
}

/* =====================================================
   ZIP DOWNLOAD
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
