const XLSX = require('xlsx');
async function test() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const sheet = workbook.Sheets['Activación por Cliente'];
  const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
  console.log("Activación por Cliente total rows:", json.length);
  
  let totalCartera = 0;
  const gridSheet = workbook.Sheets['Grid de Activación por Vendedor'];
  const gridJson = XLSX.utils.sheet_to_json(gridSheet, {header: 1});
  for(let i=2; i<gridJson.length; i++) {
    totalCartera += Number(gridJson[i][1]) || 0;
  }
  console.log("Total cartera from grid:", totalCartera);
}
test();
