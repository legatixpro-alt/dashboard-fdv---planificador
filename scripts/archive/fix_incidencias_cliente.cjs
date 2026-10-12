const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  "  const handleCodigoChange = (e: React.ChangeEvent<HTMLInputElement>) => {\n    const code = e.target.value;\n    setCodigoCliente(code);\n    if (CLIENTES_MOCK[code]) {\n      setClienteEncontrado(CLIENTES_MOCK[code]);\n    } else {\n      setClienteEncontrado(null);\n    }\n  };",
  "  const handleCodigoChange = (e: React.ChangeEvent<HTMLInputElement>) => {\n    setCodigoCliente(e.target.value);\n  };\n\n  useEffect(() => {\n    if (codigoCliente.length >= 2) {\n      const fetchClient = async () => {\n        try {\n          const res = await fetch(`/api/client-lookup?codigo=\${codigoCliente}`);\n          if (res.ok) {\n            const data = await res.json();\n            if (data && data.nombre) {\n              setClienteEncontrado({\n                razonSocial: data.nombre,\n                vendedor: data.vendedor || 'No especificado',\n              });\n            } else {\n              setClienteEncontrado(null);\n            }\n          } else {\n            setClienteEncontrado(null);\n          }\n        } catch (e) {\n          console.error(e);\n        }\n      };\n      const timeoutId = setTimeout(fetchClient, 500);\n      return () => clearTimeout(timeoutId);\n    } else {\n      setClienteEncontrado(null);\n    }\n  }, [codigoCliente]);"
);

code = code.replace(
  "              <p className=\"text-white font-bold mb-1\">{clienteEncontrado.razonSocial}</p>\n              <div className=\"text-sm text-neutral-400 space-y-1\">\n                <p>Parada: {clienteEncontrado.parada}</p>\n                <p>RUC: {clienteEncontrado.ruc}</p>\n                <p>Dirección: {clienteEncontrado.direccion}</p>",
  "              <p className=\"text-white font-bold mb-1\">{clienteEncontrado.razonSocial}</p>\n              <div className=\"text-sm text-neutral-400 space-y-1\">\n                <p>Vendedor: {clienteEncontrado.vendedor}</p>"
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
