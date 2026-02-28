/* =====================================================
   IMAGE WORKER
   ===================================================== */

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function smoothChromaYCbCr(d, w, h, strength) {
  const radius = strength > 0.25 ? 2 : 1;

  const yArr = new Float32Array(w * h);
  const cbArr = new Float32Array(w * h);
  const crArr = new Float32Array(w * h);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    yArr[p]  = 0.299 * r + 0.587 * g + 0.114 * b;
    cbArr[p] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    crArr[p] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
  }

  const cbCopy = new Float32Array(cbArr);
  const crCopy = new Float32Array(crArr);

  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {

      let sumCb = 0, sumCr = 0, count = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const idx = (y + dy) * w + (x + dx);
          sumCb += cbCopy[idx];
          sumCr += crCopy[idx];
          count++;
        }
      }

      const i = y * w + x;

      const isRed = crCopy[i] > 150 && cbCopy[i] < 120;
      const localStrength = isRed
        ? Math.min(0.6, strength * 1.8)
        : strength;

      cbArr[i] =
        cbCopy[i] * (1 - localStrength) +
        (sumCb / count) * localStrength;

      crArr[i] =
        crCopy[i] * (1 - localStrength) +
        (sumCr / count) * localStrength;
    }
  }

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const y  = yArr[p];
    const cb = cbArr[p];
    const cr = crArr[p];

    d[i]     = clamp(y + 1.402 * (cr - 128));
    d[i + 1] = clamp(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128));
    d[i + 2] = clamp(y + 1.772 * (cb - 128));
  }
}

function addDither(d, amount) {
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * amount;
    d[i]     = clamp(d[i] + noise);
    d[i + 1] = clamp(d[i + 1] + noise);
    d[i + 2] = clamp(d[i + 2] + noise);
  }
}

self.onmessage = async (e) => {
  const { file, quality, qPercent } = e.data;

  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(bitmap, 0, 0);

  const w = canvas.width;
  const h = canvas.height;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  if (qPercent < 80) {
    const strength = Math.min(0.4, (80 - qPercent) / 90);
    smoothChromaYCbCr(d, w, h, strength);
  }

  if (qPercent < 75) {
    addDither(d, 0.8);
  }

  ctx.putImageData(img, 0, 0);

  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality
  });

  self.postMessage({ blob });
};
