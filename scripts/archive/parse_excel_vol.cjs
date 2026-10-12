const XLSX = require('xlsx');

async function parse() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, {type: 'array'});
  const volSheet = workbook.Sheets['Volumen por SKU'];
  const volJson = XLSX.utils.sheet_to_json(volSheet, {header: 1});
  
  console.log(volJson[0].slice(0, 10));
  console.log(volJson[1].slice(0, 10));
  console.log(volJson[2].slice(0, 10));
}

parse();
