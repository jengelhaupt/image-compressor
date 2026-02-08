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
  qualityInput.oninput = () => qualityLabel.textContent = qualityInput.value;
}

/* =========================
   DRAG & DROP & FILE INPUT
========================= */
dropzone.onclick = () => fileInput.click();
dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add("dragover"); };
dropzone.ondragleave = () => dropzone.classList.remove("dragover");
dropzone.ondrop = async e => { e.preventDefault(); dropzone.classList.remove("dragover"); files = [...e.dataTransfer.files].filter(f=>f.type==="application/pdf"); await preparePDFs(); await render(); };
fileInput.onchange = async e => { files = [...e.target.files].filter(f=>f.type==="application/pdf"); await preparePDFs(); await render(); };

/* =========================
   PREVIEW
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
   BILD KOMPRIMIERUNG
========================= */
async function compressImagesInPDF(file, quality = 0.6) {
  const pdfDoc = await PDFLib.PDFDocument.load(await file.arrayBuffer());
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const images = page.node.Resources?.XObject || {};
    for (const key of Object.keys(images)) {
      try {
        const xobj = pdfDoc.context.lookup(images[key]);
        if (!xobj || xobj.dict?.get("Subtype")?.name !== "Image") continue;

        const rawBytes = xobj.getBytes();
        const img = new Image();
        img.src = URL.createObjectURL(new Blob([rawBytes]));

        await new Promise(res => { img.onload = res; });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        const newImage = await pdfDoc.embedJpg(compressedDataUrl);
        page.node.Resources.XObject.set(key, newImage.ref);
      } catch(e){ console.warn("Bild konnte nicht komprimiert werden:", e); }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

/* =========================
   RENDER / HYBRID KOMPRESSION
========================= */
async function render() {
  zipFiles = [];
  for (const item of pdfItems) {
    const { file, infoDiv, downloadLink } = item;
    const quality = qualityInput ? qualityInput.value / 100 : 0.6;

    infoDiv.textContent = "Komprimiere Bilder…";
    try {
      const blob = await compressImagesInPDF(file, quality);
      const origKB = (file.size/1024).toFixed(1);
      const newKB = (blob.size/1024).toFixed(1);
      infoDiv.textContent = `Hybrid-Kompression: ${origKB} KB → ${newKB} KB`;

      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = file.name;

      zipFiles.push({ name: file.name, blob });
    } catch(err){
      infoDiv.textContent = "Fehler bei der Verarbeitung";
      console.error(err);
    }
  }
}

/* =========================
   ZIP DOWNLOAD
========================= */
zipBtn.onclick = async () => {
  if (!zipFiles.length) return;
  const zip = new JSZip();
  zipFiles.forEach(f=>zip.file(f.name, f.blob));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pdf-komprimiert.zip";
  a.click();
};
