const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const zipBtn = document.getElementById("zipBtn");

let files = [];
let zipFiles = [];
let originalImages = [];
let previewItems = [];

/* =========================
   CONTROLS (nur PNG)
========================= */
const controlInput = document.getElementById("pngC");
const controlLabel = document.getElementById("pngVal");

controlInput.oninput = () => {
    controlLabel.textContent = controlInput.value;
    render();
};

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
    files = [...e.dataTransfer.files].filter(f => f.type === "image/png");
    await prepareImages();
    await render();
    requestAnimationFrame(() => {
        preview.scrollIntoView({ behavior: "smooth" });
    });
};

/* =========================
   UPLOAD EVENTS
========================= */
fileInput.onchange = async (e) => {
    files = [...e.target.files].filter(f => f.type === "image/png");
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
        files.map((file) =>
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
   MEDIAN CUT ALGORITHMUS
========================= */
function medianCutQuantize(imageData, maxColors = 256) {
    let pixels = [];
    const data = imageData.data;

    // Speichere alle RGB-Werte als Pixelobjekte
    for (let i = 0; i < data.length; i += 4) {
        pixels.push({
            r: data[i],
            g: data[i + 1],
            b: data[i + 2]
        });
    }

    // Führe den Median Cut Algorithmus aus, um die Farbpalette zu reduzieren
    const colorPalette = medianCut(pixels, maxColors);

    // Ersetze jede Farbe im Bild durch die nächstgelegene Farbe in der reduzierten Palette
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const closestColor = findClosestColor(r, g, b, colorPalette);

        data[i] = closestColor.r;
        data[i + 1] = closestColor.g;
        data[i + 2] = closestColor.b;
    }

    return imageData;
}

// Median Cut Algorithmus
function medianCut(pixels, maxColors) {
    let cubes = [pixels];
    let palette = [];

    while (cubes.length < maxColors) {
        // Zerlege die Farbwürfel weiter, bis wir maxColors erreicht haben
        let maxVarianceCube = findMaxVarianceCube(cubes);
        cubes = splitCube(maxVarianceCube, cubes);
    }

    // Berechne die Durchschnittsfarbe jedes Würfels
    cubes.forEach(cube => {
        let avgColor = calculateAverageColor(cube);
        palette.push(avgColor);
    });

    return palette;
}

// Finde den Würfel mit der größten Farbabweichung (maximale Breite)
function findMaxVarianceCube(cubes) {
    let maxVariance = -1;
    let maxCube = null;

    cubes.forEach(cube => {
        const variance = calculateVariance(cube);
        if (variance > maxVariance) {
            maxVariance = variance;
            maxCube = cube;
        }
    });

    return maxCube;
}

// Berechne die Farbabweichung (Varianz) eines Würfels
function calculateVariance(cube) {
    let rVariance = 0;
    let gVariance = 0;
    let bVariance = 0;

    cube.forEach(pixel => {
        rVariance += Math.pow(pixel.r - mean(cube, 'r'), 2);
        gVariance += Math.pow(pixel.g - mean(cube, 'g'), 2);
        bVariance += Math.pow(pixel.b - mean(cube, 'b'), 2);
    });

    return rVariance + gVariance + bVariance;
}

// Berechne den Durchschnittswert einer Komponente (r, g oder b)
function mean(cube, channel) {
    let sum = 0;
    cube.forEach(pixel => sum += pixel[channel]);
    return sum / cube.length;
}

// Splitte einen Würfel basierend auf der größten Farbabweichung
function splitCube(cube, cubes) {
    let sorted = cube.sort((a, b) => a.r - b.r);
    let median = Math.floor(sorted.length / 2);
    return [sorted.slice(0, median), sorted.slice(median)];
}

// Berechne die Durchschnittsfarbe eines Würfels
function calculateAverageColor(cube) {
    let r = 0, g = 0, b = 0;
    cube.forEach(pixel => {
        r += pixel.r;
        g += pixel.g;
        b += pixel.b;
    });
    return { r: Math.round(r / cube.length), g: Math.round(g / cube.length), b: Math.round(b / cube.length) };
}

// Finde die nächstgelegene Farbe aus der Palette
function findClosestColor(r, g, b, palette) {
    let minDist = Infinity;
    let closestColor = null;

    palette.forEach(color => {
        const dist = Math.pow(color.r - r, 2) + Math.pow(color.g - g, 2) + Math.pow(color.b - b, 2);
        if (dist < minDist) {
            minDist = dist;
            closestColor = color;
        }
    });

    return closestColor;
}

/* =========================
   RENDER PNG-8 - KOMPRESSIEREN UND QUALITÄT
========================= */
async function render() {
    zipFiles = [];
    if (!originalImages.length) return;

    for (let i = 0; i < originalImages.length; i++) {
        const { file, img } = originalImages[i];
        const p = previewItems[i];
        const percent = Number(controlInput.value);

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        // Holen wir uns die Bilddaten
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Wenden wir die Median Cut Farbreduktion an
        imageData = medianCutQuantize(imageData, 256);

        ctx.putImageData(imageData, 0, 0);

        // PNG-8 Konvertierung mit reduzierter Farbpalette und Qualität
        let quality = Math.min(0.99, percent / 100);  // Qualität von 0 bis 1 (100% bis 1%)

        let blob = await new Promise((r) => canvas.toBlob(r, "image/png", quality));

        if (blob.size >= file.size) {
            blob = file;  // Wenn die Qualität das Bild vergrößert, verwenden wir die Originaldatei
        }

        zipFiles.push({ name: file.name, blob });
        p.compressedImg.src = URL.createObjectURL(blob);

        const saved = 100 - (blob.size / file.size) * 100;
        p.infoDiv.textContent = `Original ${(file.size / 1024).toFixed(1)} KB → Neu ${(blob.size / 1024).toFixed(1)} KB (${saved.toFixed(1)}%)`;
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
    a.download = `png-komprimiert.zip`;
    a.click();
};
