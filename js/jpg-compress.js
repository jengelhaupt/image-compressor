/* =====================================================
   ELEMENTS
===================================================== */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const qualityInput = document.getElementById("jpgQ");
const qualityLabel = document.getElementById("jpgVal");

/* =====================================================
   STATE
===================================================== */

let files = [];
let images = [];
let previewItems = [];
let zipFiles = [];

/* =====================================================
   QUALITY CONTROL
===================================================== */

qualityLabel.textContent = qualityInput.value;

qualityInput.oninput = () => {
  qualityLabel.textContent = qualityInput.value;
};

qualityInput.onchange = () => render();

/* =====================================================
   DROPZONE
===================================================== */

dropzone.onclick = () => fileInput.click();

dropzone.ondragover = (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
};

dropzone.ondragleave = () => {
  dropzone.classList.remove("dragover");
};

dropzone.ondrop = async (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");

  files = [...e.dataTransfer.files];
  await prepareImages();
  await render();
};

/* =====================================================
   FILE INPUT
===================================================== */

fileInput.onchange = async (e) => {
  files = [...e.target.files];
  await prepareImages();
  await render();
};

/* =====================================================
   PREPARE IMAGES
===================================================== */

async function prepareImages() {

  images = [];
  previewItems = [];
  preview.innerHTML = "";

  for (const file of files) {

    if (!file.type.match(/jpeg/)) continue;

    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();

    images.push({ file, img });

    const container = document.createElement("div");
    container.className = "previewItem";

    const originalImg = document.createElement("img");
    originalImg.src = img.src;

    const compressedImg = document.createElement("img");

    const info = document.createElement("div");
    info.className = "info";

    const download = document.createElement("a");
    download.className = "download";
    download.textContent = "Download";

    container.append(originalImg, compressedImg, info, download);
    preview.appendChild(container);

    previewItems.push({ compressedImg, info, download });
  }
}

/* =====================================================
   RENDER
===================================================== */

async function render() {

  if (!images.length) return;

  zipFiles = [];

  const qPercent = Number(qualityInput.value);
  const quality = Math.min(0.99, Math.pow(qPercent / 100, 1.3));

  await Promise.all(
    images.map((imgObj, i) =>
      new Promise((resolve) => {

        const worker = new Worker("jpg-worker.js");

        worker.onmessage = (e) => {

          const blob = e.data.blob;
          const file = imgObj.file;
          const p = previewItems[i];

          const url = URL.createObjectURL(blob);

          p.compressedImg.src = url;
          p.download.href = url;
          p.download.download = file.name;

          const saved = 100 - (blob.size / file.size) * 100;

          p.info.textContent =
            `Original ${(file.size/1024).toFixed(1)} KB → ` +
            `Neu ${(blob.size/1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;

          zipFiles.push({ name: file.name, blob });

          worker.terminate();
          resolve();
        };

        worker.postMessage({
          file: imgObj.file,
          quality,
          qPercent
        });

      })
    )
  );

  preview.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =====================================================
   ZIP
===================================================== */

zipBtn.onclick = async () => {

  if (!zipFiles.length) return;

  const zip = new JSZip();
  zipFiles.forEach((f) => zip.file(f.name, f.blob));

  const blob = await zip.generateAsync({ type: "blob" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "jpg-komprimiert.zip";
  a.click();
};
