const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

const targetStr = `      const { error } = await supabase
        .from('incidencias')
        .insert([{
          correlativo: nextCorrelativo,
          vendedor_id: vendedorId,
          cliente_ruc: clienteEncontrado.ruc,
          tipo_incidencia: tipoIncidencia,
          nivel_impacto: nivelImpacto,
          estado: 'En Proceso',
          fecha_carga: new Date().toISOString()
        }]);

      if (error) {`;

const newStr = `      const payload = {
        correlativo: nextCorrelativo,
        vendedor_id: vendedorId,
        cliente_ruc: clienteEncontrado.ruc,
        razon_social: clienteEncontrado.razonSocial,
        tipo_incidencia: tipoIncidencia,
        nivel_impacto: nivelImpacto,
        estado: 'En Proceso',
        fecha_carga: new Date().toISOString()
      };

      // 1. Guardar en Supabase
      const { error } = await supabase
        .from('incidencias')
        .insert([payload]);

      // 2. Enviar a Google Sheets (si el Webhook está configurado)
      try {
        const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
        if (webhookUrl && !error) {
          fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors', // Evita problemas de CORS con Apps Script
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
          }).catch(err => console.error('Error enviando a Google Sheets:', err));
        }
      } catch (e) {
        console.error('Webhook error:', e);
      }

      if (error) {`;

code = code.replace(targetStr, newStr);
fs.writeFileSync('src/components/Incidencias.tsx', code);
