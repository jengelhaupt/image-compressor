/* compress-png-worker.js - klassischer Worker */

importScripts('libs/image-q.min.js'); // <-- Pfad zu deiner lokalen Kopie von image-q

self.onmessage = async function(e) {
    const { file, colors = 256 } = e.data;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = async () => {
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // image-q nutzt RGBA-Array
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pointContainer = iq.utils.PointContainer.fromImageData(imageData);

            const distance = new iq.distance.Euclidean();
            const palette = iq.buildPalette(pointContainer, { colors, method: 2, distance });
            const quantized = iq.applyPalette(pointContainer, palette, { method: 2, distance });

            const outData = quantized.toImageData();
            ctx.putImageData(outData, 0, 0);

            const blob = await canvas.convertToBlob({ type: 'image/png' });

            self.postMessage(blob);
        };

        img.onerror = (err) => {
            self.postMessage({ error: 'Failed to load image' });
        };
    } catch (err) {
        self.postMessage({ error: err.message });
    }
};
