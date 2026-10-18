/* =====================================================
   CONFIG
===================================================== */

const MAX_PIXELS = 30_000_000;   // Schutz vor Speicherproblemen
const MIN_GAIN = 0.98;           // Ergebnis muss mind. 2 % kleiner sein, sonst bleibt das Original

// Qualitätsziele (in dB, höher = besser). Hier lässt sich Qualität gegen Dateigrösse abwägen.
const TARGET_PSNR = 38;          // Gesamtqualität, die mindestens erreicht werden soll
const TARGET_LOCAL_PSNR = 30;    // Mindestqualität der schlechtesten 5 % der Bildbereiche
const FLOOR_PSNR = 30;           // Schon mit 256 Farben darunter -> Original behalten
const CANDIDATE_COLORS = [16, 24, 32, 48, 64, 96, 128, 160, 192, 224, 256];

const DEBUG = false;             // true: Messwerte pro Farbanzahl in der Konsole ausgeben

/* =====================================================
   ELEMENTS
===================================================== */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

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

const CANCELLED = Symbol("cancelled");

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
        ready: "Bereit…",
        optimizing: "Optimiere:",
        unsupported: (n) => `Dateiformat "${n}" wird nicht unterstützt. Nur PNG erlaubt.`,
        animated: (n) => `"${n}" ist ein animiertes PNG (APNG) und wird übersprungen, damit die Animation nicht verloren geht.`,
        broken: (n) => `"${n}" konnte nicht geladen werden.`,
        tooBig: (n) => `"${n}" ist zu gross (max. ${MAX_PIXELS / 1e6} Megapixel).`,
        result: (o, n, saved, kind, colors) =>
            `Original ${kb(o)} KB → Neu ${kb(n)} KB (${saved.toFixed(1)}%)` +
            (kind === "lossless" ? " · verlustfrei" : ` · ${colors} Farben`),
        noGain: "Keine Ersparnis – Original behalten",
        quality: "Würde sichtbar an Qualität verlieren – Original behalten",
        error: "Fehler bei der Verarbeitung – Original behalten",
        zipName: "png-komprimiert.zip"
    },
    tr: {
        download: "Dosyayı indir",
        ready: "Hazır…",
        optimizing: "Optimize ediliyor:",
        unsupported: (n) => `"${n}" dosya biçimi desteklenmiyor. Yalnızca PNG.`,
        animated: (n) => `"${n}" animasyonlu bir PNG (APNG); animasyon kaybolmasın diye atlandı.`,
        broken: (n) => `"${n}" yüklenemedi.`,
        tooBig: (n) => `"${n}" çok büyük (maks. ${MAX_PIXELS / 1e6} megapiksel).`,
        result: (o, n, saved, kind, colors) =>
            `Orijinal ${kb(o)} KB → Yeni ${kb(n)} KB (${saved.toFixed(1)}%)` +
            (kind === "lossless" ? " · kayıpsız" : ` · ${colors} renk`),
        noGain: "Kazanç yok – orijinal korundu",
        quality: "Görünür kalite kaybı olacaktı – orijinal korundu",
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
    document.querySelectorAll(".download").forEach((btn) => {
        btn.textContent = t("download");
    });
    previewItems.forEach((p) => { if (!p.busy) renderInfo(p); });
}

// Info-Text aus gespeichertem Zustand aufbauen (damit Sprachwechsel funktioniert)
function renderInfo(p) {
    const i = p.info;
    if (!i) { p.infoDiv.textContent = t("ready"); return; }

    switch (i.type) {
        case "result":  p.infoDiv.textContent = t("result", i.orig, i.neu, i.saved, i.kind, i.colors); break;
        case "noGain":  p.infoDiv.textContent = t("noGain"); break;
        case "quality": p.infoDiv.textContent = t("quality"); break;
        case "error":   p.infoDiv.textContent = t("error"); break;
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
        .pg-progress{display:none;width:100%;margin-top:6px}
        .pg-progress.active{display:block}
        .pg-track{position:relative;height:6px;border-radius:4px;background:rgba(128,128,128,.25);overflow:hidden}
        .pg-bar{height:100%;width:0;border-radius:4px;background:var(--progress-color,#2196f3);transition:width .15s linear}
        .pg-shimmer{position:absolute;top:0;left:0;height:100%;width:40%;will-change:transform;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);
            animation:pg-shimmer 1.2s linear infinite}
        @keyframes pg-shimmer{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
        .previewItem.pg-busy .pg-compressed{opacity:.45;transition:opacity .2s}
    `;
    document.head.appendChild(st);
})();

const fmtPct = (n) => currentLang === "tr" ? `%${n}` : `${n} %`;

function setProgress(p, frac) {
    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    p.bar.style.width = pct + "%";
    p.progress.setAttribute("aria-valuenow", String(pct));
    p.infoDiv.textContent = `${t("optimizing")} ${fmtPct(pct)}`;
}

function showProgress(p, on) {
    p.busy = on;
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
   DRAG & DROP / FILE INPUT
===================================================== */

async function handleFiles(list) {
    files = [...list];
    await prepareImages();
    await render();
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
   PREPARE IMAGES + UI
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
        infoDiv.textContent = t("ready");

        const download = document.createElement("a");
        download.className = "download";
        download.textContent = t("download");

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
        progress.appendChild(track);

        container.append(origImg, compressedImg, infoDiv, progress, download);
        preview.appendChild(container);

        previewItems.push({
            container, compressedImg, infoDiv, progress, bar,
            downloadLink: download, info: null, busy: false
        });
    }
}

/* =====================================================
   ANALYSE & QUALITÄTSMESSUNG
===================================================== */

// Zählt exakte Farben (inkl. Alpha), bricht ab sobald das Limit überschritten ist
function countColorsUpTo(rgba, limit) {
    const px = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2);
    const seen = new Set();
    for (let i = 0; i < px.length; i++) {
        seen.add(px[i]);
        if (seen.size > limit) return seen.size;
    }
    return seen.size;
}

const psnrOf = (mse) => mse <= 0 ? Infinity : 10 * Math.log10(65025 / mse);

// Vergleicht Original und quantisiertes Bild.
// Fehler wird auf vormultiplizierten Farben + Alpha gemessen (halbtransparente Bereiche zählen korrekt).
// psnr   = Gesamtqualität
// local  = Qualität der schlechtesten 5 % der 16x16-Blöcke (erkennt Banding / verlorene Details,
//          die im Gesamtdurchschnitt untergehen würden)
function measureQuality(orig, quant, w, h) {
    const B = 16;
    const bx = Math.ceil(w / B);
    const by = Math.ceil(h / B);
    const blockErr = new Float64Array(bx * by);
    const blockCnt = new Uint32Array(bx * by);

    let total = 0;

    for (let y = 0; y < h; y++) {
        const brow = ((y / B) | 0) * bx;
        let i = y * w * 4;

        for (let x = 0; x < w; x++, i += 4) {
            const a1 = orig[i + 3];
            const a2 = quant[i + 3];

            const dr = (orig[i]     * a1 - quant[i]     * a2) / 255;
            const dg = (orig[i + 1] * a1 - quant[i + 1] * a2) / 255;
            const db = (orig[i + 2] * a1 - quant[i + 2] * a2) / 255;
            const da = a1 - a2;

            const e = (dr * dr + dg * dg + db * db + da * da) / 3;

            total += e;
            const b = brow + ((x / B) | 0);
            blockErr[b] += e;
            blockCnt[b]++;
        }
    }

    const means = new Float64Array(blockErr.length);
    for (let b = 0; b < means.length; b++) means[b] = blockErr[b] / blockCnt[b];
    means.sort();                                   // aufsteigend

    const k = Math.max(1, Math.ceil(means.length * 0.05));
    let worst = 0;
    for (let j = means.length - k; j < means.length; j++) worst += means[j];

    return {
        psnr: psnrOf(total / (w * h)),
        local: psnrOf(worst / k)
    };
}

function evalColors(rgba, w, h, colors) {
    const qres = UPNG.quantize(rgba, colors);
    const palSize = qres.plte.length;
    const q = measureQuality(rgba, new Uint8Array(qres.abuf), w, h);
    const ok = q.psnr >= TARGET_PSNR && q.local >= TARGET_LOCAL_PSNR;

    if (DEBUG) {
        console.log(
            `[PNG] ${colors} Farben (Palette ${palSize}): ` +
            `PSNR ${q.psnr.toFixed(1)} dB, lokal ${q.local.toFixed(1)} dB → ${ok ? "ok" : "zu schlecht"}`
        );
    }

    return { abuf: qres.abuf, palSize, psnr: q.psnr, local: q.local, ok };
}

/* =====================================================
   SUCHE: WENIGSTE FARBEN BEI AUSREICHENDER QUALITÄT
===================================================== */

// Gibt { kind, data, colors } zurück ("lossless" | "colors") oder { reject: true }
// onStep(done, total) meldet den Fortschritt (und darf abbrechen, indem es wirft)
async function searchPalette(rgba, w, h, unique, onStep) {

    const exact = unique <= 256;   // Bild hat höchstens 256 Farben -> verlustfrei möglich
    const cands = CANDIDATE_COLORS.filter((c) => c < (exact ? unique : 256));

    const evals = (exact ? 0 : 1) + Math.ceil(Math.log2(cands.length + 1));
    const total = evals + (exact ? 2 : 1);
    let done = 0;
    const step = () => onStep(done++, total);

    let best = null;

    if (!exact) {
        // Mehr als 256 Farben: 256 ist das Beste, was eine Palette leisten kann
        await step();
        const r = evalColors(rgba, w, h, 256);
        if (r.psnr < FLOOR_PSNR) return { reject: true };
        best = r;
        if (!r.ok) cands.length = 0;   // schon 256 erreicht das Ziel nicht -> nicht weiter reduzieren
    }

    // Binäre Suche nach der kleinsten Farbanzahl, die das Qualitätsziel noch erfüllt
    let lo = 0, hi = cands.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        await step();
        const r = evalColors(rgba, w, h, cands[mid]);
        if (r.ok) { best = r; hi = mid - 1; } else { lo = mid + 1; }
    }

    let result = null;

    if (best) {
        await step();
        result = {
            kind: "colors",
            colors: best.palSize,
            data: UPNG.encode([best.abuf], w, h, 0, best.palSize)
        };
    }

    if (exact) {
        // Verlustfreie Variante als Referenz / Fallback
        await step();
        const data = UPNG.encode([rgba.buffer], w, h, 0);
        if (!result || data.byteLength <= result.data.byteLength) {
            result = { kind: "lossless", colors: unique, data };
        }
    }

    return result;
}

/* =====================================================
   RENDER + SMART COMPRESSION
===================================================== */

async function render() {

    if (!originalImages.length) return;

    const token = ++renderToken;
    const cancelled = () => token !== renderToken;

    revokeAll(resultUrls);
    zipFiles = [];

    const results = [];

    for (let i = 0; i < originalImages.length; i++) {

        const { file, img } = originalImages[i];
        const p = previewItems[i];

        p.info = null;
        setProgress(p, 0);
        showProgress(p, true);

        await paintYield();
        if (cancelled()) return;

        // Originaldatei übernehmen (Fallback)
        const keepOriginal = (info) => {
            results.push({ name: file.name, blob: file });
            p.compressedImg.src = img.src;
            p.downloadLink.href = img.src;
            p.downloadLink.download = file.name;
            p.info = info;
            showProgress(p, false);
            renderInfo(p);
        };

        try {
            const w = img.naturalWidth;
            const h = img.naturalHeight;

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, w, h);
            canvas.width = canvas.height = 0; // Canvas-Speicher freigeben
            const rgba = new Uint8Array(imgData.data.buffer);

            const unique = countColorsUpTo(rgba, 256);

            const onStep = async (done, total) => {
                setProgress(p, 0.03 + 0.94 * (done / total));
                await paintYield();
                if (cancelled()) throw CANCELLED;
            };

            const res = await searchPalette(rgba, w, h, unique, onStep);

            if (cancelled()) return;

            if (!res || res.reject) {
                keepOriginal({ type: "quality" });
                continue;
            }

            const blob = new Blob([res.data], { type: "image/png" });

            // Nicht (nennenswert) kleiner? Dann Original behalten
            if (blob.size >= file.size * MIN_GAIN) {
                keepOriginal({ type: "noGain" });
                continue;
            }

            results.push({ name: file.name, blob });

            const url = URL.createObjectURL(blob);
            resultUrls.push(url);

            p.compressedImg.src = url;
            p.downloadLink.href = url;
            p.downloadLink.download = file.name;

            p.info = {
                type: "result",
                orig: file.size,
                neu: blob.size,
                saved: 100 - (blob.size / file.size) * 100,
                kind: res.kind,
                colors: res.colors
            };

            setProgress(p, 1);
            showProgress(p, false);
            renderInfo(p);

        } catch (err) {
            if (err === CANCELLED) return;
            console.error(err);
            keepOriginal({ type: "error" });
        }
    }

    zipFiles = results;

    const previewTop = preview.getBoundingClientRect().top + window.scrollY;

    window.scrollTo({
        top: previewTop - 16,
        behavior: "smooth"
    });
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
