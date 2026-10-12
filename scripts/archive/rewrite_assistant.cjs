const fs = require('fs');

let code = fs.readFileSync('src/components/SalesAssistant.tsx', 'utf8');

// Replace handleProcessMessage
const handleProcessMessageRegex = /const handleProcessMessage = async \(userText: string, playVoiceResponse: boolean\) => \{[\s\S]*?finally \{\s*setIsLoading\(false\);\s*\}\s*\};/m;

const newHandleProcessMessage = `const handleProcessMessage = async (userText: string, playVoiceResponse: boolean) => {
    const newMessages = [...messages, { role: 'user' as const, text: userText }];
    setMessages(newMessages);
    setIsLoading(true);
    
    try {
      const apiMessages = newMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: apiMessages,
          vendedorName: vendedorName || session?.usuario?.nombre || 'Vendedor',
          activeTab: activeTab
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        const responseText = data.text;
        
        let audioToPlay = null;

        if (playVoiceResponse) {
          try {
            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: responseText })
            });
            if (ttsRes.ok) {
              const ttsData = await ttsRes.json();
              if (ttsData.audioBase64) {
                const mimeType = ttsData.mimeType || 'audio/mp3';
                const audioUrl = \`data:\${mimeType};base64,\${ttsData.audioBase64}\`;
                audioToPlay = new Audio(audioUrl);
              }
            }
          } catch (ttsErr) {
            console.error("TTS Playback error:", ttsErr);
          }
        }
        
        // Sincronizado: Muestra texto e inicia audio al mismo tiempo
        setMessages(prev => [...prev, { role: 'model', text: responseText }]);
        if (audioToPlay) {
          audioToPlay.play().catch(e => console.error("TTS Playback error:", e));
        }

      } else {
        setMessages(prev => [...prev, { role: 'model', text: 'Ocurrió un error al conectar con el servidor. Intenta de nuevo.' }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Error de red. Verifica tu conexión.' }]);
    } finally {
      setIsLoading(false);
    }
  };`;

code = code.replace(handleProcessMessageRegex, newHandleProcessMessage);

// Replace handleOpenChat
const handleOpenChatRegex = /const handleOpenChat = \(\) => \{[\s\S]*?\}\s*\};/m;

const newHandleOpenChat = `const handleOpenChat = async () => {
    setIsOpen(true);
    
    // Only generate the welcome message if the chat is empty
    if (messages.length === 0) {
      const nameParts = (vendedorName || 'Vendedor').split(' ');
      const firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase();
      const welcomeText = \`¡Hola \${firstName}! Soy CodiBot, tu asistente del dashboard. ¿En qué módulo te puedo ayudar a navegar hoy?\`;
      
      if (isVoiceEnabled) {
        setIsLoading(true);
        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: welcomeText })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.audioBase64) {
              const mimeType = data.mimeType || 'audio/mp3';
              const audioUrl = \`data:\${mimeType};base64,\${data.audioBase64}\`;
              const audio = new Audio(audioUrl);
              // Set message and play simultaneously
              setMessages([{ role: 'model', text: welcomeText }]);
              audio.play().catch(e => console.error("TTS Playback error:", e));
            } else {
              setMessages([{ role: 'model', text: welcomeText }]);
            }
          } else {
            setMessages([{ role: 'model', text: welcomeText }]);
          }
        } catch (err) {
          console.error("TTS error for welcome:", err);
          setMessages([{ role: 'model', text: welcomeText }]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setMessages([{ role: 'model', text: welcomeText }]);
      }
    }
  };`;

code = code.replace(handleOpenChatRegex, newHandleOpenChat);

fs.writeFileSync('src/components/SalesAssistant.tsx', code);
