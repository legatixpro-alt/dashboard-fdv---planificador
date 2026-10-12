const fs = require('fs');

let file = fs.readFileSync('src/components/SalesAssistant.tsx', 'utf8');

const oldProcessMessage = `
      if (res.ok) {
        const data = await res.json();
        const responseText = data.text;

        setMessages(prev => [...prev, { role: 'model', text: responseText }]);

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
                const audio = new Audio(audioUrl);
                audio.play().catch(e => console.error("TTS Playback error:", e));
              }
            }
          } catch (ttsErr) {
            console.error("TTS Playback error:", ttsErr);
          }
        }
      } else {`;

const newProcessMessage = `
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

      } else {`;

file = file.replace(oldProcessMessage, newProcessMessage);

const oldOpenChat = `
  const handleOpenChat = () => {
    setIsOpen(true);
    
    // Only generate the welcome message if the chat is empty
    if (messages.length === 0) {
      const nameParts = (vendedorName || 'Vendedor').split(' ');
      const firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase();
      const welcomeText = \`¡Hola \${firstName}! Soy CodiBot, tu asistente del dashboard. ¿En qué módulo te puedo ayudar a navegar hoy?\`;
      
      setMessages([
        { role: 'model', text: welcomeText }
      ]);
      
      // Attempt to play TTS for the welcome message if voice is enabled
      // Now this happens directly after a user click, so the browser will allow it
      if (isVoiceEnabled) {
        fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: welcomeText })
        }).then(res => res.json()).then(data => {
          if (data.audioBase64) {
             const mimeType = data.mimeType || 'audio/mp3';
             // Default to wav if the browser has issues with raw pcm or missing types, or directly use the mime type from server
             const audioUrl = \`data:\${mimeType};base64,\${data.audioBase64}\`;
             const audio = new Audio(audioUrl);
             audio.play().catch(e => console.error("TTS Playback error:", e));
          }
        }).catch(err => console.error("TTS error for welcome:", err));
      }
    }
  };`;

const newOpenChat = `
  const handleOpenChat = async () => {
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

file = file.replace(oldOpenChat, newOpenChat);

fs.writeFileSync('src/components/SalesAssistant.tsx', file);
