const fs = require('fs');

let content = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

const importStr = "import { insertIncident } from '../services/insertIncident';\n";

if (!content.includes('import { insertIncident }')) {
  // Add it after the supabase import
  content = content.replace(
    "import { supabase, hasValidSupabaseConfig } from '../lib/supabase';",
    "import { supabase, hasValidSupabaseConfig } from '../lib/supabase';\n" + importStr
  );
}

const targetStr = `  const guardarIncidencia = async () => {
    if (!legalAceptado || !clienteEncontrado || !tipoIncidencia) {
      setErrorMessage("Por favor complete los campos obligatorios (Cliente, Tipo de incidencia y Aceptar declaración).");
      return;
    }

    if (!hasValidSupabaseConfig) {
      setErrorMessage("Faltan las credenciales de Supabase (URL o KEY) en las variables de entorno.");
      return;
    }

    setErrorMessage('');
    setIsSaving(true);
    
    try {
      // Re-fetch next correlativo right before saving to minimize race conditions
      const { data: latestData } = await supabase
        .from('incidencias')
        .select('correlativo')
        .order('correlativo', { ascending: false })
        .limit(1);
        
      let nextCorrelativo = '0001';
      if (latestData && latestData.length > 0) {
        nextCorrelativo = String(parseInt(latestData[0].correlativo, 10) + 1).padStart(4, '0');
      }

      const payload = {
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

      if (error) {
        console.error("Error saving:", error);
        setErrorMessage("Error al guardar en la base de datos.");
      } else {
        setLegalAceptado(false);
        setTipoIncidencia('');
        setNivelImpacto('Baja');
        setCodigoCliente('');
        setClienteEncontrado(null);
        setFactura('');
        setProductos([{ id: 1, codigo: '', nombre: '', cantidad: '' }]);
        limpiarCanvas();
        setActiveTab('historial');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Error de red al conectar con la base de datos.");
    } finally {
      setIsSaving(false);
    }
  };`;

const newStr = `  const guardarIncidencia = async () => {
    if (!legalAceptado || !clienteEncontrado || !tipoIncidencia) {
      setErrorMessage("Por favor complete los campos obligatorios (Cliente, Tipo de incidencia y Aceptar declaración).");
      return;
    }

    if (!hasValidSupabaseConfig) {
      setErrorMessage("Faltan las credenciales de Supabase (URL o KEY) en las variables de entorno.");
      return;
    }

    setErrorMessage('');
    setIsSaving(true);
    
    try {
      const payload = {
        vendedor_id: vendedorId,
        cliente_ruc: clienteEncontrado.ruc,
        razon_social: clienteEncontrado.razonSocial,
        tipo_incidencia: tipoIncidencia,
        nivel_impacto: nivelImpacto,
      };

      const { data, error } = await insertIncident(payload);

      if (error) {
        console.error("Error saving:", error);
        setErrorMessage("Error al guardar en la base de datos.");
      } else {
        setLegalAceptado(false);
        setTipoIncidencia('');
        setNivelImpacto('Baja');
        setCodigoCliente('');
        setClienteEncontrado(null);
        setFactura('');
        setProductos([{ id: 1, codigo: '', nombre: '', cantidad: '' }]);
        limpiarCanvas();
        setActiveTab('historial');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Error de red al conectar con la base de datos.");
    } finally {
      setIsSaving(false);
    }
  };`;

content = content.replace(targetStr, newStr);

fs.writeFileSync('src/components/Incidencias.tsx', content);
console.log('Done');
