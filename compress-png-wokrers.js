// compress-png-wokrers.js

importScripts('https://free-img-compressor.de/libs/image-q.min.js');

self.onmessage = async (e) => {
    const { file, colors } = e.data;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = async () => {
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // quantize über image-q
            const iq = self.IQ; // <--- UMD stellt IQ global bereit
            const pointContainer = iq.utils.PointContainer.fromCanvas(canvas);
            const distance = new iq.distance.Euclidean();
            const palette = new iq.buildPalette(
                pointContainer, { colors }
            );
            const quantized = iq.applyPalette(pointContainer, palette, distance);
            const outCanvas = quantized.toCanvas();

            const blob = await outCanvas.convertToBlob({ type: 'image/png' });
            self.postMessage(blob);
        };
    } catch (err) {
        self.postMessage({ error: err.message });
    }
};
