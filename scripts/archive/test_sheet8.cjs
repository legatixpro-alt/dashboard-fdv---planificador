const XLSX = require('xlsx');
async function test() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const sheet = workbook.Sheets['Activación por Cliente'];
  const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
  let maxCols = 0;
  for(let i=0; i<json.length; i++) {
     if(json[i].length > maxCols) maxCols = json[i].length;
  }
  console.log("Max cols in Activación por Cliente:", maxCols);
  
  // also let's look at Grid de Activación por Vendedor if there are hidden columns
  const gridSheet = workbook.Sheets['Grid de Activación por Vendedor'];
  const gridJson = XLSX.utils.sheet_to_json(gridSheet, {header: 1});
  let maxColsGrid = 0;
  for(let i=0; i<gridJson.length; i++) {
     if(gridJson[i].length > maxColsGrid) maxColsGrid = gridJson[i].length;
  }
  console.log("Max cols in Grid:", maxColsGrid);
  
  if (gridJson.length > 2) {
      console.log("Grid row 2:", gridJson[2]);
  }
}
test();
