/* =====================================================
   ELEMENTS
===================================================== */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

/* =====================================================
   ERROR
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
   STATE
===================================================== */

let files = [];
let images = [];
let previewItems = [];
let zipFiles = [];

/* =====================================================
   INPUT
===================================================== */

dropzone.onclick = () => fileInput.click();

dropzone.ondragover = (e) => {
    e.preventDefault();
};

dropzone.ondrop = async (e) => {
    e.preventDefault();
    files = [...e.dataTransfer.files];
    await prepareImages();
    await render();
};

fileInput.onchange = async (e) => {
    files = [...e.target.files];
    await prepareImages();
    await render();
};

/* =====================================================
   PREPARE
===================================================== */

async function prepareImages() {

    images = [];
    previewItems = [];
    preview.innerHTML = "";

    for (const file of files) {

        if (!file.type.match(/jpeg/)) {
            showDropzoneError(`"${file.name}" → Nur JPG erlaubt.`);
            continue;
        }

        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();

        images.push({ file, img });

        const container = document.createElement("div");
        const originalImg = document.createElement("img");
        const compressedImg = document.createElement("img");
        const info = document.createElement("div");
        const download = document.createElement("a");

        originalImg.src = img.src;
        download.textContent = "Download";

        container.append(originalImg, compressedImg, info, download);
        preview.appendChild(container);

        previewItems.push({ compressedImg, info, download });
    }
}

/* =====================================================
   PRO IMAGE HELPERS
===================================================== */

function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rgbToYCbCr(r, g, b) {
    return {
        y: 0.299 * r + 0.587 * g + 0.114 * b,
        cb: -0.168736 * r - 0.331264 * g + 0.5 * b + 128,
        cr: 0.5 * r - 0.418688 * g - 0.081312 * b + 128
    };
}

function yCbCrToRgb(y, cb, cr) {
    return {
        r: clamp(y + 1.402 * (cr - 128)),
        g: clamp(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)),
        b: clamp(y + 1.772 * (cb - 128))
    };
}

function smoothChromaYCbCr(ctx, w, h, strength) {

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    const radius = strength > 0.25 ? 2 : 1;

    const yArr = new Float32Array(w * h);
    const cbArr = new Float32Array(w * h);
    const crArr = new Float32Array(w * h);

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const { y, cb, cr } = rgbToYCbCr(d[i], d[i + 1], d[i + 2]);
        yArr[p] = y;
        cbArr[p] = cb;
        crArr[p] = cr;
    }

    const cbCopy = new Float32Array(cbArr);
    const crCopy = new Float32Array(crArr);

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

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const { r, g, b } = yCbCrToRgb(yArr[p], cbArr[p], crArr[p]);
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
    }

    ctx.putImageData(img, 0, 0);
}

function sharpenEdges(ctx, w, h, amount = 0.18, threshold = 5) {

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const copy = new Uint8ClampedArray(d);

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {

            for (let c = 0; c < 3; c++) {

                let sum = 0, count = 0;

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
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
   SMART COMPRESSION (≤250KB)
===================================================== */

async function compressTo250KB(img) {

    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");

    let width = img.width;
    let height = img.height;

    let quality = 0.9;

    while (true) {

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        // 🔥 PRO OPTIMIERUNG
        if (quality < 0.75) {
            const strength = Math.min(0.25, (0.75 - quality));
            smoothChromaYCbCr(ctx, width, height, strength);
        }

        if (quality < 0.55) {
            sharpenEdges(ctx, width, height);
        }

        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, "image/jpeg", quality)
        );

        if (blob.size <= 250 * 1024) return blob;

        if (quality > 0.4) {
            quality *= 0.82;
        } else {
            width *= 0.88;
            height *= 0.88;
        }

        if (width < 300 || height < 300) return blob;
    }
}

/* =====================================================
   RENDER
===================================================== */

async function render() {

    if (!images.length) return;

    zipFiles = [];

    for (let i = 0; i < images.length; i++) {

        const { file, img } = images[i];
        const p = previewItems[i];

        const blob = await compressTo250KB(img);

        const url = URL.createObjectURL(blob);

        p.compressedImg.src = url;

        p.info.textContent =
            `Original ${(file.size / 1024).toFixed(1)} KB → ` +
            `Neu ${(blob.size / 1024).toFixed(1)} KB`;

        p.download.href = url;
        p.download.download = file.name;

        zipFiles.push({ name: file.name, blob });
    }
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
    a.download = "jpg-unter-250kb.zip";
    a.click();
};
