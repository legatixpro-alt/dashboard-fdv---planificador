const fs = require('fs');

let file = fs.readFileSync('src/components/SalesAssistant.tsx', 'utf8');

// Modify the props to accept onNavigate
file = file.replace(
  /export function SalesAssistant\(\{ session, activeTab, vendedorName \}: SalesAssistantProps\) \{/g,
  `export function SalesAssistant({ session, activeTab, vendedorName, onNavigate }: SalesAssistantProps & { onNavigate?: (tabId: string) => void }) {`
);

// Modify handleProcessMessage to parse [[NAVIGATE_TO:XXX]] and strip it from the text and TTS
const oldResponseHandling = `
      if (res.ok) {
        const data = await res.json();
        const responseText = data.text;
        
        let audioToPlay = null;

        if (playVoiceResponse) {`;

const newResponseHandling = `
      if (res.ok) {
        const data = await res.json();
        let responseText = data.text;
        
        // Check for navigation commands
        const navMatch = responseText.match(/\\[\\[NAVIGATE_TO:(.*?)\\]\\]/);
        let tabToNavigate = null;
        if (navMatch && navMatch[1]) {
           tabToNavigate = navMatch[1];
           responseText = responseText.replace(navMatch[0], '').trim();
        }
        
        let audioToPlay = null;

        if (playVoiceResponse) {`;

file = file.replace(oldResponseHandling, newResponseHandling);


// After setMessages and play audio, navigate
const oldAudioPlay = `
        // Sincronizado: Muestra texto e inicia audio al mismo tiempo
        setMessages(prev => [...prev, { role: 'model', text: responseText }]);
        if (audioToPlay) {
          audioToPlay.play().catch(e => console.error("TTS Playback error:", e));
        }

      } else {`;

const newAudioPlay = `
        // Sincronizado: Muestra texto e inicia audio al mismo tiempo
        setMessages(prev => [...prev, { role: 'model', text: responseText }]);
        if (audioToPlay) {
          audioToPlay.play().catch(e => console.error("TTS Playback error:", e));
        }
        
        if (tabToNavigate && onNavigate) {
           setTimeout(() => {
              onNavigate(tabToNavigate);
           }, 500); // Pequeño retraso para que alcance a leer que lo está llevando
        }

      } else {`;

file = file.replace(oldAudioPlay, newAudioPlay);

fs.writeFileSync('src/components/SalesAssistant.tsx', file);
