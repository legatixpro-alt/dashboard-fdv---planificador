import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, Mic, Square, Volume2, VolumeX } from 'lucide-react';

interface SalesAssistantProps {
  session: any;
  activeTab?: string;
  vendedorName?: string;
  contextData?: string;
}

export function SalesAssistant({ session, activeTab, vendedorName, contextData, onNavigate }: SalesAssistantProps & { onNavigate?: (tabId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Control estricto de audio para silenciar al instante cuando se presiona el botón de mute o se cierra
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const isVoiceEnabledRef = useRef<boolean>(isVoiceEnabled);

  useEffect(() => {
    isVoiceEnabledRef.current = isVoiceEnabled;
  }, [isVoiceEnabled]);

  const stopCurrentAudio = () => {
    if (ttsAbortControllerRef.current) {
      try {
        ttsAbortControllerRef.current.abort();
      } catch (e) {
        // ignore
      }
      ttsAbortControllerRef.current = null;
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch (e) {
        // ignore
      }
      currentAudioRef.current = null;
    }
  };

  const handleToggleVoice = () => {
    const nextState = !isVoiceEnabled;
    setIsVoiceEnabled(nextState);
    isVoiceEnabledRef.current = nextState;
    if (!nextState) {
      // Se muteó: silenciar inmediatamente la voz
      stopCurrentAudio();
    }
  };

  const handleCloseChat = () => {
    stopCurrentAudio();
    setIsOpen(false);
  };

  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSendText = () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput('');
    handleProcessMessage(userText, isVoiceEnabledRef.current);
  };

  const handleProcessMessage = async (userText: string, playVoiceResponse: boolean) => {
    // Si hay voz hablando, silenciarla inmediatamente
    stopCurrentAudio();

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
          activeTab: activeTab,
          contextData: contextData
        })
      });
      
      if (res.ok) {
        const textRes = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(textRes);
        } catch {
          data = { text: 'Respuesta no válida del servidor.' };
        }
        let responseText = data.text || 'Sin respuesta';
        
        // Verificar comandos de navegación
        const navMatch = responseText.match(/\[\[NAVIGATE_TO:(.*?)\]\]/);
        let tabToNavigate = null;
        if (navMatch && navMatch[1]) {
           tabToNavigate = navMatch[1];
           responseText = responseText.replace(navMatch[0], '').trim();
        }

        // 1. MOSTRAR EL TEXTO AL INSTANTE EN PANTALLA (CERO ESPERA NI BLOQUEO DE 'Pensando...')
        setMessages(prev => [...prev, { role: 'model', text: responseText }]);
        setIsLoading(false); // <--- TERMINA EL 'Pensando...' DE FORMA INMEDIATA

        if (tabToNavigate && onNavigate) {
           setTimeout(() => {
              onNavigate(tabToNavigate);
           }, 400);
        }

        // 2. GENERAR VOZ EN SEGUNDO PLANO SIN CONGELAR LA INTERFAZ
        if (playVoiceResponse && isVoiceEnabledRef.current) {
          const controller = new AbortController();
          ttsAbortControllerRef.current = controller;

          fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: responseText }),
            signal: controller.signal
          })
            .then(async ttsRes => {
              if (!ttsRes.ok) return null;
              try {
                const ttsText = await ttsRes.text();
                return JSON.parse(ttsText);
              } catch {
                return null;
              }
            })
            .then(ttsData => {
              // Solo reproducir si la voz sigue encendida y no se ha cancelado
              if (ttsData?.audioBase64 && isVoiceEnabledRef.current) {
                stopCurrentAudio();
                const mimeType = ttsData.mimeType || 'audio/wav';
                const audio = new Audio(`data:${mimeType};base64,${ttsData.audioBase64}`);
                currentAudioRef.current = audio;
                audio.onended = () => {
                  if (currentAudioRef.current === audio) {
                    currentAudioRef.current = null;
                  }
                };
                audio.play().catch(e => console.error("TTS audio play error:", e));
              }
            })
            .catch(ttsErr => {
              if (ttsErr.name !== 'AbortError') {
                console.error("TTS generation error:", ttsErr);
              }
            });
        }

      } else {
        setMessages(prev => [...prev, { role: 'model', text: 'Ocurrió un error al conectar con el servidor. Intenta de nuevo.' }]);
        setIsLoading(false);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Error de red. Verifica tu conexión.' }]);
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setIsLoading(true);

        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            try {
              const base64Audio = (reader.result as string).split(',')[1];
              
              const transcribeRes = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioBase64: base64Audio })
              });
              
              if (transcribeRes.ok) {
                const textTrans = await transcribeRes.text();
                let transcribeData: any = {};
                try {
                  transcribeData = JSON.parse(textTrans);
                } catch {}
                const transcribedText = transcribeData.text;
                if (transcribedText) {
                  // Si el usuario habla, forzamos respuesta por voz independientemente del toggle (para ser consistentes con la interacción de voz)
                  await handleProcessMessage(transcribedText, true);
                } else {
                  setIsLoading(false);
                }
              } else {
                setMessages(prev => [...prev, { role: 'model', text: 'No pude escuchar bien. Intenta de nuevo.' }]);
                setIsLoading(false);
              }
            } catch (err) {
              console.error("Transcription fetch error:", err);
              setMessages(prev => [...prev, { role: 'model', text: 'Error de red al enviar el audio.' }]);
              setIsLoading(false);
            }
          };
        } catch (error) {
           console.error("Transcription error:", error);
           setIsLoading(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("No se pudo acceder al micrófono. Por favor permite el acceso en tu navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // Bienvenida inicial instantánea sin bloquear al usuario
  const handleOpenChat = async () => {
    setIsOpen(true);
    
    // Solo generar mensaje de bienvenida si el chat está vacío
    if (messages.length === 0) {
      const nameParts = (vendedorName || 'Vendedor').split(' ');
      const firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase();
      const welcomeText = `¡Hola ${firstName}! Soy CodiBot, tu asistente del dashboard. ¿En qué módulo te puedo ayudar hoy?`;
      
      // Mostrar texto de inmediato
      setMessages([{ role: 'model', text: welcomeText }]);

      // Si la voz está activa, reproducir saludo en segundo plano
      if (isVoiceEnabledRef.current) {
        stopCurrentAudio();
        const controller = new AbortController();
        ttsAbortControllerRef.current = controller;

        fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: welcomeText }),
          signal: controller.signal
        })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.audioBase64 && isVoiceEnabledRef.current) {
              const mimeType = data.mimeType || 'audio/wav';
              const audio = new Audio(`data:${mimeType};base64,${data.audioBase64}`);
              currentAudioRef.current = audio;
              audio.onended = () => {
                if (currentAudioRef.current === audio) currentAudioRef.current = null;
              };
              audio.play().catch(e => console.error("TTS Playback error:", e));
            }
          })
          .catch(() => {});
      }
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button 
          onClick={handleOpenChat}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-14 h-14 sm:w-16 sm:h-16 p-0.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-full shadow-lg shadow-indigo-900/50 transition-all z-50 flex items-center justify-center group touch-manipulation"
          title="Asistente CodiBot"
        >
          <img src="https://i.postimg.cc/gcKn1qV7/Gemini-Generated-Image-3c84n13c84n13c84.jpg" className="w-full h-full object-cover rounded-full border-2 border-transparent group-hover:border-white transition-all" alt="CodiBot" referrerPolicy="no-referrer" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[420px] h-[520px] max-h-[85vh] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 sm:p-4 bg-indigo-600 text-white">
            <div className="flex items-center gap-2">
              <img src="https://i.postimg.cc/gcKn1qV7/Gemini-Generated-Image-3c84n13c84n13c84.jpg" className="w-8 h-8 object-cover rounded-full border border-indigo-300" alt="CodiBot" referrerPolicy="no-referrer" />
              <div>
                <h3 className="font-bold text-sm leading-none">CodiBot</h3>
                <span className="text-[10px] text-indigo-200">Asistente de Ventas y Degustaciones</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleToggleVoice}
                className={`p-1.5 rounded-full transition-colors ${isVoiceEnabled ? 'bg-indigo-500 hover:bg-indigo-400 text-white' : 'bg-indigo-800/50 text-indigo-300 hover:bg-indigo-800'}`}
                title={isVoiceEnabled ? "Silenciar voz de CodiBot" : "Activar voz de CodiBot"}
              >
                {isVoiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button 
                onClick={handleCloseChat}
                className="text-indigo-200 hover:text-white transition-colors ml-1 p-1 active:scale-95 touch-manipulation"
                title="Cerrar chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-950">
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div className={`p-2 rounded-full shrink-0 ${msg.role === 'user' ? 'bg-neutral-800' : 'bg-indigo-900/50 text-indigo-400'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <img src="https://i.postimg.cc/gcKn1qV7/Gemini-Generated-Image-3c84n13c84n13c84.jpg" className="w-6 h-6 object-cover rounded-full" alt="CodiBot" referrerPolicy="no-referrer" />}
                </div>
                <div 
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-[80%] ${
                    msg.role === 'user' 
                      ? 'bg-neutral-800 text-white rounded-tr-none' 
                      : 'bg-indigo-900/30 text-indigo-100 rounded-tl-none border border-indigo-500/20'
                  }`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isRecording && (
              <div className="flex items-center justify-center py-2">
                <div className="flex items-center gap-2 text-red-500 bg-red-500/10 px-4 py-2 rounded-full text-sm animate-pulse">
                  <Mic className="w-4 h-4" /> Escuchando...
                </div>
              </div>
            )}
            {isLoading && !isRecording && (
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full shrink-0 bg-indigo-900/50 text-indigo-400">
                  <img src="https://i.postimg.cc/gcKn1qV7/Gemini-Generated-Image-3c84n13c84n13c84.jpg" className="w-6 h-6 object-cover rounded-full" alt="CodiBot" referrerPolicy="no-referrer" />
                </div>
                <div className="px-4 py-2.5 rounded-2xl bg-indigo-900/30 text-indigo-100 rounded-tl-none border border-indigo-500/20 flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Pensando...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-3 py-2 bg-neutral-950/90 border-t border-neutral-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none no-scrollbar touch-pan-x text-[11px]">
            {activeTab === 'DEGUSTACIONES' ? (
              <>
                <button
                  type="button"
                  onClick={() => handleProcessMessage('¿Cómo funciona el módulo de degustaciones y cuáles son las reglas?', isVoiceEnabled)}
                  className="px-2.5 py-1 rounded-full bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/60 whitespace-nowrap active:scale-95 touch-manipulation transition-all"
                >
                  ¿Cómo funciona?
                </button>
                <button
                  type="button"
                  onClick={() => handleProcessMessage('¿Cuáles son los horarios y cupos disponibles para degustaciones?', isVoiceEnabled)}
                  className="px-2.5 py-1 rounded-full bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/60 whitespace-nowrap active:scale-95 touch-manipulation transition-all"
                >
                  Horarios (9 mañana / 9 tarde)
                </button>
                <button
                  type="button"
                  onClick={() => handleProcessMessage('¿Cuántas degustaciones tengo solicitadas y en qué estado están?', isVoiceEnabled)}
                  className="px-2.5 py-1 rounded-full bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/60 whitespace-nowrap active:scale-95 touch-manipulation transition-all"
                >
                  Mis solicitudes
                </button>
                <button
                  type="button"
                  onClick={() => handleProcessMessage('¿Puedo pedir impulsadora y material POP para la degustación?', isVoiceEnabled)}
                  className="px-2.5 py-1 rounded-full bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/60 whitespace-nowrap active:scale-95 touch-manipulation transition-all"
                >
                  Promotora y POP
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleProcessMessage('Quiero programar una degustación para un cliente', isVoiceEnabled)}
                  className="px-2.5 py-1 rounded-full bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 whitespace-nowrap active:scale-95 touch-manipulation transition-all flex items-center gap-1"
                >
                  🍰 Ir a Degustaciones
                </button>
                <button
                  type="button"
                  onClick={() => handleProcessMessage('Explícame cómo funciona el nuevo módulo de degustaciones', isVoiceEnabled)}
                  className="px-2.5 py-1 rounded-full bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/60 whitespace-nowrap active:scale-95 touch-manipulation transition-all"
                >
                  Info Degustaciones
                </button>
                <button
                  type="button"
                  onClick={() => handleProcessMessage('¿Cómo voy en cumplimiento de mis rubros este mes?', isVoiceEnabled)}
                  className="px-2.5 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 whitespace-nowrap active:scale-95 touch-manipulation transition-all"
                >
                  Mi avance
                </button>
              </>
            )}
          </div>

          {/* Input */}
          <div className="p-3 bg-neutral-900 border-t border-neutral-800 flex items-center gap-2">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Escribe o envía un audio..."
              disabled={isRecording || isLoading}
              className="flex-1 bg-neutral-950 border border-neutral-800 text-white rounded-full px-4 py-2.5 text-[16px] sm:text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
            />
            {isRecording ? (
              <button 
                onClick={stopRecording}
                className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors shrink-0 animate-pulse"
                title="Detener grabación"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button 
                onClick={startRecording}
                disabled={isLoading}
                className="p-2.5 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 text-indigo-400 rounded-full transition-colors shrink-0"
                title="Grabar voz"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={handleSendText}
              disabled={isLoading || !input.trim() || isRecording}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded-full transition-colors shrink-0"
              title="Enviar texto"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
