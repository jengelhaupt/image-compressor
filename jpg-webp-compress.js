const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const ACTIVE = typeof MODE !== "undefined" ? MODE : "jpg";

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

/* =========================
   CONTROLS
========================= */
let controlInput, controlLabel;

if (ACTIVE === "jpg") {
    controlInput = document.getElementById("jpgQ");
    controlLabel = document.getElementById("jpgVal");
} else if (ACTIVE === "webp") {
    controlInput = document.getElementById("webpQ");
    controlLabel = document.getElementById("webpVal");
}

if (controlInput) {
    controlInput.oninput = () => {
        controlLabel.textContent = controlInput.value;
        render();
    };
}

/* =========================
   DRAG & DROP
========================= */
dropzone.onclick = () => fileInput.click();

dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
};

dropzone.ondragleave = () => dropzone.classList.remove("dragover");

/* =========================
   UPLOAD EVENTS
========================= */
fileInput.onchange = async (e) => {
    files = [...e.target.files];
    await prepareImages();
    await render();

    requestAnimationFrame(() => {
        preview.scrollIntoView({ behavior: "smooth" });
    });
};

dropzone.ondrop = async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    files = [...e.dataTransfer.files];
    await prepareImages();
    await render();

    requestAnimationFrame(() => {
        preview.scrollIntoView({ behavior: "smooth" });
    });
};

/* =========================
   PREPARE IMAGES
========================= */
async function prepareImages() {
    originalImages = await Promise.all(
        files.map(
            (file) =>
                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = URL.createObjectURL(file);
                    img.onload = () => resolve({ file, img });
                    img.onerror = reject;
                })
        )
    );

    preview.innerHTML = "";
    previewItems = [];

    originalImages.forEach((item) => {
        const container = document.createElement("div");
        container.className = "previewItem";

        const origImg = document.createElement("img");
        origImg.src = URL.createObjectURL(item.file);

        const compressedImg = document.createElement("img");

        const infoDiv = document.createElement("div");
        infoDiv.className = "info";

        const downloadLink = document.createElement("a");
        downloadLink.className = "download";
        downloadLink.textContent = "Datei herunterladen";

        container.append(origImg, compressedImg, infoDiv, downloadLink);
        preview.appendChild(container);

        previewItems.push({ origImg, compressedImg, infoDiv, downloadLink });
    });
}

/* =========================
   RENDER
========================= */
async function render() {
    zipFiles = [];
    if (!originalImages.length) return;

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const p = previewItems[i];
        const percent = Number(controlInput.value);

        /* -------- WEBP CONVERT -------- */
        if (ACTIVE === "webp") {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const quality = Math.min(0.99, percent / 100);
            let blob = await new Promise((r) =>
                canvas.toBlob(r, "image/webp", quality)
            );

            if (blob.size >= file.size) blob = file;

            const newName = file.name.replace(/\.(jpg|jpeg|png|webp)$/i, ".webp");

            zipFiles.push({ name: newName, blob });
            p.compressedImg.src = URL.createObjectURL(blob);

            const saved = 100 - (blob.size / file.size) * 100;
            p.infoDiv.textContent =
                `Original ${(file.size / 1024).toFixed(1)} KB → WebP ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

            p.downloadLink.href = URL.createObjectURL(blob);
            p.downloadLink.download = newName;
            continue;
        }

        /* -------- JPG -------- */
        if (percent >= 100) {
            zipFiles.push({ name: file.name, blob: file });
            p.compressedImg.src = URL.createObjectURL(file);
            p.infoDiv.textContent =
                `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(file.size / 1024).toFixed(1)} KB (0%)`;
            p.downloadLink.href = URL.createObjectURL(file);
            p.downloadLink.download = file.name;
            continue;
        }

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const quality = Math.min(0.99, percent / 100);
        let blob = await new Promise((r) =>
            canvas.toBlob(r, "image/jpeg", quality)
        );

        if (blob.size >= file.size) blob = file;

        zipFiles.push({ name: file.name, blob });
        p.compressedImg.src = URL.createObjectURL(blob);

        const saved = 100 - (blob.size / file.size) * 100;
        p.infoDiv.textContent =
            `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

        p.downloadLink.href = URL.createObjectURL(blob);
        p.downloadLink.download = file.name;
    }
}

/* =========================
   ZIP
========================= */
zipBtn.onclick = async () => {
    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach((f) => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ACTIVE}-komprimiert.zip`;
    a.click();
};
