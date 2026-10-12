const fs = require('fs');
let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');
console.log(content.includes('const [activeTab, setActiveTab] = useState'));
