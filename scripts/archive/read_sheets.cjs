const XLSX = require('xlsx');
const workbook = XLSX.readFile('sheet.xlsx');
console.log("Sheets:", workbook.SheetNames);
for (const name of workbook.SheetNames) {
  console.log("---", name, "---");
  const sheet = workbook.Sheets[name];
  const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
  for(let i=0; i<Math.min(5, json.length); i++) {
     console.log(json[i]);
  }
}
