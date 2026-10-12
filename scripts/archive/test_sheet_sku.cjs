const XLSX = require('xlsx');
async function test() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const sheet = workbook.Sheets['Volumen por SKU'];
  const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
  console.log("Volumen por SKU headers:", json[0]);
  console.log("Volumen por SKU Row 1:", json[1]);
  console.log("Volumen por SKU Row 2:", json[2]);
}
test();
