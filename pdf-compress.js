const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const qualityWrapper = document.getElementById("pdf");
const controlInput = document.getElementById("pdfQ");
const controlLabel = document.getElementById("pdfVal");

let files = [];
let zipFiles = [];
let pdfItems = [];

/* =========================
   CONTROL (optional)
========================= */
if (controlInput && controlLabel) {
    controlLabel.textContent = controlInput.value;

    controlInput.oninput = () => {
        controlLabel.textContent = controlInput.value;
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

dropzone.ondrop = async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    files = [...e.dataTransfer.files].filter(f => f.type === "application/pdf");
    await preparePDFs();
    await render();
};

/* =========================
   FILE INPUT
========================= */
fileInput.onchange = async (e) => {
    files = [...e.target.files].filter(f => f.type === "application/pdf");
    await preparePDFs();
    await render();
};

/* =========================
   PREPARE PDF PREVIEW
========================= */
async function preparePDFs() {
    pdfItems = [];
    preview.innerHTML = "";

    files.forEach((file) => {
        const container = document.createElement("div");
        container.className = "previewItem";

        const infoDiv = document.createElement("div");
        infoDiv.className = "info";

        const downloadLink = document.createElement("a");
        downloadLink.className = "download";
        downloadLink.textContent = "Datei herunterladen";

        container.append(infoDiv, downloadLink);
        preview.appendChild(container);

        pdfItems.push({ infoDiv, downloadLink, file });
    });
}

/* =========================
   RENDER PDF (Komprimieren)
========================= */
async function render() {
    if (!pdfItems.length) return;

    zipFiles = [];

    for (let i = 0; i < pdfItems.length; i++) {
        const { file, infoDiv, downloadLink } = pdfItems[i];

        const bytes = await file.arrayBuffer();
        const pdf = await PDFLib.PDFDocument.load(bytes);
        const outBytes = await pdf.save({ compress: true });

        const blob = new Blob([outBytes]);
        zipFiles.push({ name: file.name, blob });

        infoDiv.textContent = `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(blob.size / 1024).toFixed(1)} KB`;

        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = file.name;
    }


const sliderBottom = qualityWrapper.getBoundingClientRect().bottom + window.scrollY;
const previewTop = preview.getBoundingClientRect().top + window.scrollY;
const offset = 16; // anpassbarer Abstand

if (previewTop > sliderBottom) {
    window.scrollTo({
        top: previewTop - qualityWrapper.offsetHeight - offset,
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
    a.download = `pdf-komprimiert.zip`;
    a.click();
};
