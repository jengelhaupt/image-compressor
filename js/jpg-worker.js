/* =====================================================
   IMAGE PROCESSING WORKER
===================================================== */

self.onmessage = async (e) => {
    try {
        const { id, width, height, data, quality, qPercent } = e.data;
        const imgData = new ImageData(new Uint8ClampedArray(data), width, height);

        const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

        function rgbToYCbCr(r,g,b){return{y:0.299*r+0.587*g+0.114*b,cb:-0.168736*r-0.331264*g+0.5*b+128,cr:0.5*r-0.418688*g-0.081312*b+128};}
        function yCbCrToRgb(y,cb,cr){return{r:clamp(y+1.402*(cr-128)),g:clamp(y-0.344136*(cb-128)-0.714136*(cr-128)),b:clamp(y+1.772*(cb-128))};}

        function smoothChromaYCbCr(d, w, h, strength){
            const yArr=new Float32Array(w*h),cbArr=new Float32Array(w*h),crArr=new Float32Array(w*h);
            for(let i=0,p=0;i<d.data.length;i+=4,p++){const {y,cb,cr}=rgbToYCbCr(d.data[i],d.data[i+1],d.data[i+2]);yArr[p]=y;cbArr[p]=cb;crArr[p]=cr;}
            const cbCopy=cbArr.slice(),crCopy=crArr.slice(),radius=strength>0.25?2:1;
            for(let y=radius;y<h-radius;y++)for(let x=radius;x<w-radius;x++){let sumCb=0,sumCr=0,count=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const idx=(y+dy)*w+x+dx;sumCb+=cbCopy[idx];sumCr+=crCopy[idx];count++;}const i=y*w+x;const isRed=crCopy[i]>150&&cbCopy[i]<120;const localStrength=isRed?Math.min(0.6,strength*1.8):strength;cbArr[i]=cbCopy[i]*(1-localStrength)+(sumCb/count)*localStrength;crArr[i]=crCopy[i]*(1-localStrength)+(sumCr/count)*localStrength;}
            for(let i=0,p=0;i<d.data.length;i+=4,p++){const {r,g,b}=yCbCrToRgb(yArr[p],cbArr[p],crArr[p]);d.data[i]=r;d.data[i+1]=g;d.data[i+2]=b;}
            return d;
        }

        function addDither(d){
            for(let i=0;i<d.data.length;i+=4){const noise=(Math.random()-0.5)*0.8;d.data[i]+=noise;d.data[i+1]+=noise;d.data[i+2]+=noise;}
            return d;
        }

        // OffscreenCanvas für Verarbeitung
        const offscreen = new OffscreenCanvas(imgData.width, imgData.height);
        const ctx = offscreen.getContext("2d");
        ctx.putImageData(imgData,0,0);

        if(qPercent<80){
            const strength=Math.min(0.4,(80-qPercent)/90);
            const data=ctx.getImageData(0,0,imgData.width,imgData.height);
            ctx.putImageData(smoothChromaYCbCr(data,imgData.width,imgData.height,strength),0,0);
        }

        if(qPercent<75){
            const data=ctx.getImageData(0,0,imgData.width,imgData.height);
            ctx.putImageData(addDither(data),0,0);
        }

        const blob = await offscreen.convertToBlob({ type:"image/jpeg", quality });

        self.postMessage({ id, blob });
    } catch(err){
        console.error("Worker Fehler:", err);
        self.postMessage({ type:"error", message: err.message, stack: err.stack });
    }
};
