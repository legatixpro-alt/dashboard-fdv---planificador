const XLSX = require('xlsx');
async function test() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const response = await fetch(url, { cache: 'no-store' });
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const sheet = workbook.Sheets['Activación por Cliente'];
  const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
  console.log("Row 0:", json[0]);
  let max = 0;
  for(let r of json) if(r && r.length>max) max=r.length;
  console.log("Max cols:", max);
}
test();
