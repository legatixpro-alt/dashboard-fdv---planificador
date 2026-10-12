const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "import { fetchVolumenData, fetchActivacionData } from './services/googleSheetsService';",
  "import { fetchVolumenData, fetchActivacionData, fetchMetasActivacion } from './services/googleSheetsService';"
);

code = code.replace(
  "const [activacionData, setActivacionData] = useState<ActivacionData[]>([]);",
  "const [activacionData, setActivacionData] = useState<any[]>([]);\n  const [metasActivacion, setMetasActivacion] = useState<any[]>([]);"
);

code = code.replace(
  "const [vol, act] = await Promise.all([",
  "const [vol, act, metas] = await Promise.all(["
);

code = code.replace(
  "fetchActivacionData()",
  "fetchActivacionData(),\n        fetchMetasActivacion()"
);

code = code.replace(
  "setActivacionData(act);",
  "setActivacionData(act);\n      setMetasActivacion(metas);"
);

code = code.replace(
  "<ActivacionRubro \n              filteredVolumen={filteredVolumen} \n              filteredActivacion={filteredActivacion} \n            />",
  "<ActivacionRubro \n              filteredVolumen={filteredVolumen} \n              filteredActivacion={filteredActivacion} \n              metasActivacion={metasActivacion} \n            />"
);

fs.writeFileSync('src/App.tsx', code);
