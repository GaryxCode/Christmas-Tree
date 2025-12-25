
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Experience from './components/Experience';
import GestureController from './components/GestureController';
import { TreeColors, HandGesture } from './types';
import { getMedia, setMedia } from './utils/db';

const STORAGE_KEY_IMAGES = 'stella_bb_images_v5';
const STORAGE_KEY_MUSIC = 'stella_bb_music_v5';
const STORAGE_KEY_TEXT = 'stella_bb_sig_v5';

// Beautiful cinematic Christmas default
const DEFAULT_MUSIC = "https://cdn.pixabay.com/audio/2021/11/01/audio_00de5f7374.mp3"; 
const MAX_FILE_SIZE_MB = 20; // Increased for higher quality video
const MAX_ORNAMENTS = 15;

const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [targetMix, setTargetMix] = useState(1); 
  const [colors] = useState<TreeColors>({ bottom: '#022b1c', top: '#217a46' });
  const inputRef = useRef({ x: 0, y: 0, isDetected: false });
  
  const [userImages, setUserImages] = useState<string[]>([]);
  const [musicUrl, setMusicUrl] = useState(DEFAULT_MUSIC);
  const [signatureText, setSignatureText] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Detect "Viewer Mode" from URL
  const isViewOnly = new URLSearchParams(window.location.search).get('view') === 'true';

  // LOAD PHASE: Priority to Database
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const [savedImages, savedMusic, savedText] = await Promise.all([
          getMedia(STORAGE_KEY_IMAGES),
          getMedia(STORAGE_KEY_MUSIC),
          getMedia(STORAGE_KEY_TEXT)
        ]);
        
        if (savedImages && Array.isArray(savedImages) && savedImages.length > 0) {
            setUserImages(savedImages);
        }
        if (savedMusic && typeof savedMusic === 'string') {
            setMusicUrl(savedMusic);
        }
        if (savedText && typeof savedText === 'string') {
            setSignatureText(savedText);
        }
      } catch (err) {
        console.error("Memory sync failed, using defaults:", err);
      } finally {
        setTimeout(() => setIsInitializing(false), 1000);
      }
    };
    loadSavedData();
  }, []);

  // AUDIO ENGINE: Handles persistence and browser policies
  useEffect(() => {
    if (isInitializing) return;

    const playAudio = () => {
      if (audioRef.current && !isMuted) {
        audioRef.current.play().catch(() => {
          // Interaction required to start
        });
      }
    };

    if (audioRef.current) {
        audioRef.current.load();
        playAudio();
    }

    const handleFirstInteraction = () => {
      playAudio();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [musicUrl, isMuted, isInitializing]);

  const handleGesture = useCallback((data: HandGesture) => {
    if (isViewOnly) return;
    if (data.isDetected) {
        const newTarget = data.isOpen ? 0 : 1;
        setTargetMix(prev => (prev !== newTarget ? newTarget : prev));
        inputRef.current = { x: data.position.x * 1.2, y: data.position.y, isDetected: true };
    } else {
        inputRef.current.isDetected = false;
    }
  }, [isViewOnly]);

  const handleMusicFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsProcessing(true);
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async () => {
          const base64 = reader.result as string;
          // Save to DB first to ensure persistence
          await setMedia(STORAGE_KEY_MUSIC, base64);
          setMusicUrl(base64);
          setIsMuted(false);
          setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setIsProcessing(true);
          setTargetMix(0);
          
          const files = Array.from(e.target.files as FileList);
          const validFiles = files.filter(f => f.size < MAX_FILE_SIZE_MB * 1024 * 1024).slice(0, MAX_ORNAMENTS);
          
          const base64Media = await Promise.all(validFiles.map(file => {
              return new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.readAsDataURL(file);
              });
          }));
          
          // Commit to Database
          await setMedia(STORAGE_KEY_IMAGES, base64Media);
          setUserImages(base64Media);
          
          if (fileInputRef.current) fileInputRef.current.value = '';
          
          setTimeout(() => {
              setIsProcessing(false);
              setTimeout(() => setTargetMix(1), 800);
          }, 1200); 
      }
  };

  const handleShare = () => {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'true');
      navigator.clipboard.writeText(url.toString());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
  };

  if (isInitializing) {
      return (
          <div className="w-full h-screen bg-black flex flex-col items-center justify-center gap-6">
              <div className="relative w-16 h-16">
                  <div className="absolute inset-0 border-2 border-[#d4af37]/20 rounded-full"></div>
                  <div className="absolute inset-0 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="gold-radiance text-sm font-luxury animate-pulse tracking-[0.4em] uppercase">
                Preparing Stella BB's Tree...
              </div>
          </div>
      );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <audio ref={audioRef} src={musicUrl} loop />
      
      {!isViewOnly && (
          <>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" multiple className="hidden" />
            <input type="file" ref={musicInputRef} onChange={handleMusicFileChange} accept="audio/mp3,audio/*" className="hidden" />
          </>
      )}

      {isProcessing && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl">
              <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 border-[3px] border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-[#d4af37] text-3xl">✦</div>
              </div>
              <div className="text-[#d4af37] font-luxury tracking-[0.4em] text-sm uppercase animate-pulse">Saving Memories...</div>
          </div>
      )}

      {/* Cinematic Title */}
      <div className={`absolute top-[5%] left-0 w-full flex justify-center pointer-events-none z-0 transition-opacity duration-1000 ${isSignatureOpen ? 'opacity-0' : 'opacity-100'}`}>
        <h1 className="font-script text-7xl md:text-9xl text-center leading-[1.5] py-10" style={{ background: 'linear-gradient(to bottom, #ffffff 20%, #e8e8e8 50%, #b0b0b0 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0px 5px 15px rgba(0,0,0,1))' }}>
            Merry Christmas
        </h1>
      </div>

      {/* Main Experience */}
      <div className={`absolute inset-0 z-10 transition-all duration-1000 ${isSignatureOpen ? 'blur-2xl scale-110 opacity-30' : 'blur-0 scale-100 opacity-100'}`}>
        <Experience 
            mixFactor={targetMix} 
            colors={colors} 
            inputRef={inputRef} 
            userImages={userImages} 
            signatureText={signatureText} 
        />
      </div>

      {/* Memory Card / Signature View */}
      {isSignatureOpen && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-700">
              <div className="relative bg-white p-5 pb-16 shadow-[0_50px_100px_rgba(0,0,0,1)] transform rotate-[-0.5deg] border border-black/5" style={{ width: 'min(90vw, 360px)', aspectRatio: '3.5/4.6' }}>
                  <button onClick={() => setIsSignatureOpen(false)} className="absolute -top-5 -right-5 w-12 h-12 rounded-full bg-black text-white flex items-center justify-center hover:bg-red-600 z-50 text-3xl transition-all shadow-xl">×</button>
                  <div className="w-full h-[82%] bg-[#050505] overflow-hidden relative shadow-inner">
                      {activePhotoUrl ? (
                          activePhotoUrl.includes('video') ? (
                              <video src={activePhotoUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                          ) : (
                              <img src={activePhotoUrl} alt="Memory" className="w-full h-full object-cover" />
                          )
                      ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-white/20 p-10 text-center gap-4">
                              <span className="text-4xl opacity-50">✨</span>
                              <span className="font-body text-sm italic tracking-widest">Select a decoration to see a memory...</span>
                          </div>
                      )}
                  </div>
                  <div className="absolute bottom-0 left-0 w-full h-[18%] flex items-center justify-center px-8">
                      {isViewOnly ? (
                          <div className="font-script text-4xl text-[#1a1a1a] text-center w-full">{signatureText || "Merry Christmas"}</div>
                      ) : (
                          <input autoFocus type="text" placeholder="Sign your memory..." value={signatureText} onChange={(e) => { setSignatureText(e.target.value); setMedia(STORAGE_KEY_TEXT, e.target.value); }} className="w-full text-center bg-transparent border-none outline-none font-script text-4xl text-[#1a1a1a] placeholder:opacity-30" maxLength={20} />
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Side Control Panel */}
      <div className={`absolute top-6 right-6 md:top-10 md:right-10 z-30 flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-5 transition-all duration-700 ${isSignatureOpen || isProcessing ? 'opacity-0 translate-x-20 pointer-events-none' : 'opacity-100 translate-x-0'}`}>
          <button onClick={() => setIsMuted(!isMuted)} className={`group relative w-12 h-12 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center transition-all hover:bg-white/20 active:scale-90 ${!isMuted ? 'text-[#d4af37] border-[#d4af37]/40' : 'text-slate-500'}`}>
              {!isMuted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.72-1.59-1.59V9.84c0-.88.71-1.59 1.59-1.59h2.24z" /></svg>
              ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-6 h-6 opacity-40"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.047a7.5 7.5 0 00-11.53 4.887M3 3l18 18M9.17 9.17L3.01 3.01" /></svg>
              )}
          </button>
          
          {!isViewOnly && (
            <>
              <button onClick={() => musicInputRef.current?.click()} className="w-12 h-12 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-xl" title="Set Background Music">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l.31-.088a2.25 2.25 0 001.382-1.357V5.322a2.25 2.25 0 011.632-2.163l1.32-.377a1.803 1.803 0 11.99 3.467l-.31.088A2.25 2.25 0 0019.5 7.71v3.393zM12 18.75h-3m3 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75z" /></svg>
              </button>
              <button onClick={() => setShowCamera(!showCamera)} className={`w-12 h-12 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center transition-all ${showCamera ? 'text-[#d4af37] border-[#d4af37]/30' : 'text-slate-300'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /></svg>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-xl" title="Upload Photos/Videos">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" /></svg>
              </button>
            </>
          )}

          <button onClick={handleShare} className={`relative w-12 h-12 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center transition-all ${copySuccess ? 'text-green-400 border-green-400/40' : 'text-slate-300 hover:text-white'}`} title="Copy View-Only Link">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0-10.628a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5zm0 10.628a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z" /></svg>
              {copySuccess && <span className="absolute -left-28 bg-green-500 text-white text-[10px] py-1 px-3 rounded font-luxury uppercase tracking-widest animate-fade-out">Share Link Copied</span>}
          </button>

          <button onClick={() => {
              if (userImages.length > 0) setActivePhotoUrl(userImages[Math.floor(Math.random() * userImages.length)]);
              setIsSignatureOpen(true);
          }} className="w-12 h-12 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
          </button>

          <button onClick={() => setTargetMix(prev => prev === 1 ? 0 : 1)} className="w-12 h-12 rounded-full bg-[#d4af37]/20 backdrop-blur-xl border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] transition-all hover:bg-[#d4af37]/40 active:scale-95 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
            {targetMix === 1 ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
            )}
          </button>
      </div>

      {/* Footer Branding */}
      <div className={`absolute bottom-8 left-8 z-20 transition-opacity duration-1000 ${isSignatureOpen ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex flex-col gap-2">
                <div className="gold-radiance text-lg md:text-2xl font-luxury uppercase tracking-[0.4em] cursor-default drop-shadow-lg">
                    一颗美丽的圣诞树相遇
                </div>
                <div className="text-white/30 text-[10px] uppercase tracking-[0.4em] font-luxury flex items-center gap-3">
                    <span>For Stella BB</span>
                    <span className="w-8 h-[1px] bg-white/20"></span>
                    <span className="animate-pulse">{isViewOnly ? "Viewer Mode" : "Personalized Experience"}</span>
                </div>
            </div>
      </div>

      {!isViewOnly && <GestureController onGesture={handleGesture} isGuiVisible={showCamera} />}

      <style>{`
        .gold-radiance {
            background: linear-gradient(to right, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: gold-shimmer 4s ease-in-out infinite alternate;
        }
        @keyframes gold-shimmer {
            from { filter: drop-shadow(0 0 2px rgba(212, 175, 55, 0.4)) brightness(1); }
            to { filter: drop-shadow(0 0 15px rgba(255, 223, 0, 0.7)) brightness(1.2); }
        }
        @keyframes fade-out {
            0% { opacity: 0; transform: translateX(10px); }
            15% { opacity: 1; transform: translateX(0); }
            85% { opacity: 1; transform: translateX(0); }
            100% { opacity: 0; transform: translateX(-10px); }
        }
        .animate-fade-out { animation: fade-out 3s forwards; }
      `}</style>
    </div>
  );
};

export default App;
