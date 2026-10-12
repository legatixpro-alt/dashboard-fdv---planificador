const XLSX = require('xlsx');
const workbook = XLSX.readFile('sheet.xlsx');
const sheet = workbook.Sheets['Activación por Cliente'];
const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
console.log(json[0]);
console.log(json[1]);
console.log(json[2]);
