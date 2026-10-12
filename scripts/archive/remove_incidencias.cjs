const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Remove import { Incidencias }
content = content.replace(/import { Incidencias } from '\.\/components\/Incidencias';\n/, '');

// Remove ShieldAlert from lucide-react if present and not used elsewhere
// Though it's safer to just let it be, let's remove it if we can
content = content.replace(/, ShieldAlert/, '');

// Remove TabId INCIDENCIAS
content = content.replace(/ \| 'INCIDENCIAS'/, '');

// Change default activeTab
content = content.replace(/useState<TabId>\('INCIDENCIAS'\)/, "useState<TabId>('ACTIVACION_RUBRO')");

// Remove tab definition
content = content.replace(/\s*\{ id: 'INCIDENCIAS' as TabId, label: 'Incidencias', icon: ShieldAlert \},/, '');

// Remove activeTab conditions
content = content.replace(/&& activeTab !== 'INCIDENCIAS' /, '');

// Remove the render block
const renderBlockRegex = /\{\s*activeTab === 'INCIDENCIAS' && \([\s\S]*?<Incidencias.*?\/>\s*\)\s*\}/;
content = content.replace(renderBlockRegex, '');

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx updated');
