/* =====================================================
   IMAGE PROCESSING HELPERS
===================================================== */

function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rgbToYCbCr(r, g, b) {
    return {
        y:  0.299 * r + 0.587 * g + 0.114 * b,
        cb: -0.168736 * r - 0.331264 * g + 0.5 * b + 128,
        cr:  0.5 * r - 0.418688 * g - 0.081312 * b + 128
    };
}

function yCbCrToRgb(y, cb, cr) {
    return {
        r: clamp(y + 1.402 * (cr - 128)),
        g: clamp(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)),
        b: clamp(y + 1.772 * (cb - 128))
    };
}

/* =====================================================
   ROT-ADAPTIVES CHROMA SMOOTHING
===================================================== */

function smoothChromaYCbCr(imageData, strength) {

    const d = imageData.data;
    const w = imageData.width;
    const h = imageData.height;

    const radius = strength > 0.25 ? 2 : 1;

    const yArr = new Float32Array(w * h);
    const cbArr = new Float32Array(w * h);
    const crArr = new Float32Array(w * h);

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const { y, cb, cr } = rgbToYCbCr(d[i], d[i + 1], d[i + 2]);
        yArr[p] = y;
        cbArr[p] = cb;
        crArr[p] = cr;
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
        const { r, g, b } = yCbCrToRgb(yArr[p], cbArr[p], crArr[p]);
        d[i]     = r;
        d[i + 1] = g;
        d[i + 2] = b;
    }
}

/* =====================================================
   DITHER
===================================================== */

function addDither(imageData, amount = 0.8) {

    const d = imageData.data;

    for (let i = 0; i < d.length; i += 4) {

        const noise = (Math.random() - 0.5) * amount;

        d[i]     = clamp(d[i] + noise);
        d[i + 1] = clamp(d[i + 1] + noise);
        d[i + 2] = clamp(d[i + 2] + noise);
    }
}

/* =====================================================
   WORKER MESSAGE HANDLER
===================================================== */

self.onmessage = async function (e) {

    if (!e.data) return;

    const { file, quality } = e.data;

    if (!file) {
        self.postMessage({ blob: null });
        return;
    }
