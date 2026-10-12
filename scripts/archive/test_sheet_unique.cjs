const XLSX = require('xlsx');
async function test() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const sheet = workbook.Sheets['Activación por Cliente'];
  const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
  const clients = new Set();
  const codigos = new Set();
  for(let i=1; i<json.length; i++) {
    const row = json[i];
    if(row && row[1]) clients.add(row[1]);
    if(row && row[0]) codigos.add(row[0]);
  }
  console.log("Unique RAZON SOCIAL:", clients.size);
  console.log("Unique CODIGO:", codigos.size);
}
test();
