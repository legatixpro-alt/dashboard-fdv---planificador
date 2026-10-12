const fs = require('fs');

let file = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

// Replace:
// const data = await res.json();
// if (!res.ok) throw new Error(data.error || 'Error en OCR');

const oldOcrCheck = `      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en OCR');`;

const newOcrCheck = `
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await res.json();
      } else {
        data = { error: "Servidor respondió con un formato inválido (HTML). Quizá hay un problema de cuota o de red." };
      }
      
      if (!res.ok) throw new Error(data.error || 'Error en OCR');`;

file = file.replace(oldOcrCheck, newOcrCheck);


// Also fix rateRes check:
// const rateData = await rateRes.json();
// if (rateRes.ok && rateData.tasa) {

const oldRateCheck = `        const rateRes = await fetch(\`/api/tasa-bcv?date=\${data.fecha_pago}\`);
        const rateData = await rateRes.json();
        
        if (rateRes.ok && rateData.tasa) {`;

const newRateCheck = `        const rateRes = await fetch(\`/api/tasa-bcv?date=\${data.fecha_pago}\`);
        let rateData = {};
        const rateContentType = rateRes.headers.get("content-type");
        if (rateContentType && rateContentType.indexOf("application/json") !== -1) {
           rateData = await rateRes.json();
        }
        
        if (rateRes.ok && rateData.tasa) {`;

file = file.replace(oldRateCheck, newRateCheck);

fs.writeFileSync('src/components/CobrosOCR.tsx', file);
