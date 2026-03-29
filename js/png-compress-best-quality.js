const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

/* =========================
   DRAG & DROP
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

/* =========================
   FILE INPUT
========================= */
fileInput.onchange = async e => {
    files = [...e.target.files].filter(f => f.type === "image/png");
    await prepareImages();
    await render();
};

/* =========================
   LANGUAGE
========================= */
let currentLang = document.documentElement.lang
    .toLowerCase()
    .startsWith("tr") ? "tr" : "de";

const translations = {
    de: { download: "Datei herunterladen" },
    tr: { download: "Dosyayı indir" }
};

function t(key) {
    return translations[currentLang][key] || key;
}

function setLanguage(lang) {
    currentLang = lang;
    updateDownloadButtons();
}

function updateDownloadButtons() {
    document.querySelectorAll(".download").forEach(btn => {
        btn.textContent = t("download");
    });
}

/* =========================
   PREPARE IMAGES
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
        const container = document.createElement("div");
        container.className = "previewItem";

        const origImg = document.createElement("img");
        origImg.src = URL.createObjectURL(file);

        const compressedImg = document.createElement("img");

        const infoDiv = document.createElement("div");
        infoDiv.className = "info";

        const download = document.createElement("a");
        download.className = "download";
        download.textContent = t("download");

        container.append(origImg, compressedImg, infoDiv, download);
        preview.appendChild(container);

        previewItems.push({ compressedImg, infoDiv, downloadLink: download });
    });
}

/* =========================
   RENDER MIT UPNG - AUTOMATISCH
========================= */
async function render() {
    if (!originalImages.length) return;
    zipFiles = [];

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const p = previewItems[i];

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const originalRGBA = new Uint8Array(imgData.data);

        let bestBlob = file;
        let bestSize = file.size;

        // Automatische, visuell verlustfreie Optimierung
        const testColors = [256, 192, 128, 96, 64, 48, 32];

        for (let colors of testColors) {
            const qres = UPNG.quantize(originalRGBA, colors);
            const pngData = UPNG.encode([qres.abuf], canvas.width, canvas.height, 0, qres.plte.length);
            const blob = new Blob([pngData], { type: "image/png" });

            if (blob.size < bestSize) {
                bestBlob = blob;
                bestSize = blob.size;
            } else {
                break;
            }
        }

        const saved = 100 - (bestSize / file.size) * 100;

        p.infoDiv.textContent =
            `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(bestSize / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

        zipFiles.push({ name: file.name, blob: bestBlob });

        p.compressedImg.src = URL.createObjectURL(bestBlob);
        p.downloadLink.href = URL.createObjectURL(bestBlob);
        p.downloadLink.download = file.name;
    }
       const previewTop = preview.getBoundingClientRect().top + window.scrollY;
    const offset = 16;

    window.scrollTo({
        top: previewTop - offset,
        behavior: "smooth"
    });
}

/* =========================
   ZIP DOWNLOAD
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
