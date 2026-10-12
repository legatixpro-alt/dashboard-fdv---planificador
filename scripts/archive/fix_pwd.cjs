const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

// Trim password input to avoid invisible spaces issue during typing/pasting
app = app.replace(
  "if (authPassword !== 'codi.123') {", 
  "if (authPassword.trim() !== 'codi.123') {"
);

fs.writeFileSync('src/App.tsx', app);
