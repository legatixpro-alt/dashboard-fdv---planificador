const fs = require('fs');
let content = fs.readFileSync('src/services/googleSheetsService.ts', 'utf8');

content = content.replace(
  /catch \(error\) \{\n    console\.error\(error\);\n    return \[\];\n  \}/g,
  `catch (error: any) {
    if (error.message && error.message.includes('Failed to fetch')) {
      console.warn("API offline or network error.");
    } else {
      console.error(error);
    }
    return [];
  }`
);

fs.writeFileSync('src/services/googleSheetsService.ts', content);
