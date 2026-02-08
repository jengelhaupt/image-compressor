/* =========================
   PDF.js Worker setzen
========================= */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js";

/* =========================
   DOM ELEMENTE
========================= */
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");
const qualityInput = document.getElementById("pdfQ");
const qualityLabel = document.getElementById("pdfVal");

/* =========================
   STATE
========================= */
let files = [];
let zipFiles = [];
let pdfItems = [];

/* =========================
   SLIDER
========================= */
if (qualityInput && qualityLabel) {
  qualityLabel.textContent = qualityInput.value;
  qualityInput.oninput = () => {
    qualityLabel.textContent = qualityInput.value;
  };
}

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

  files = [...e.dataTransfer.files].filter(f => f.type === "application/pdf");
  await preparePDFs();
  await render();
};

/* =========================
   FILE INPUT
========================= */
fileInput.onchange = async e => {
  files = [...e.target.files].filter(f => f.type === "application/pdf");
  await preparePDFs();
  await render();
};

/* =========================
   PREVIEW VORBEREITEN
========================= */
async function preparePDFs() {
  preview.innerHTML = "";
  pdfItems = [];

  for (const file of files) {
    const container = document.createElement("div");
    container.className = "previewItem";

    const infoDiv = document.createElement("div");
    infoDiv.className = "info";
    infoDiv.textContent = "Analysiere PDF…";

    const downloadLink = document.createElement("a");
    downloadLink.textContent = "Datei herunterladen";

    container.append(infoDiv, downloadLink);
    preview.appendChild(container);

    pdfItems.push({ file, infoDiv, downloadLink });
  }
}

/* =========================
   TEXT VS SCAN ERKENNEN
========================= */
async function isTextPDF(file) {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  let textLength = 0;
  for (let i = 1; i <= Math.min(2, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    textLength += text.items.map(i => i.str).join("").length;
  }

  return textLength > 100; // true = Text-PDF
}

/* =========================
   SCAN-PDF RASTERISIEREN
========================= */
async function rasterizePDF(file, scale = 1.3, quality = 0.6) {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const images = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    images.push({
      imgData: canvas.toDataURL("image/jpeg", quality),
      width: canvas.width,
      height: canvas.height
    });
  }

  return images;
}

/* =========================
   BILDER → NEUES PDF
========================= */
async function imagesToPDF(images) {
  const pdfDoc = await PDFLib.PDFDocument.create();

  for (const img of images) {
    const jpg = await pdfDoc.embedJpg(img.imgData);
    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: img.width, height: img.height });
  }

  return await pdfDoc.save();
}

/* =========================
   SMART COMPRESSION
========================= */
async function compressSmart(file) {
  const isText = await isTextPDF(file);

  if (isText) {
    // Text-PDF: nur minimal komprimieren
    const bytes = await file.arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(bytes);
    const out = await pdf.save({ compress: true });

    return {
      blob: new Blob([out], { type: "application/pdf" }),
      label: "Text-PDF erkannt – keine Bildkomprimierung"
    };
  }

  // Scan-PDF: Rasterisieren & JPEG komprimieren
  const quality = qualityInput ? qualityInput.value / 100 : 0.6;
  const images = await rasterizePDF(file, 1.3, quality);
  const pdfBytes = await imagesToPDF(images);

  return {
    blob: new Blob([pdfBytes], { type: "application/pdf" }),
    label: "Scan-PDF erkannt – Bildkomprimierung aktiv"
  };
}

/* =========================
   RENDER / KOMPRIMIEREN
========================= */
async function render() {
  zipFiles = [];

  for (const item of pdfItems) {
    const { file, infoDiv, downloadLink } = item;

    infoDiv.textContent = "Analysiere PDF…";
    const originalKB = (file.size / 1024).toFixed(1);

    const { blob, label } = await compressSmart(file);
    const newKB = (blob.size / 1024).toFixed(1);

    infoDiv.textContent = `${label} | ${originalKB} KB → ${newKB} KB`;

    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = file.name;

    zipFiles.push({ name: file.name, blob });
  }
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
  a.download = "pdf-komprimiert.zip";
  a.click();
};
