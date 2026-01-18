const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const ACTIVE = typeof MODE !== "undefined" ? MODE : "jpg";

let files = [];
let zipFiles = [];

/* Controls */
let controlInput, controlLabel;

if (ACTIVE === "jpg") {
    controlInput = document.getElementById("jpgQ");
    controlLabel = document.getElementById("jpgVal");
}

if (ACTIVE === "webp") {
    controlInput = document.getElementById("webpQ");
    controlLabel = document.getElementById("webpVal");
}

if (ACTIVE === "png") {
    controlInput = document.getElementById("pngC");
    controlLabel = document.getElementById("pngVal");
}

if (ACTIVE === "pdf") {
    controlInput = document.getElementById("pdfQ");
    controlLabel = document.getElementById("pdfVal");
}

/* Slider */
if (controlInput) {
    controlInput.oninput = () => {
        controlLabel.textContent = controlInput.value;
        render();
    };
}

/* Drag & Drop */
dropzone.onclick = () => fileInput.click();

dropzone.ondragover = e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
};

dropzone.ondragleave = () =>
    dropzone.classList.remove("dragover");

dropzone.ondrop = e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    files = [...e.dataTransfer.files];
    render();
};

fileInput.onchange = e => {
    files = [...e.target.files];
    render();
};

/* PNG Quantisierung */
function quantize(ctx, w, h, colors) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const step = Math.max(1, Math.floor(256 / Math.cbrt(colors)));

    for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.floor(d[i]     / step) * step;
        d[i + 1] = Math.floor(d[i + 1] / step) * step;
        d[i + 2] = Math.floor(d[i + 2] / step) * step;
    }
    ctx.putImageData(img, 0, 0);
}

/* Render */
async function render() {
    preview.innerHTML = "";
    zipFiles = [];

    for (const file of files) {

        /* ---------- PDF ---------- */
        if (ACTIVE === "pdf" && file.type === "application/pdf") {
            const bytes = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(bytes);

            // Neuspeichern (entfernt Redundanzen)
            const outBytes = await pdf.save({
                useObjectStreams: true,
                compress: true
            });

            zipFiles.push({ name: file.name, blob: new Blob([outBytes]) });

            preview.innerHTML += `
                <div class="previewItem">
                    <div>
                        Original<br>
                        ${(file.size/1024).toFixed(1)} KB
                    </div>
                    <div>
                        Neu<br>
                        ${(outBytes.byteLength/1024).toFixed(1)} KB
                    </div>
                    <div class="info">
                        PDF neu gespeichert (Browser-Kompression)
                    </div>
                </div>
            `;
            continue;
        }

        /* ---------- IMAGES ---------- */
        if (!file.type.startsWith("image/")) continue;

        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        let type = "image/jpeg";
        let quality = 0.7;

        if (ACTIVE === "jpg") {
            type = "image/jpeg";
            quality = controlInput.value / 100;
        }

        if (ACTIVE === "webp") {
            type = "image/webp";
            quality = controlInput.value / 100;
        }

        if (ACTIVE === "png") {
            quantize(ctx, canvas.width, canvas.height, controlInput.value);
            type = "image/png";
        }

        const blob = await new Promise(r =>
            canvas.toBlob(r, type, quality)
        );

        const ext =
            ACTIVE === "jpg"  ? ".jpg"  :
            ACTIVE === "webp" ? ".webp" :
            ".png";

        const outName = file.name.replace(/\.(jpg|jpeg|png|webp)$/i, ext);

        zipFiles.push({ name: outName, blob });

        const saved = 100 - (blob.size / file.size * 100);

        preview.innerHTML += `
            <div class="previewItem">
                <img src="${URL.createObjectURL(file)}">
                <img src="${URL.createObjectURL(blob)}">
                <div class="info">
                    Original ${(file.size/1024).toFixed(1)} KB →
                    Neu ${(blob.size/1024).toFixed(1)} KB
                    (${saved.toFixed(1)}%)
                </div>
                <a class="download" download="${outName}"
                   href="${URL.createObjectURL(blob)}">
                   Einzeln herunterladen
                </a>
            </div>
        `;
    }
}
    // ✅ Automatisch zur Preview scrollen
    preview.scrollIntoView({ behavior: "smooth" });
}

/* ZIP */
zipBtn.onclick = async () => {
    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach(f => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ACTIVE}-komprimiert.zip`;
    a.click();
};
