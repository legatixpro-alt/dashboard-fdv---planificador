const fs = require('fs');

let file = fs.readFileSync('src/components/SalesAssistant.tsx', 'utf8');

const oldBtn = `<button 
          onClick={handleOpenChat}
          className="fixed bottom-6 right-6 p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-900/50 transition-transform transform hover:scale-105 z-50 flex items-center justify-center group"
          title="Asistente CodiBot"
        >
          <MessageCircle className="w-6 h-6 group-hover:hidden" />
          <img src="https://i.postimg.cc/gcKn1qV7/Gemini-Generated-Image-3c84n13c84n13c84.jpg" className="w-12 h-12 object-cover rounded-full border-2 border-white hidden group-hover:block" alt="CodiBot" referrerPolicy="no-referrer" />
        </button>`;

const newBtn = `<button 
          onClick={handleOpenChat}
          className="fixed bottom-6 right-6 w-16 h-16 p-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-900/50 transition-transform transform hover:scale-105 z-50 flex items-center justify-center group"
          title="Asistente CodiBot"
        >
          <img src="https://i.postimg.cc/gcKn1qV7/Gemini-Generated-Image-3c84n13c84n13c84.jpg" className="w-full h-full object-cover rounded-full border-2 border-transparent group-hover:border-white transition-all" alt="CodiBot" referrerPolicy="no-referrer" />
        </button>`;

file = file.replace(oldBtn, newBtn);

fs.writeFileSync('src/components/SalesAssistant.tsx', file);
