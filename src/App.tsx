import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from 'react';
import { useApp } from './context/AppContext';
import { useGroupCall } from './hooks/useGroupCall';
import AuthForms from './components/Auth/AuthForms';
import Sidebar from './components/Sidebar/Sidebar';
import ChatWindow from './components/Chat/ChatWindow';
import Profile from './components/Profile/Profile';
import Settings from './components/Settings/Settings';

// Context для групповых звонков
interface GroupCallContextType {
  initiateGroupCall: (chatId: string, chatName: string, participants: string[], type: 'audio' | 'video') => void;
}
const GroupCallContext = createContext<GroupCallContextType | null>(null);
export const useGroupCallContext = () => useContext(GroupCallContext);

// Компонент групповых звонков с Jitsi
function GroupCallUI({ 
  groupCallState,
  joinGroupCall,
  rejectGroupCall,
  leaveGroupCall,
  minimizeCall,
  maximizeCall,
  setJitsiContainer
}: {
  groupCallState: {
    isActive: boolean;
    isIncoming: boolean;
    isCalling: boolean;
    isMinimized: boolean;
    callType: 'audio' | 'video';
    chatId: string;
    chatName: string;
    roomId: string;
    participants: string[];
    initiator: string;
  };
  joinGroupCall: () => Promise<void>;
  rejectGroupCall: () => void;
  leaveGroupCall: () => void;
  minimizeCall: () => void;
  maximizeCall: () => void;
  setJitsiContainer: (el: HTMLDivElement | null) => void;
}) {
  const jitsiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (groupCallState.isActive && !groupCallState.isMinimized && jitsiRef.current) {
      setJitsiContainer(jitsiRef.current);
    }
  }, [groupCallState.isActive, groupCallState.isMinimized, setJitsiContainer]);

  // Входящий групповой звонок
  if (groupCallState.isIncoming && !groupCallState.isActive) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900/95 rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center">
          <div className="relative mb-6 inline-block">
            <div className="absolute -inset-4 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{groupCallState.chatName}</h2>
          <p className="text-gray-400 mb-2">Групповой {groupCallState.callType === 'video' ? 'видеозвонок' : 'звонок'}</p>
          <p className="text-gray-500 text-sm mb-2">{groupCallState.participants.length} участников</p>
          <p className="text-gray-500 text-sm mb-6">от {groupCallState.initiator}</p>
          <div className="flex justify-center gap-6">
            <button onClick={rejectGroupCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all hover:scale-110">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <button 
              onClick={joinGroupCall} 
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-lg shadow-green-500/30 transition-all hover:scale-110 animate-pulse"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Исходящий групповой звонок (ожидание)
  if (groupCallState.isCalling && !groupCallState.isActive) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900/95 rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center">
          <div className="relative mb-6 inline-block">
            <div className="absolute -inset-4 rounded-full bg-purple-500/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{groupCallState.chatName}</h2>
          <p className="text-gray-400 mb-2">Вызов группы...</p>
          <p className="text-gray-500 text-sm mb-6">Ожидание {groupCallState.participants.length} участников</p>
          <button onClick={leaveGroupCall} className="w-16 h-16 mx-auto rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all hover:scale-110">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    );
  }

  // Свёрнутый групповой звонок
  if (groupCallState.isActive && groupCallState.isMinimized) {
    return (
      <div onClick={maximizeCall} className="fixed top-4 right-4 z-50 cursor-pointer safe-top">
        <div className="bg-gray-800/95 backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-white/10 flex items-center gap-3 hover:scale-105 transition-all">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-white font-medium text-sm">{groupCallState.chatName}</p>
            <p className="text-green-400 text-xs">Групповой звонок</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); leaveGroupCall(); }}
            className="ml-2 w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    );
  }

  // Активный групповой звонок - Jitsi
  if (groupCallState.isActive) {
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={minimizeCall} />
        
        <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-[900px] h-[80vh] bg-gray-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-white font-bold">{groupCallState.chatName}</h2>
              <p className="text-gray-400 text-sm">Групповой {groupCallState.callType === 'video' ? 'видеозвонок' : 'звонок'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={minimizeCall} className="p-2 hover:bg-white/10 rounded-lg transition-all text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button onClick={leaveGroupCall} className="p-2 bg-red-500 hover:bg-red-600 rounded-lg transition-all text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Jitsi container */}
          <div ref={jitsiRef} className="flex-1 bg-black" />
        </div>
      </>
    );
  }

  return null;
}

function CallUI() {
  const { 
    callState, localStream, remoteStream, 
    acceptCall, rejectCall, endCall,
    toggleMute, toggleVideo, minimizeCall, maximizeCall,
    isMuted, isVideoOff
  } = useApp();
  
  const [callDuration, setCallDuration] = useState(0);
  const [iceStatus, setIceStatus] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [callSize, setCallSize] = useState({ width: 400, height: 500 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number; dir: string } | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!remoteStream) return;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(e => console.log('Audio play error:', e));
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.log('Video play error:', e));
    }
  }, [remoteStream, callState.isActive, callState.isMinimized]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, callState.isActive, callState.isMinimized]);

  useEffect(() => {
    let interval: number;
    if (callState.isActive) {
      setCallDuration(0);
      interval = window.setInterval(() => setCallDuration(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [callState.isActive]);

  useEffect(() => {
    if (!callState.isActive && !callState.isCalling) {
      setIceStatus('');
      return;
    }
    const checkIce = () => {
      // @ts-expect-error accessing peerConnection from window
      const pc = window.__peerConnection;
      if (pc) setIceStatus(pc.iceConnectionState || '');
    };
    const interval = setInterval(checkIce, 500);
    return () => clearInterval(interval);
  }, [callState.isActive, callState.isCalling]);

  const switchCamera = useCallback(async () => {
    if (!localStream) return;
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: newFacing }
      });
      const videoTrack = newStream.getVideoTracks()[0];
      const oldTrack = localStream.getVideoTracks()[0];
      if (oldTrack) oldTrack.stop();
      
      // @ts-expect-error accessing peerConnection
      const pc = window.__peerConnection as RTCPeerConnection;
      if (pc) {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) await videoSender.replaceTrack(videoTrack);
      }
      
      localStream.removeTrack(localStream.getVideoTracks()[0]);
      localStream.addTrack(videoTrack);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      setFacingMode(newFacing);
    } catch (err) {
      console.error('Camera switch failed:', err);
    }
  }, [localStream, facingMode]);

  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeRef.current = {
      startX: clientX,
      startY: clientY,
      startW: callSize.width,
      startH: callSize.height,
      dir
    };
  }, [callSize]);

  useEffect(() => {
    if (!isResizing) return;
    
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!resizeRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - resizeRef.current.startX;
      const dy = clientY - resizeRef.current.startY;
      const { dir, startW, startH } = resizeRef.current;
      
      let newW = startW;
      let newH = startH;
      
      if (dir.includes('e')) newW = Math.max(300, Math.min(window.innerWidth * 0.9, startW + dx * 2));
      if (dir.includes('w')) newW = Math.max(300, Math.min(window.innerWidth * 0.9, startW - dx * 2));
      if (dir.includes('s')) newH = Math.max(350, Math.min(window.innerHeight * 0.9, startH + dy * 2));
      if (dir.includes('n')) newH = Math.max(350, Math.min(window.innerHeight * 0.9, startH - dy * 2));
      
      setCallSize({ width: newW, height: newH });
    };
    
    const handleEnd = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);
    
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isResizing]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const getStatusInfo = () => {
    switch (iceStatus) {
      case 'new': case 'checking': return { text: 'Соединение...', color: 'text-yellow-400', dot: 'bg-yellow-400' };
      case 'connected': return { text: 'Подключено', color: 'text-green-400', dot: 'bg-green-400' };
      case 'completed': return { text: 'Подключено', color: 'text-green-400', dot: 'bg-green-400' };
      case 'disconnected': return { text: 'Переподключение...', color: 'text-yellow-400', dot: 'bg-yellow-400' };
      case 'failed': return { text: 'Ошибка', color: 'text-red-400', dot: 'bg-red-400' };
      default: return { text: '', color: '', dot: '' };
    }
  };

  const hasAnyCall = callState.isActive || callState.isCalling || callState.isIncoming;
  const persistentAudio = hasAnyCall ? (
    <audio ref={remoteAudioRef} autoPlay playsInline style={{ position: 'fixed', top: -9999, left: -9999 }} />
  ) : null;

  // Входящий звонок
  if (callState.isIncoming && !callState.isActive) {
    return (
      <>
        {persistentAudio}
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900/95 rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center">
            <div className="relative mb-6 inline-block">
              <div className="absolute -inset-4 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-0.5">
                <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                  {callState.remoteUser?.avatar ? <img src={callState.remoteUser.avatar} alt="" className="w-full h-full object-cover" />
                    : <span className="text-4xl text-white">{callState.remoteUser?.displayName?.[0] || '?'}</span>}
                </div>
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">{callState.remoteUser?.displayName}</h2>
            <p className="text-gray-400 mb-8 flex items-center justify-center gap-2">
              {callState.type === 'video' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              )}
              {callState.type === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}
            </p>
            <div className="flex justify-center gap-6">
              <button onClick={rejectCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all hover:scale-110">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <button onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-lg shadow-green-500/30 transition-all hover:scale-110 animate-pulse">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Исходящий звонок
  if (callState.isCalling && !callState.isActive) {
    const statusInfo = getStatusInfo();
    return (
      <>
        {persistentAudio}
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900/95 rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center">
            <div className="relative mb-6 inline-block">
              <div className="absolute -inset-4 rounded-full bg-purple-500/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-0.5">
                <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                  {callState.remoteUser?.avatar ? <img src={callState.remoteUser.avatar} alt="" className="w-full h-full object-cover" />
                    : <span className="text-4xl text-white">{callState.remoteUser?.displayName?.[0] || '?'}</span>}
                </div>
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">{callState.remoteUser?.displayName}</h2>
            <p className="text-gray-400 mb-2">Вызов...</p>
            {iceStatus && <p className={`text-sm mb-6 ${statusInfo.color}`}>{statusInfo.text}</p>}
            <button onClick={endCall} className="w-16 h-16 mx-auto rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all hover:scale-110">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </>
    );
  }

  // Свёрнутый звонок
  if (callState.isActive && callState.isMinimized) {
    return (
      <>
        {persistentAudio}
        <div onClick={maximizeCall} className="fixed top-4 right-4 z-50 cursor-pointer safe-top">
          <div className="bg-gray-800/95 backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-white/10 flex items-center gap-3 hover:scale-105 transition-all">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-0.5">
                <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                  {callState.remoteUser?.avatar ? <img src={callState.remoteUser.avatar} alt="" className="w-full h-full object-cover" />
                    : <span className="text-lg text-white">{callState.remoteUser?.displayName?.[0] || '?'}</span>}
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-800 animate-pulse" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">{callState.remoteUser?.displayName}</p>
              <p className="text-green-400 text-xs">{formatDuration(callDuration)}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); endCall(); }}
              className="ml-2 w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </>
    );
  }

  // Активный звонок
  if (callState.isActive) {
    const isVideo = callState.type === 'video';
    const statusInfo = getStatusInfo();
    
    return (
      <>
        {persistentAudio}
        <div className="fixed inset-0 bg-black/40 z-40" onClick={minimizeCall} />
        
        <div 
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ width: callSize.width, height: callSize.height, maxWidth: '95vw', maxHeight: '95vh' }}
        >
          {/* Resize handles */}
          <div className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-10" onMouseDown={(e) => handleResizeStart(e, 'nw')} onTouchStart={(e) => handleResizeStart(e, 'nw')} />
          <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-10" onMouseDown={(e) => handleResizeStart(e, 'ne')} onTouchStart={(e) => handleResizeStart(e, 'ne')} />
          <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-10" onMouseDown={(e) => handleResizeStart(e, 'sw')} onTouchStart={(e) => handleResizeStart(e, 'sw')} />
          <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10" onMouseDown={(e) => handleResizeStart(e, 'se')} onTouchStart={(e) => handleResizeStart(e, 'se')} />
          <div className="absolute top-0 left-4 right-4 h-2 cursor-n-resize z-10" onMouseDown={(e) => handleResizeStart(e, 'n')} onTouchStart={(e) => handleResizeStart(e, 'n')} />
          <div className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize z-10" onMouseDown={(e) => handleResizeStart(e, 's')} onTouchStart={(e) => handleResizeStart(e, 's')} />
          <div className="absolute left-0 top-4 bottom-4 w-2 cursor-w-resize z-10" onMouseDown={(e) => handleResizeStart(e, 'w')} onTouchStart={(e) => handleResizeStart(e, 'w')} />
          <div className="absolute right-0 top-4 bottom-4 w-2 cursor-e-resize z-10" onMouseDown={(e) => handleResizeStart(e, 'e')} onTouchStart={(e) => handleResizeStart(e, 'e')} />
          
          {isVideo ? (
            <div className="relative w-full h-full bg-black flex flex-col">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              
              <div className="absolute top-3 right-3 w-24 h-32 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-gray-800">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {isVideoOff && (
                  <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">Камера выкл</span>
                  </div>
                )}
              </div>
              
              <div className="absolute top-3 left-3">
                <p className="text-white font-semibold drop-shadow-lg">{callState.remoteUser?.displayName}</p>
                <div className="flex items-center gap-1.5">
                  {statusInfo.dot && <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />}
                  <p className={`text-sm drop-shadow-lg ${statusInfo.color || 'text-white/70'}`}>
                    {statusInfo.text || formatDuration(callDuration)}
                  </p>
                </div>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-center text-white/80 text-sm mb-3">{formatDuration(callDuration)}</p>
                <div className="flex justify-center gap-3">
                  <button onClick={toggleMute}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}>
                    {isMuted ? (
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    )}
                  </button>
                  <button onClick={toggleVideo}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isVideoOff ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}>
                    {isVideoOff ? (
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                  <button onClick={switchCamera}
                    className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                  <button onClick={minimizeCall}
                    className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button onClick={endCall}
                    className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="text-center">
                <div className="relative inline-block mb-4">
                  {remoteStream && (
                    <>
                      <div className="absolute -inset-3 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '2.5s' }} />
                      <div className="absolute -inset-6 rounded-full bg-green-500/10 animate-ping" style={{ animationDuration: '3s' }} />
                    </>
                  )}
                  <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-0.5">
                    <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                      {callState.remoteUser?.avatar ? <img src={callState.remoteUser.avatar} alt="" className="w-full h-full object-cover" />
                        : <span className="text-4xl text-white">{callState.remoteUser?.displayName?.[0] || '?'}</span>}
                    </div>
                  </div>
                </div>
                
                <h2 className="text-xl font-bold text-white mb-1">{callState.remoteUser?.displayName}</h2>
                
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {statusInfo.dot && <span className={`w-2 h-2 rounded-full ${statusInfo.dot} ${iceStatus === 'checking' ? 'animate-pulse' : ''}`} />}
                  <p className={`text-sm ${statusInfo.color}`}>{statusInfo.text}</p>
                </div>
                
                <p className="text-white/60 text-lg mb-6">{formatDuration(callDuration)}</p>
                
                {remoteStream && (
                  <div className="flex items-center justify-center gap-1 mb-6">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="w-1 bg-green-500 rounded-full animate-pulse"
                        style={{ height: `${8 + Math.random() * 16}px`, animationDelay: `${i * 0.15}s`, animationDuration: '1s' }} />
                    ))}
                  </div>
                )}
                
                <div className="flex justify-center gap-4">
                  <button onClick={toggleMute}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`}>
                    {isMuted ? (
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    )}
                  </button>
                  <button onClick={minimizeCall}
                    className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button onClick={endCall}
                    className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return persistentAudio;
}

function AppContent() {
  const { user, isLoading, activeChat, setActiveChat, chatBackground } = useApp();
  
  const {
    groupCallState,
    initiateGroupCall,
    joinGroupCall,
    rejectGroupCall,
    leaveGroupCall,
    minimizeCall,
    maximizeCall,
    setJitsiContainer
  } = useGroupCall(user);
  
  const groupCallContextValue = useMemo(() => ({
    initiateGroupCall
  }), [initiateGroupCall]);
  
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (activeChat && isMobile) setShowChat(true);
  }, [activeChat, isMobile]);

  if (isLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center animated-bg">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
        <div className="text-center relative z-10">
          <div className="w-20 h-20 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 animate-spin" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-1 rounded-full bg-gray-900" />
            <div className="absolute inset-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">Mandlscord</h1>
          <p className="text-gray-400 mt-2">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthForms />;

  const handleBack = () => { setShowChat(false); setActiveChat(null); };

  return (
    <GroupCallContext.Provider value={groupCallContextValue}>
    <div className="h-[100dvh] flex animated-bg overflow-hidden">
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
      
      <div className={`${isMobile ? (showChat ? 'hidden' : 'w-full') : 'w-80 border-r border-white/10'} flex-shrink-0 relative z-10`}>
        <div className="h-full flex flex-col bg-gray-900/80 backdrop-blur-xl">
          <div className="p-3 safe-top border-b border-white/10 flex items-center justify-between">
            <button onClick={() => setShowProfile(true)} className="flex items-center gap-3 hover:bg-white/10 p-2 rounded-xl transition-all">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 p-0.5 shadow-lg shadow-purple-500/20">
                <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                  {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-white font-bold text-lg">{user.displayName[0]}</span>}
                </div>
              </div>
              <div className="text-left">
                <p className="text-white font-medium">{user.displayName}</p>
                <p className="text-gray-400 text-sm">@{user.username}</p>
              </div>
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <Sidebar onChatSelect={() => isMobile && setShowChat(true)} />
        </div>
      </div>

      <div className={`flex-1 ${isMobile ? (showChat ? 'block' : 'hidden') : 'block'} relative z-10 ${
        chatBackground === 'gradient1' ? 'bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950' :
        chatBackground === 'gradient2' ? 'bg-gradient-to-br from-cyan-950 via-blue-950 to-slate-950' :
        chatBackground === 'gradient3' ? 'bg-gradient-to-br from-orange-950 via-rose-950 to-purple-950' :
        chatBackground === 'gradient4' ? 'bg-gradient-to-br from-green-950 via-emerald-950 to-teal-950' :
        chatBackground === 'gradient5' ? 'bg-gradient-to-br from-red-950 via-orange-950 to-yellow-950' :
        chatBackground === 'gradient6' ? 'bg-gradient-to-br from-green-950 via-cyan-950 to-purple-950' : ''
      }`}>
        <ChatWindow onBack={handleBack} isMobile={isMobile} />
      </div>

      {showProfile && <Profile onClose={() => setShowProfile(false)} />}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-gray-900">
          <Settings onClose={() => setShowSettings(false)} />
        </div>
      )}
      <CallUI />
      <GroupCallUI 
        groupCallState={groupCallState}
        joinGroupCall={joinGroupCall}
        rejectGroupCall={rejectGroupCall}
        leaveGroupCall={leaveGroupCall}
        minimizeCall={minimizeCall}
        maximizeCall={maximizeCall}
        setJitsiContainer={setJitsiContainer}
      />
    </div>
    </GroupCallContext.Provider>
  );
}

export default function App() {
  return <AppContent />;
}
