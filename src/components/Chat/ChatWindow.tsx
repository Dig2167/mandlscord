import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useGroupCallContext } from '../../App';
import { User } from '../../types';

interface ChatWindowProps {
  onBack?: () => void;
  isMobile?: boolean;
}

type StatusType = 'online' | 'offline' | 'away' | 'dnd' | 'invisible';

export default function ChatWindow({ onBack, isMobile }: ChatWindowProps) {
  const { activeChat, messages, sendMessage, user, userStatuses, getUserProfile, initiateCall, markMessagesRead, typingUsers, sendTyping, deleteMessage } = useApp();
  const groupCallContext = useGroupCallContext();
  const [newMessage, setNewMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showProfile, setShowProfile] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [voiceProgress, setVoiceProgress] = useState<Record<string, number>>({});
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(32).fill(4));
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotal, setUploadTotal] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'image' | 'voice'>('image');
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number; isOwn: boolean } | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<string | null>(null);
  
  const isCancelledRef = useRef(false);
  const readMessagesRef = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const readTimeoutRef = useRef<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const emojis = ['😀', '😂', '😍', '🥰', '😎', '🤔', '😢', '😡', '👍', '👎', '❤️', '🔥', '✨', '🎉', '👋', '🙏'];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    readMessagesRef.current = new Set();
    Object.values(readTimeoutRef.current).forEach(t => clearTimeout(t));
    readTimeoutRef.current = {};
  }, [activeChat?.id]);

  // Intersection Observer для автоматического чтения
  useEffect(() => {
    if (!activeChat || !user) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const messageId = entry.target.getAttribute('data-message-id');
          const senderUsername = entry.target.getAttribute('data-sender');
          
          if (!messageId || senderUsername === user.username) return;
          
          if (entry.isIntersecting) {
            if (!readMessagesRef.current.has(messageId) && !readTimeoutRef.current[messageId]) {
              readTimeoutRef.current[messageId] = window.setTimeout(() => {
                if (!readMessagesRef.current.has(messageId)) {
                  readMessagesRef.current.add(messageId);
                  markMessagesRead(activeChat.id);
                }
                delete readTimeoutRef.current[messageId];
              }, 1000);
            }
          } else {
            if (readTimeoutRef.current[messageId]) {
              clearTimeout(readTimeoutRef.current[messageId]);
              delete readTimeoutRef.current[messageId];
            }
          }
        });
      },
      { threshold: 0.5, root: messagesContainerRef.current }
    );

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
      Object.values(readTimeoutRef.current).forEach(t => clearTimeout(t));
    };
  }, [activeChat, user, markMessagesRead]);

  useEffect(() => {
    if (!observerRef.current || !messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const els = container.querySelectorAll('[data-message-id]');
    els.forEach((el) => observerRef.current?.observe(el));
    return () => { els.forEach((el) => observerRef.current?.unobserve(el)); };
  }, [messages]);

  const handleCall = (type: 'audio' | 'video') => {
    if (!activeChat || activeChat.isGroup) return;
    const otherUser = activeChat.otherParticipants?.[0];
    if (otherUser) initiateCall(otherUser.username, type);
  };

  const openProfile = async () => {
    if (!activeChat || activeChat.isGroup) return;
    const other = activeChat.otherParticipants?.[0];
    if (other) {
      const profile = await getUserProfile(other.username);
      if (profile) { setProfileUser(profile); setShowProfile(true); }
    }
  };

  const getOtherUserStatus = (): StatusType => {
    if (!activeChat || activeChat.isGroup) return 'offline';
    const other = activeChat.otherParticipants?.[0];
    if (!other) return 'offline';
    return (userStatuses[other.username] || other.status || 'offline') as StatusType;
  };

  const getStatusText = (status: StatusType) => {
    switch (status) {
      case 'online': return 'в сети';
      case 'away': return 'отошёл';
      case 'dnd': return 'не беспокоить';
      default: return 'был(а) недавно';
    }
  };

  const getStatusColor = (status: StatusType) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // Визуализация голоса при записи
  const startAudioVisualization = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyserRef.current = analyser;
    
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const updateLevels = () => {
      analyser.getByteFrequencyData(dataArray);
      const levels: number[] = [];
      for (let i = 0; i < 32; i++) {
        const idx = Math.floor((i / 32) * dataArray.length);
        const value = dataArray[idx] / 255;
        levels.push(4 + value * 28);
      }
      setAudioLevels(levels);
      animFrameRef.current = requestAnimationFrame(updateLevels);
    };
    
    updateLevels();
  }, []);

  const stopAudioVisualization = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    analyserRef.current = null;
    audioContextRef.current = null;
    setAudioLevels(new Array(32).fill(4));
  }, []);

  const startRecording = async () => {
    try {
      isCancelledRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Запуск визуализации
      startAudioVisualization(stream);
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        stopAudioVisualization();
        
        if (isCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }
        
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          simulateUpload(dataUrl, 'voice', recordingTime);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      isCancelledRef.current = false;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      isCancelledRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      setRecordingTime(0);
    }
  };

  const playVoice = (messageId: string, content: string) => {
    if (playingVoice === messageId) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();

    audioRef.current = new Audio(content);
    audioRef.current.play();
    setPlayingVoice(messageId);

    const interval = setInterval(() => {
      if (audioRef.current && !isNaN(audioRef.current.duration)) {
        setVoiceProgress(prev => ({ ...prev, [messageId]: (audioRef.current!.currentTime / audioRef.current!.duration) * 100 }));
      }
    }, 50);

    audioRef.current.onended = () => {
      setPlayingVoice(null);
      setVoiceProgress(prev => ({ ...prev, [messageId]: 0 }));
      clearInterval(interval);
    };
    audioRef.current.onpause = () => clearInterval(interval);
  };

  const seekVoice = (messageId: string, content: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;

    if (audioRef.current && playingVoice === messageId) {
      audioRef.current.currentTime = audioRef.current.duration * percentage;
      setVoiceProgress(prev => ({ ...prev, [messageId]: percentage * 100 }));
    } else {
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(content);
      audioRef.current.onloadedmetadata = () => {
        if (audioRef.current) {
          audioRef.current.currentTime = audioRef.current.duration * percentage;
          audioRef.current.play();
          setPlayingVoice(messageId);
          const interval = setInterval(() => {
            if (audioRef.current && !isNaN(audioRef.current.duration)) {
              setVoiceProgress(prev => ({ ...prev, [messageId]: (audioRef.current!.currentTime / audioRef.current!.duration) * 100 }));
            }
          }, 50);
          audioRef.current.onended = () => { setPlayingVoice(null); setVoiceProgress(prev => ({ ...prev, [messageId]: 0 })); clearInterval(interval); };
        }
      };
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const simulateUpload = (dataUrl: string, type: 'image' | 'voice', duration?: number) => {
    const sizeBytes = Math.round(dataUrl.length * 0.75);
    const totalStr = formatBytes(sizeBytes);
    setUploadType(type);
    setUploadTotal(totalStr);
    setIsUploading(true);
    setUploadProgress(0);

    const steps = 20;
    const stepTime = Math.max(50, Math.min(150, sizeBytes / 10000));
    let current = 0;

    const interval = setInterval(() => {
      current += sizeBytes / steps;
      if (current >= sizeBytes) {
        current = sizeBytes;
        clearInterval(interval);
        setIsUploading(false);
        setUploadProgress(0);
        sendMessage(dataUrl, type, duration);
      }
      setUploadProgress(Math.min(100, (current / sizeBytes) * 100));
    }, stepTime);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      img.onload = () => {
        const maxSize = 1200;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = (height / width) * maxSize; width = maxSize; }
          else { width = (width / height) * maxSize; height = maxSize; }
        }
        canvas.width = width; canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        simulateUpload(dataUrl, 'image');
      };
      const reader = new FileReader();
      reader.onloadend = () => { img.src = reader.result as string; };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleSend = () => {
    if (newMessage.trim()) {
      sendMessage(newMessage.trim());
      setNewMessage('');
      setShowEmoji(false);
    }
  };

  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent, messageId: string, isOwn: boolean) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setContextMenu({ messageId, x: clientX, y: clientY, isOwn });
  };

  const handleDeleteMessage = (forEveryone: boolean) => {
    if (!contextMenu) return;
    setDeletingMessage(contextMenu.messageId);
    setTimeout(() => {
      deleteMessage(contextMenu.messageId, forEveryone);
      setDeletingMessage(null);
      setContextMenu(null);
    }, 300);
  };

  // Закрытие контекстного меню при клике вне
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const generateWaveform = (id: string) => {
    const bars = [];
    const seed = id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    for (let i = 0; i < 30; i++) bars.push(4 + ((seed * (i + 1)) % 20));
    return bars;
  };

  if (!activeChat) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900/50">
        <div className="text-center text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p>Выберите чат для общения</p>
        </div>
      </div>
    );
  }

  const chatName = activeChat.isGroup 
    ? activeChat.name || 'Группа'
    : activeChat.otherParticipants?.[0]?.displayName || activeChat.otherParticipants?.[0]?.username || 'Чат';
  const chatAvatar = activeChat.isGroup ? null : activeChat.otherParticipants?.[0]?.avatar;
  const status = getOtherUserStatus();

  return (
    <div className="h-full flex flex-col bg-gray-900/50 backdrop-blur-sm">
      {/* Header */}
      <div className={`p-3 border-b border-white/10 flex items-center gap-3 bg-gray-900/90 backdrop-blur-xl ${isMobile ? 'safe-top' : ''}`}>
        {(isMobile || onBack) && (
          <button onClick={onBack} className="p-2 -ml-1 rounded-xl hover:bg-white/10 active:bg-white/20 transition-colors">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        
        <button onClick={openProfile} className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
              {chatAvatar ? <img src={chatAvatar} alt="" className="w-full h-full object-cover" /> :
                activeChat.isGroup ? (
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : <span className="text-white font-bold">{chatName[0]}</span>}
            </div>
            {!activeChat.isGroup && <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-900 ${getStatusColor(status)}`} />}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-white font-medium truncate">{chatName}</p>
            <p className="text-xs text-gray-400 truncate">
              {activeChat.isGroup ? `${activeChat.participants.length} участников` : getStatusText(status)}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1">
          {!activeChat.isGroup ? (
            <>
              <button onClick={() => handleCall('audio')} className="p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors" title="Аудио звонок">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
              <button onClick={() => handleCall('video')} className="p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors" title="Видео звонок">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => {
                  const participants = activeChat.otherParticipants?.map(p => p.username) || [];
                  if (groupCallContext && participants.length > 0) {
                    groupCallContext.initiateGroupCall(activeChat.id, activeChat.name || 'Группа', participants, 'audio');
                  }
                }} 
                className="p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                title="Групповой аудио звонок"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
              <button 
                onClick={() => {
                  const participants = activeChat.otherParticipants?.map(p => p.username) || [];
                  if (groupCallContext && participants.length > 0) {
                    groupCallContext.initiateGroupCall(activeChat.id, activeChat.name || 'Группа', participants, 'video');
                  }
                }} 
                className="p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                title="Групповой видео звонок"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </>
          )}
          {!isMobile && onBack && (
            <button onClick={onBack} className="p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors" title="Закрыть чат">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.filter(m => !m.deletedFor?.includes(user?.username || '')).map((message) => {
          const isOwn = message.senderUsername === user?.username;
          const waveform = message.type === 'voice' ? generateWaveform(message.id) : [];
          const isDeleting = deletingMessage === message.id;
          
          return (
            <div key={message.id} data-message-id={message.id} data-sender={message.senderUsername}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} transition-all duration-300 ${isDeleting ? 'opacity-0 scale-75 -translate-y-4' : ''}`}
              onContextMenu={(e) => !message.deleted && handleContextMenu(e, message.id, isOwn)}
              onTouchStart={(e) => {
                const timer = setTimeout(() => !message.deleted && handleContextMenu(e, message.id, isOwn), 500);
                const clear = () => clearTimeout(timer);
                e.currentTarget.addEventListener('touchend', clear, { once: true });
                e.currentTarget.addEventListener('touchmove', clear, { once: true });
              }}>
              <div className={`max-w-[80%] sm:max-w-[65%] ${isOwn ? 'order-2' : ''}`}>
                {activeChat.isGroup && !isOwn && (
                  <p className="text-xs text-purple-400 mb-1 ml-1">{message.senderName}</p>
                )}
                <div className={`rounded-2xl px-3 py-2 ${
                  message.deleted 
                    ? 'bg-gray-800/50 text-gray-500 italic border border-gray-700/50'
                    : isOwn ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-br-sm'
                    : 'bg-gray-800 text-white rounded-bl-sm'
                }`}>
                  {message.deleted ? (
                    <div className="flex items-center gap-2 py-1">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span className="text-gray-500 text-sm">Сообщение удалено</span>
                    </div>
                  ) : message.type === 'image' ? (
                    <img src={message.content} alt="" 
                      className="rounded-lg max-w-full max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setViewImage(message.content)} />
                  ) : null}
                  
                  {!message.deleted && message.type === 'voice' && (
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <button onClick={() => playVoice(message.id, message.content)}
                        className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 hover:bg-white/30 transition-colors">
                        {playingVoice === message.id ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                        ) : (
                          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-end gap-0.5 h-6 cursor-pointer" onClick={(e) => seekVoice(message.id, message.content, e)}>
                          {waveform.map((h, i) => {
                            const progress = voiceProgress[message.id] || 0;
                            const isActive = (i / waveform.length) * 100 <= progress;
                            return <div key={i} className={`w-1 rounded-full transition-all ${isActive ? 'bg-white' : 'bg-white/40'}`} style={{ height: `${h}px` }} />;
                          })}
                        </div>
                        <div className="text-xs opacity-70 mt-1">
                          {message.duration ? `0:${message.duration.toString().padStart(2, '0')}` : '0:00'}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {!message.deleted && message.type === 'text' && <p className="break-words">{message.content}</p>}
                  
                  <div className={`text-xs mt-1 flex items-center gap-1 ${isOwn ? 'justify-end' : ''}`}>
                    <span className="opacity-60">{formatTime(message.timestamp)}</span>
                    {isOwn && (
                      message.readBy && message.readBy.length > 0 ? (
                        <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M1 13l4 4L15 7" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 13l4 4L21 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {/* Upload Progress */}
        {isUploading && (
          <div className="flex justify-end px-2">
            <div className="bg-gray-800 rounded-2xl px-4 py-3 max-w-[80%] sm:max-w-[65%]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center flex-shrink-0">
                  {uploadType === 'image' ? (
                    <svg className="w-4 h-4 text-purple-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-purple-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm">{uploadType === 'image' ? 'Отправка фото' : 'Отправка голосового'}</p>
                  <p className="text-gray-400 text-xs">{formatBytes(Math.round(uploadProgress / 100 * parseInt(uploadTotal) * (uploadTotal.includes('MB') ? 1048576 : uploadTotal.includes('KB') ? 1024 : 1)))} / {uploadTotal}</p>
                </div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-100"
                  style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          </div>
        )}
        {/* Typing indicator */}
        {activeChat && typingUsers[activeChat.id]?.filter(u => u !== user?.username).length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1">
            <div className="bg-gray-800 rounded-2xl px-3 py-2 rounded-bl-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-sm">
                  {typingUsers[activeChat.id].filter(u => u !== user?.username).join(', ')} печатает
                </span>
                <div className="flex gap-0.5">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`p-3 border-t border-white/10 bg-gray-900/90 ${isMobile ? 'safe-bottom' : ''}`}>
        {isRecording ? (
          <div className="flex items-center gap-3 bg-gray-800 rounded-2xl p-3">
            <button onClick={cancelRecording} className="p-2 text-red-500 hover:bg-red-500/20 rounded-full transition-colors flex-shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="flex-1 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-white text-sm font-mono min-w-[40px]">
                  {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                </span>
              </div>
              {/* Визуализация голоса в реальном времени */}
              <div className="flex-1 flex items-center justify-center gap-[2px] h-10 overflow-hidden">
                {audioLevels.map((level, i) => (
                  <div key={i} className="w-[3px] rounded-full bg-gradient-to-t from-purple-500 to-pink-400 transition-all duration-75"
                    style={{ height: `${level}px` }} />
                ))}
              </div>
            </div>
            
            <button onClick={stopRecording}
              className="p-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full hover:shadow-lg hover:shadow-purple-500/30 transition-all flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,image/heic,image/heif" onChange={handleImageUpload} className="hidden" />

            <div className="flex-1 relative">
              <input type="text" value={newMessage} onChange={(e) => { setNewMessage(e.target.value); if (activeChat) sendTyping(activeChat.id); }}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Сообщение..."
                className="w-full bg-gray-800 border border-gray-700 rounded-full py-2.5 px-4 pr-10 text-white text-sm focus:border-purple-500 focus:outline-none transition-colors" />
              <button onClick={() => setShowEmoji(!showEmoji)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {showEmoji && (
                <div className="absolute bottom-full right-0 mb-2 p-2 bg-gray-800 rounded-xl border border-gray-700 grid grid-cols-8 gap-1 z-10 shadow-xl">
                  {emojis.map((emoji) => (
                    <button key={emoji} onClick={() => { setNewMessage(prev => prev + emoji); setShowEmoji(false); }}
                      className="w-8 h-8 flex items-center justify-center hover:bg-gray-700 rounded text-lg transition-colors">
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {newMessage.trim() ? (
              <button onClick={handleSend}
                className="p-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex-shrink-0 hover:shadow-lg hover:shadow-purple-500/30 transition-all">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            ) : (
              <button onClick={startRecording}
                className="p-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex-shrink-0 hover:shadow-lg hover:shadow-purple-500/30 transition-all">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Контекстное меню удаления */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          style={{ 
            left: Math.min(contextMenu.x, window.innerWidth - 200), 
            top: Math.min(contextMenu.y, window.innerHeight - 120) 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleDeleteMessage(false)}
            className="w-full px-4 py-3 text-left text-white hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Удалить у себя</span>
          </button>
          {contextMenu.isOwn && (
            <button
              onClick={() => handleDeleteMessage(true)}
              className="w-full px-4 py-3 text-left text-red-400 hover:bg-gray-700 flex items-center gap-3 transition-colors border-t border-gray-700"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Удалить у всех</span>
            </button>
          )}
        </div>
      )}

      {/* Просмотр изображения на весь экран */}
      {viewImage && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
          <button className="absolute top-4 right-4 safe-top text-white/80 hover:text-white p-2 bg-white/10 rounded-full z-10" onClick={() => setViewImage(null)}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img src={viewImage} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && profileUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowProfile(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowProfile(false)} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-center">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 p-0.5 mb-4">
                <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                  {profileUser.avatar ? <img src={profileUser.avatar} alt="" className="w-full h-full object-cover" />
                    : <span className="text-white text-3xl font-bold">{profileUser.displayName[0]}</span>}
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{profileUser.displayName}</h3>
              <p className="text-gray-500 mb-2">@{profileUser.username}</p>
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
                <span className="text-gray-400 text-sm">{getStatusText(status)}</span>
              </div>
              {profileUser.bio && <p className="text-gray-300 text-sm mb-4 px-4">{profileUser.bio}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowProfile(false); handleCall('audio'); }}
                  className="flex-1 py-2.5 bg-gray-800 text-white rounded-xl hover:bg-gray-700 flex items-center justify-center gap-2 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  Позвонить
                </button>
                <button onClick={() => { setShowProfile(false); handleCall('video'); }}
                  className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg flex items-center justify-center gap-2 transition-all">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Видео
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
