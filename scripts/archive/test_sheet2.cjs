const XLSX = require('xlsx');
async function test() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const gridSheet = workbook.Sheets['Grid de Activación por Vendedor'];
  if (gridSheet) {
    const gridJson = XLSX.utils.sheet_to_json(gridSheet, {header: 1});
    console.log("Headers:", gridJson[0]);
    console.log("Subheaders:", gridJson[1]);
    console.log("Row 2:", gridJson[2]);
    console.log("Row 3:", gridJson[3]);
  }
}
test();
