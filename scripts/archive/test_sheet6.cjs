const XLSX = require('xlsx');
async function test() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const sheet = workbook.Sheets['Activación por Cliente'];
  const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
  console.log("Headers full:", json[0]);
  for(let i=0; i<10; i++) {
     if(json[i].length > 8) {
       console.log("Row with >8 cols:", json[i]);
       break;
     }
  }
}
test();
