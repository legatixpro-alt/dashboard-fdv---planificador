const fs = require('fs');

let file = fs.readFileSync('src/components/SalesAssistant.tsx', 'utf8');

const botImageUrl = "https://i.postimg.cc/gcKn1qV7/Gemini-Generated-Image-3c84n13c84n13c84.jpg";
const imgClassW6 = `w-12 h-12 object-cover rounded-full border-2 border-white`;
const imgClassW5 = `w-8 h-8 object-cover rounded-full border border-indigo-300`;
const imgClassW4 = `w-6 h-6 object-cover rounded-full`;

file = file.replace(
  /\<Bot className="w-6 h-6 hidden group-hover:block" \/\>/g,
  `<img src="${botImageUrl}" className="${imgClassW6} hidden group-hover:block" alt="CodiBot" referrerPolicy="no-referrer" />`
);

file = file.replace(
  /\<Bot className="w-5 h-5" \/\>/g,
  `<img src="${botImageUrl}" className="${imgClassW5}" alt="CodiBot" referrerPolicy="no-referrer" />`
);

file = file.replace(
  /\{msg\.role === 'user' \? \<User className="w-4 h-4" \/\> \: \<Bot className="w-4 h-4" \/\>\}/g,
  `{msg.role === 'user' ? <User className="w-4 h-4" /> : <img src="${botImageUrl}" className="${imgClassW4}" alt="CodiBot" referrerPolicy="no-referrer" />}`
);

file = file.replace(
  /\<Bot className="w-4 h-4" \/\>/g,
  `<img src="${botImageUrl}" className="${imgClassW4}" alt="CodiBot" referrerPolicy="no-referrer" />`
);

fs.writeFileSync('src/components/SalesAssistant.tsx', file);
