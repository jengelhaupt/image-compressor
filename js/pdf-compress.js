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
let originalFiles = []; // Original-PDFs sichern
let pdfItems = [];
let zipFiles = [];

/* =========================
   SLIDER
========================= */
if (qualityInput && qualityLabel) {
  qualityLabel.textContent = qualityInput.value;
  qualityInput.oninput = async () => {
    qualityLabel.textContent = qualityInput.value;
    if (originalFiles.length > 0) await render(); // live rendern
  };
}

/* =========================
   DRAG & DROP / FILE INPUT
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
  originalFiles = [...e.dataTransfer.files].filter(f => f.type === "application/pdf"); 
  await preparePDFs(); 
  await render(); 
};

fileInput.onchange = async e => { 
  originalFiles = [...e.target.files].filter(f => f.type === "application/pdf"); 
  await preparePDFs(); 
  await render(); 
};

/* =========================
   PREVIEW
========================= */
async function preparePDFs() {
  preview.innerHTML = "";
  pdfItems = [];
  for (const file of originalFiles) {
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
   HELPER: Raster-Scale aus Slider
========================= */
function getRasterScale(quality) {
  switch (parseInt(quality)) {
    case 80: return 2.7; // ~200dpi
    case 70: return 2.0; // ~150dpi
    case 60: return 1.6; // ~120dpi
    case 50: return 1.3; // ~100dpi
    case 40: return 1.2; // ~90dpi
    case 30: return 1.0; // ~72dpi
    default: return 1.0; // Hybrid oder 90+
  }
}

/* =========================
   KOMPRESSION / HYBRID
========================= */
async function compressPDF(file, quality) {
  if (quality >= 90) {
    // Hybrid: Text bleibt Text, Bilder leicht komprimiert
    const pdfBytes = await file.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);

    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const xobjects = page.node.Resources?.XObject || {};
      for (const key of Object.keys(xobjects)) {
        try {
          const xobj = pdfDoc.context.lookup(xobjects[key]);
          if (!xobj || xobj.dict?.get("Subtype")?.name !== "Image") continue;

          const rawBytes = xobj.getBytes();
          const img = new Image();
          img.src = URL.createObjectURL(new Blob([rawBytes]));
          await new Promise(res => img.onload = res);

          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          const compressed = canvas.toDataURL("image/jpeg", 0.9); // leicht komprimiert
          const newImage = await pdfDoc.embedJpg(compressed);
          page.node.Resources.XObject.set(key, newImage.ref);
        } catch(e) {
          console.warn("Bild konnte nicht komprimiert werden:", e);
        }
      }
    }

    const outBytes = await pdfDoc.save();
    return new Blob([outBytes], { type: "application/pdf" });
  } else {
    // Raster-Modus: Text + Bilder rastern
    const scale = getRasterScale(quality);
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const newPdf = await PDFLib.PDFDocument.create();

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      const imgData = canvas.toDataURL("image/jpeg", 0.9);
      const jpg = await newPdf.embedJpg(imgData);
      const newPage = newPdf.addPage([canvas.width, canvas.height]);
      newPage.drawImage(jpg, { x:0, y:0, width:canvas.width, height:canvas.height });
    }

    const outBytes = await newPdf.save();
    return new Blob([outBytes], { type: "application/pdf" });
  }
}

/* =========================
   RENDER / KOMPRIMIERUNG
========================= */
async function render() {
  zipFiles = [];
  const quality = qualityInput ? parseInt(qualityInput.value) : 90;

  for (let i = 0; i < originalFiles.length; i++) {
    const file = originalFiles[i];
    const { infoDiv, downloadLink } = pdfItems[i];

    infoDiv.textContent = "Komprimiere…";

    try {
      const blob = await compressPDF(file, quality);
      const origKB = (file.size/1024).toFixed(1);
      const newKB = (blob.size/1024).toFixed(1);
      infoDiv.textContent = `Größe: ${origKB} KB → ${newKB} KB`;

      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = file.name;

      zipFiles.push({ name: file.name, blob });
    } catch(err) {
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
  zipFiles.forEach(f => zip.file(f.name, f.blob));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pdf-komprimiert.zip";
  a.click();
};
