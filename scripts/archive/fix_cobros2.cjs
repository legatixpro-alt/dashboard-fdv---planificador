const fs = require('fs');
let code = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

const replacement = `
          const res = await fetch(\`/api/client-lookup?codigo=\${codigoCliente}\`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.nombre) {
               setNombreCliente(data.nombre);
               setDireccionCliente(data.direccion || 'No especificada');
               setRucCliente(data.ruc || data.codigo || 'No especificado');
               setAlertMsg({ type: 'success', text: \`Cliente encontrado: \${data.nombre}\` });
               setTimeout(() => setAlertMsg(null), 3000);
            } else if (CLIENTES_MOCK[codigoCliente]) {
               setNombreCliente(CLIENTES_MOCK[codigoCliente].razonSocial);
               setDireccionCliente(CLIENTES_MOCK[codigoCliente].direccion);
               setRucCliente(CLIENTES_MOCK[codigoCliente].ruc);
               setAlertMsg({ type: 'success', text: \`Cliente encontrado: \${CLIENTES_MOCK[codigoCliente].razonSocial}\` });
               setTimeout(() => setAlertMsg(null), 3000);
            } else {
               setNombreCliente('');
               setDireccionCliente('');
               setRucCliente('');
            }
          } else {
            if (CLIENTES_MOCK[codigoCliente]) {
               setNombreCliente(CLIENTES_MOCK[codigoCliente].razonSocial);
               setDireccionCliente(CLIENTES_MOCK[codigoCliente].direccion);
               setRucCliente(CLIENTES_MOCK[codigoCliente].ruc);
               setAlertMsg({ type: 'success', text: \`Cliente encontrado: \${CLIENTES_MOCK[codigoCliente].razonSocial}\` });
               setTimeout(() => setAlertMsg(null), 3000);
            } else {
               setNombreCliente('');
               setDireccionCliente('');
               setRucCliente('');
            }
          }
`;

code = code.replace(/const res = await fetch.*?console\.error\("Error fetching client", e\);\s*\}/s, replacement + `\n        } catch (e) {\n          console.error("Error fetching client", e);\n        }`);

// also fix the final else block
code = code.replace(/\} else \{\s*setNombreCliente\(''\);\s*\}/, "} else {\n      setNombreCliente('');\n      setDireccionCliente('');\n      setRucCliente('');\n    }");

fs.writeFileSync('src/components/CobrosOCR.tsx', code);
