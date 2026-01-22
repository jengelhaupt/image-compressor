// Lädt image-q lokal (liegt z.B. im /libs/ Ordner)
importScripts('libs/image-q.min.js');

self.onmessage = async (e) => {
    const { type, file, colors = 256 } = e.data;

    if (type === "compress_png") {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const imgBitmap = await createImageBitmap(new Blob([arrayBuffer]));

            // Canvas erstellen
            const canvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgBitmap, 0, 0);

            // Pixel auslesen
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const rgbaArray = Array.from(imgData.data);

            // image-q Quantisierung
            const iq = window.imageQ; // image-q sollte global verfügbar sein
            const pointArray = iq.utils.PointContainer.fromUint8Array(imgData.data, canvas.width, canvas.height);
            const distance = new iq.distance.EuclideanBT709NoAlpha();
            const palette = iq.quantization.NeuralQuant.quantizeSync(pointArray, colors);
            const dithered = iq.image.quantizeSync(pointArray, palette, distance);

            // Zurück auf Canvas
            const outData = new Uint8ClampedArray(dithered.toUint8Array());
            const outImage = new ImageData(outData, canvas.width, canvas.height);
            ctx.putImageData(outImage, 0, 0);

            // Blob erzeugen
            const outBlob = await canvas.convertToBlob({ type: 'image/png' });

            self.postMessage(outBlob);
        } catch (err) {
            console.error("Worker PNG compression failed:", err);
            self.postMessage(file); // fallback: Original zurückgeben
        }
    }
};
