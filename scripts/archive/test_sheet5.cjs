const XLSX = require('xlsx');
async function test() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const sheet = workbook.Sheets['Activación por Cliente'];
  if (sheet) {
    const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
    console.log("Headers:", json[0]);
    console.log("Row 1:", json[1]);
  }
}
test();
