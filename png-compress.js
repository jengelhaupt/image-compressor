const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

let files = [];
let originalImages = [];
let previewItems = [];
let zipFiles = [];

/* =========================
   CONTROL
========================= */
const controlInput = document.getElementById("pngC");
const controlLabel = document.getElementById("pngVal");

controlInput.oninput = () => {
    controlLabel.textContent = controlInput.value + "%";
    render();
};

/* =========================
   INPUT
========================= */
dropzone.onclick = () => fileInput.click();

dropzone.ondragover = e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
};
dropzone.ondragleave = () => dropzone.classList.remove("dragover");

dropzone.ondrop = async e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    files = [...e.dataTransfer.files].filter(f => f.type === "image/png");
    await prepareImages();
    await render();
};

fileInput.onchange = async e => {
    files = [...e.target.files].filter(f => f.type === "image/png");
    await prepareImages();
    await render();
};

/* =========================
   PREPARE
========================= */
async function prepareImages() {
    originalImages = await Promise.all(
        files.map(file => new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => resolve({ file, img });
            img.onerror = reject;
        }))
    );

    preview.innerHTML = "";
    previewItems = [];

    originalImages.forEach(({ file }) => {
        const box = document.createElement("div");
        box.className = "previewItem";

        const orig = document.createElement("img");
        orig.src = URL.createObjectURL(file);

        const comp = document.createElement("img");
        const info = document.createElement("div");
        info.className = "info";

        const link = document.createElement("a");
        link.className = "download";
        link.textContent = "Datei herunterladen";

        box.append(orig, comp, info, link);
        preview.appendChild(box);

        previewItems.push({ comp, info, link });
    });
}

/* =========================
   QUANTIZE
========================= */
function quantizeSimple(ctx, w, h, colors) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const levels = Math.max(2, Math.round(Math.cbrt(colors)));
    const step = 255 / (levels - 1);

    for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.round(d[i]     / step) * step;
        d[i + 1] = Math.round(d[i + 1] / step) * step;
        d[i + 2] = Math.round(d[i + 2] / step) * step;
    }
    ctx.putImageData(img, 0, 0);
}

/* =========================
   TRY ONE VARIANT
========================= */
async function tryEncode(img, file, colors) {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(img, 0, 0);
    quantizeSimple(ctx, canvas.width, canvas.height, colors);

    return await new Promise(r => canvas.toBlob(r, "image/png"));
}

/* =========================
   RENDER
========================= */
async function render() {
    if (!originalImages.length) return;
    zipFiles = [];

    const q = Number(controlInput.value);

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const p = previewItems[i];

        let bestBlob;

        // 🔴 100 % = echtes Original
        if (q === 100) {
            bestBlob = file.slice(0, file.size, file.type);
            p.info.textContent =
                `Original ${(file.size / 1024).toFixed(1)} KB (unverändert)`;
        } else {
            // 🎯 definierter, monotoner Suchraum
            const maxColors = Math.max(256, Math.round(4096 * q / 100));
            const candidates = [
                maxColors,
                Math.round(maxColors * 0.75),
                Math.round(maxColors * 0.5),
                Math.round(maxColors * 0.35)
            ];

            for (const c of candidates) {
                const blob = await tryEncode(img, file, c);
                if (!bestBlob || blob.size < bestBlob.size) {
                    bestBlob = blob;
                }
            }

            const saved = 100 - (bestBlob.size / file.size) * 100;
            p.info.textContent =
                `Original ${(file.size / 1024).toFixed(1)} KB → ` +
                `Neu ${(bestBlob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
        }

        zipFiles.push({ name: file.name, blob: bestBlob });
        p.comp.src = URL.createObjectURL(bestBlob);
        p.link.href = URL.createObjectURL(bestBlob);
        p.link.download = file.name;
    }
}

/* =========================
   ZIP
========================= */
zipBtn.onclick = async () => {
    if (!zipFiles.length) return;
    const zip = new JSZip();
    zipFiles.forEach(f => zip.file(f.name, f.blob));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "png-komprimiert.zip";
    a.click();
};
