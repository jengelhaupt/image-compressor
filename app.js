const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

const jpgQ = document.getElementById("jpgQ");
const jpgVal = document.getElementById("jpgVal");

let files = [];
let zipFiles = [];

/* Slider */
jpgQ.oninput = () => {
    jpgVal.textContent = jpgQ.value;
    render();
};

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

/* Render */
async function render() {
    preview.innerHTML = "";
    zipFiles = [];

    for (const file of files) {
        if (!file.type.startsWith("image/jpeg")) continue;

        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const quality = jpgQ.value / 100;
        const blob = await new Promise(r =>
            canvas.toBlob(r, "image/jpeg", quality)
        );

        zipFiles.push({ name: file.name, blob });

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
                <a class="download" download="${file.name}"
                   href="${URL.createObjectURL(blob)}">
                   Einzeln herunterladen
                </a>
            </div>
        `;
    }
}

/* ZIP Download */
zipBtn.onclick = async () => {
    if (!zipFiles.length) return;

    const zip = new JSZip();
    zipFiles.forEach(f => zip.file(f.name, f.blob));

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jpg-komprimiert.zip";
    a.click();
};
