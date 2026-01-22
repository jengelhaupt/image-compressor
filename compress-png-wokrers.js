importScripts('https://cdn.jsdelivr.net/npm/image-q@1.1.0/dist/image-q.min.js');

self.onmessage = async function(e) {
  const { type, id, data, quality } = e.data;

  if (type === 'compress_png') {
    try {
      const uint8array = new Uint8Array(data);
      const blob = new Blob([uint8array], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      // === Quantisierung mit image-q ===
      const pointContainer = iq.utils.PointContainer.fromImageData(imageData);
      const distance = iq.distance.EuclideanBT709NoAlpha;
      const palette = iq.buildPalette(pointContainer, {
        colors: quality || 256,
        method: 2, // NeuQuant
        distance
      });
      const quantized = iq.applyPalette(pointContainer, palette, distance);

      // === zurück zu ImageData ===
      const resultImageData = quantized.toImageData();

      // === PNG mit Canvas → Blob ===
      const offscreen = new OffscreenCanvas(resultImageData.width, resultImageData.height);
      const ctx2 = offscreen.getContext('2d');
      ctx2.putImageData(resultImageData, 0, 0);

      const compressedBlob = await offscreen.convertToBlob({ type: 'image/png', quality: 1 });

      const arrayBuffer = await compressedBlob.arrayBuffer();

      self.postMessage({
        type: 'compress_result',
        id,
        success: true,
        data: new Uint8Array(arrayBuffer),
        mimeType: 'image/png',
        originalSize: uint8array.length,
        compressedSize: arrayBuffer.byteLength,
        compressedColors: quality
      }, [arrayBuffer]);

    } catch (err) {
      self.postMessage({
        type: 'compress_result',
        id,
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }
};
