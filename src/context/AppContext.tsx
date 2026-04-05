import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import socketService from '../services/socket';
import { User, Chat, Message } from '../types';
import { playMessageSound, playCallSound, playSendSound, playEndCallSound } from '../utils/sounds';

// Типы для звонков

interface CallState {
  isActive: boolean;
  isCalling: boolean;
  isIncoming: boolean;
  isMinimized: boolean;
  type: 'audio' | 'video';
  remoteUser: User | null;
  offer: RTCSessionDescriptionInit | null;
}

interface AppContextType {
  user: User | null;
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  userStatuses: Record<string, string>;
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  chatBackground: string;
  setChatBackground: (bg: string) => void;
  typingUsers: Record<string, string[]>;
  sendTyping: (chatId: string) => void;
  drafts: Record<string, string>;
  saveDraft: (chatId: string, text: string) => void;
  getDraft: (chatId: string) => string;
  login: (username: string, password: string) => Promise<void>;
  register: (data: { username: string; email: string; displayName: string; password: string }) => Promise<void>;
  logout: () => void;
  selectChat: (chat: Chat) => void;
  setActiveChat: (chat: Chat | null) => void;
  sendMessage: (content: string, type?: 'text' | 'image' | 'voice' | 'video' | 'audio' | 'file', duration?: number) => void;
  createChat: (participants: string[], isGroup?: boolean, name?: string) => void;
  searchUsers: (query: string) => Promise<User[]>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  getUserProfile: (username: string) => Promise<User | null>;
  loadChats: () => void;
  initiateCall: (targetUsername: string, type: 'audio' | 'video') => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  minimizeCall: () => void;
  maximizeCall: () => void;
  markMessagesRead: (chatId: string) => void;
  markVoiceListened: (messageId: string) => void;
  deleteMessage: (messageId: string, forEveryone: boolean) => void;
  isMuted: boolean;
  isVideoOff: boolean;
  networkQuality: 'good' | 'fair' | 'poor';
  downloadProgress: Record<string, {progress: number; type: string; total: string}>;
  startDownload: (messageId: string, type: string, totalBytes: number) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}

// Оптимизированная WebRTC конфигурация для слабого интернета
const getIceServers = async (lowBandwidth = false): Promise<RTCConfiguration> => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/ice-servers', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[ICE] Got', data.iceServers?.length || 0, 'servers from API');
      if (data.iceServers && data.iceServers.length > 0) {
        const hasTurn = data.iceServers.some((s: {urls: string | string[]}) => 
          (typeof s.urls === 'string' && s.urls.includes('turn')) ||
          (Array.isArray(s.urls) && s.urls.some(u => u.includes('turn')))
        );
        console.log('[ICE] Has TURN servers:', hasTurn);
        return { 
          iceServers: data.iceServers, 
          iceCandidatePoolSize: lowBandwidth ? 5 : 10,
          iceTransportPolicy: lowBandwidth ? 'relay' : 'all'
        };
      }
    }
  } catch (err) {
    console.error('[ICE] Failed to get servers from API:', err);
  }
  
  console.log('[ICE] Using fallback servers');
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
        username: 'webrtc',
        credential: 'webrtc'
      }
    ],
    iceCandidatePoolSize: lowBandwidth ? 5 : 10,
    iceTransportPolicy: lowBandwidth ? 'relay' : 'all'
  };
};

// Настройки кодеков для слабого интернета
const getLowBandwidthConstraints = () => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 16000
  },
  video: {
    width: { ideal: 320, max: 640 },
    height: { ideal: 240, max: 480 },
    frameRate: { ideal: 15, max: 20 }
  }
});

const getNormalConstraints = () => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
  }
});

const applyLowBitrate = (pc: RTCPeerConnection) => {
  pc.getSenders().forEach(sender => {
    if (sender.track?.kind === 'audio') {
      const params = sender.getParameters();
      params.encodings = [{ maxBitrate: 20000 }];
      sender.setParameters(params).catch(() => {});
    } else if (sender.track?.kind === 'video') {
      const params = sender.getParameters();
      params.encodings = [{ maxBitrate: 150000, maxFramerate: 15 }];
      sender.setParameters(params).catch(() => {});
    }
  });
};

const applyNormalBitrate = (pc: RTCPeerConnection) => {
  pc.getSenders().forEach(sender => {
    if (sender.track?.kind === 'audio') {
      const params = sender.getParameters();
      params.encodings = [{ maxBitrate: 64000 }];
      sender.setParameters(params).catch(() => {});
    } else if (sender.track?.kind === 'video') {
      const params = sender.getParameters();
      params.encodings = [{ maxBitrate: 1500000, maxFramerate: 30 }];
      sender.setParameters(params).catch(() => {});
    }
  });
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userStatuses, setUserStatuses] = useState<Record<string, string>>({});
  
  // Call states
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    isCalling: false,
    isIncoming: false,
    isMinimized: false,
    type: 'audio',
    remoteUser: null,
    offer: null
  });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [chatBackground, setChatBackgroundState] = useState(() => localStorage.getItem('chatBackground') || 'default');
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [networkQuality, setNetworkQuality] = useState<'good' | 'fair' | 'poor'>('good');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, {progress: number; type: string; total: string}>>({});
  const typingTimeoutRef = useRef<number | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const callSoundRef = useRef<{ stop: () => void } | null>(null);
  const activeChatRef = useRef<Chat | null>(null);
  
  // Keep activeChatRef in sync
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Проверка сохранённой сессии с fallback
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await socketService.verifyToken();
        if (result?.user) {
          setUser(result.user);
        } else {
          // Fallback: пробуем восстановить из localStorage
          const savedUser = localStorage.getItem('user');
          const token = socketService.getToken();
          if (savedUser && token) {
            try {
              const parsed = JSON.parse(savedUser);
              setUser(parsed);
            } catch {
              localStorage.removeItem('user');
              socketService.setToken(null);
            }
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        // При ошибке сети — пробуем из localStorage
        const savedUser = localStorage.getItem('user');
        const token = socketService.getToken();
        if (savedUser && token) {
          try {
            setUser(JSON.parse(savedUser));
          } catch {
            localStorage.removeItem('user');
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Подключение сокета при авторизации
  useEffect(() => {
    if (!user) return;

    const socket = socketService.connect();
    if (!socket) return;

    socket.on('users:online', (onlineUsers: string[]) => {
      const statuses: Record<string, string> = {};
      onlineUsers.forEach(u => {
        statuses[u] = 'online';
      });
      setUserStatuses(prev => ({ ...prev, ...statuses }));
    });

    socket.on('user:status', ({ username, status }: { username: string; status: string }) => {
      setUserStatuses(prev => ({ ...prev, [username]: status }));
    });

    socket.on('message:new', ({ chatId, message }: { chatId: string; message: Message }) => {
      if (activeChatRef.current?.id === chatId) {
        setMessages(prev => [...prev, message]);
      }
      
      // Play notification sound for messages from others
      if (message.senderUsername !== user.username) {
        playMessageSound();
      }
      
      setChats(prev => prev.map(chat => {
        if (chat.id === chatId) {
          return { ...chat, lastMessage: message };
        }
        return chat;
      }).sort((a, b) => {
        const aTime = a.lastMessage?.timestamp || a.createdAt || '';
        const bTime = b.lastMessage?.timestamp || b.createdAt || '';
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      }));
    });

    // Слушаем обновления прочтения сообщений
    socket.on('messages:updated', ({ chatId, messages: updatedMsgs }: { chatId: string; messages: Message[] }) => {
      if (activeChat?.id === chatId) {
        setMessages(updatedMsgs);
      }
    });

    // Слушаем typing
    socket.on('typing:update', ({ chatId, username: typingUser, isTyping }: { chatId: string; username: string; isTyping: boolean }) => {
      setTypingUsers(prev => {
        const current = prev[chatId] || [];
        if (isTyping) {
          if (!current.includes(typingUser)) return { ...prev, [chatId]: [...current, typingUser] };
        } else {
          return { ...prev, [chatId]: current.filter(u => u !== typingUser) };
        }
        return prev;
      });
    });

    // Загружаем черновики
    socket.emit('drafts:get', (userDrafts: Record<string, string>) => {
      if (userDrafts) setDrafts(userDrafts);
    });

    // Синхронизация черновиков между устройствами
    socket.on(`draft:sync:${user.username}`, ({ chatId, text }: { chatId: string; text: string }) => {
      setDrafts(prev => {
        if (text) return { ...prev, [chatId]: text };
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    });

    // Слушаем обновления прослушивания голосовых
    socket.on('voice:updated', ({ messageId, listenedBy }: { messageId: string; listenedBy: string[] }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, listenedBy };
        }
        return msg;
      }));
    });

    // Слушаем удаление сообщений
    socket.on('message:deleted', ({ messageId, forEveryone, deletedFor }: { messageId: string; forEveryone: boolean; deletedFor?: string[] }) => {
      // Отправляем событие для анимации частиц
      if (forEveryone) {
        window.dispatchEvent(new CustomEvent('message:deleted:animate', { detail: { messageId } }));
        setTimeout(() => {
          setMessages(prev => prev.map(msg => 
            msg.id === messageId ? { ...msg, deleted: true, content: '' } : msg
          ));
        }, 400);
      } else if (deletedFor?.includes(user.username)) {
        window.dispatchEvent(new CustomEvent('message:deleted:animate', { detail: { messageId } }));
        setTimeout(() => {
          setMessages(prev => prev.filter(msg => msg.id !== messageId));
        }, 400);
      }
    });

    socket.on(`chat:updated:${user.username}`, ({ chatId, lastMessage, unreadCount }: { chatId: string; lastMessage?: Message; unreadCount?: number }) => {
      setChats(prev => {
        const chatExists = prev.some(c => c.id === chatId);
        if (!chatExists) {
          // Загружаем чаты один раз, не дублируя
          setTimeout(() => loadChats(), 100);
          return prev;
        }
        // Обновляем существующий чат без дублирования
        return prev.map(chat => {
          if (chat.id === chatId) {
            return { 
              ...chat, 
              ...(lastMessage && { lastMessage }),
              ...(unreadCount !== undefined && { unreadCount })
            };
          }
          return chat;
        }).filter((chat, index, self) => 
          index === self.findIndex(c => c.id === chat.id)
        ).sort((a, b) => {
          const aTime = a.lastMessage?.timestamp || a.createdAt || '';
          const bTime = b.lastMessage?.timestamp || b.createdAt || '';
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
      });
    });

    return () => {
      socket.off('users:online');
      socket.off('user:status');
      socket.off('message:new');
      socket.off('messages:updated');
      socket.off('voice:updated');
      socket.off('message:deleted');
      socket.off('typing:update');
      socket.off(`draft:sync:${user.username}`);
      socket.off(`chat:updated:${user.username}`);
    };
  }, [user, activeChat]);

  const loadChats = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket || !user) return;

    socket.emit('chats:get', (userChats: Chat[]) => {
      setChats(userChats);
    });
  }, [user]);

  useEffect(() => {
    if (user) loadChats();
  }, [user, loadChats]);

  const login = async (username: string, password: string) => {
    const result = await socketService.login(username, password);
    setUser(result.user);
    localStorage.setItem('user', JSON.stringify(result.user));
  };

  const register = async (data: { username: string; email: string; displayName: string; password: string }) => {
    const result = await socketService.register(data);
    setUser(result.user);
    localStorage.setItem('user', JSON.stringify(result.user));
  };

  const logout = () => {
    socketService.logout();
    setUser(null);
    setChats([]);
    setActiveChat(null);
    setMessages([]);
  };

  const selectChat = (chat: Chat) => {
    const socket = socketService.getSocket();
    if (!socket) return;

    if (activeChat) {
      socket.emit('chat:leave', activeChat.id);
    }

    setActiveChat(chat);
    socket.emit('chat:join', chat.id);

    socket.emit('chat:get', {
      participants: chat.participants,
      isGroup: chat.isGroup,
      name: chat.name
    }, (data: { messages: Message[] }) => {
      setMessages(data.messages || []);
    });
  };

  const sendMessage = (content: string, type: 'text' | 'image' | 'voice' | 'video' | 'audio' | 'file' = 'text', duration?: number) => {
    const socket = socketService.getSocket();
    if (!socket || !activeChat || !user) return;

    const message = {
      senderId: user.id,
      senderUsername: user.username,
      senderName: user.displayName,
      senderAvatar: user.avatar,
      content,
      type,
      duration
    };

    socket.emit('message:send', { chatId: activeChat.id, message });
    playSendSound();
  };

  const createChat = (participants: string[], isGroup = false, name?: string) => {
    const socket = socketService.getSocket();
    if (!socket || !user) return;

    const allParticipants = [...new Set([...participants, user.username])];

    socket.emit('chat:get', {
      participants: allParticipants,
      isGroup,
      name
    }, (data: { chat: Chat; messages: Message[] }) => {
      setActiveChat(data.chat);
      setMessages(data.messages || []);
      socket.emit('chat:join', data.chat.id);
      loadChats();
    });
  };

  const searchUsers = async (query: string): Promise<User[]> => {
    try {
      const result = await socketService.searchUsers(query);
      return result.users.filter((u: User) => u.username !== user?.username);
    } catch {
      return [];
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    try {
      const result = await socketService.updateProfile(user.username, updates);
      setUser(result.user);
      localStorage.setItem('user', JSON.stringify(result.user));
      
      const socket = socketService.getSocket();
      if (socket && updates.status) {
        socket.emit('user:status:update', { status: updates.status });
      }
    } catch (err) {
      console.error('Update profile failed:', err);
    }
  };

  const getUserProfile = async (username: string): Promise<User | null> => {
    try {
      const result = await socketService.getUser(username);
      return result.user;
    } catch {
      return null;
    }
  };

  // ==================== WebRTC Functions ====================
  
  const cleanupCall = useCallback(() => {
    if (peerConnectionRef.current) {
      // @ts-expect-error clear monitor interval
      if (peerConnectionRef.current._monitorInterval) {
        // @ts-expect-error clear monitor interval
        clearInterval(peerConnectionRef.current._monitorInterval);
      }
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      // @ts-expect-error cleanup
      window.__peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    setCallState({
      isActive: false,
      isCalling: false,
      isIncoming: false,
      isMinimized: false,
      type: 'audio',
      remoteUser: null,
      offer: null
    });
    pendingCandidatesRef.current = [];
    setIsMuted(false);
    setIsVideoOff(false);
    setNetworkQuality('good');
  }, [localStream]);

  const initiateCall = async (targetUsername: string, type: 'audio' | 'video') => {
    const socket = socketService.getSocket();
    if (!socket) {
      console.error('No socket available');
      return;
    }

    try {
      console.log('=== INITIATING CALL ===');
      console.log('Target:', targetUsername, 'Type:', type);
      
      const isLowBandwidth = networkQuality !== 'good';
      const constraints = isLowBandwidth ? getLowBandwidthConstraints() : getNormalConstraints();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints.audio,
        video: type === 'video' ? constraints.video : false
      });
      setLocalStream(stream);

      const iceConfig = await getIceServers(isLowBandwidth);
      console.log('[CALL] Using ICE config with', iceConfig.iceServers?.length, 'servers, low bandwidth:', isLowBandwidth);
      
      const pc = new RTCPeerConnection(iceConfig);
      peerConnectionRef.current = pc;
      // @ts-expect-error expose for camera switch & ICE status
      window.__peerConnection = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        console.log('Remote track received');
        setRemoteStream(event.streams[0]);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate to:', targetUsername);
          socket.emit('call:ice-candidate', {
            to: targetUsername,
            candidate: event.candidate.toJSON()
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.log('ICE failed, attempting restart...');
          pc.restartIce();
        } else if (pc.iceConnectionState === 'disconnected') {
          setNetworkQuality('poor');
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              pc.restartIce();
            }
          }, 3000);
        } else if (pc.iceConnectionState === 'connected') {
          setNetworkQuality('good');
          applyNormalBitrate(pc);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          console.log('Connection failed, cleaning up');
          cleanupCall();
        }
      };

      // Monitor stats for bitrate adaptation
      const monitorInterval = setInterval(() => {
        if (!pc || pc.connectionState !== 'connected') return;
        pc.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              const bytesReceived = report.bytesReceived || 0;
              const bytesSent = report.bytesSent || 0;
              const totalBytes = bytesReceived + bytesSent;
              
              if (totalBytes < 10000 && networkQuality !== 'poor') {
                setNetworkQuality('poor');
                applyLowBitrate(pc);
              } else if (totalBytes > 100000 && networkQuality === 'poor') {
                setNetworkQuality('fair');
                applyLowBitrate(pc);
              } else if (totalBytes > 500000 && networkQuality !== 'good') {
                setNetworkQuality('good');
                applyNormalBitrate(pc);
              }
            }
          });
        }).catch(() => {});
      }, 5000);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Get target user info
      const targetUser = await getUserProfile(targetUsername);
      
      setCallState({
        isActive: false,
        isCalling: true,
        isIncoming: false,
        isMinimized: false,
        type,
        remoteUser: targetUser,
        offer: null
      });

      // Play ringing sound for caller
      if (callSoundRef.current) callSoundRef.current.stop();
      callSoundRef.current = playCallSound();

      console.log('Sending call:initiate with offer');
      socket.emit('call:initiate', {
        to: targetUsername,
        type,
        offer: pc.localDescription?.toJSON()
      });

      // Store interval for cleanup
      // @ts-expect-error store on pc
      pc._monitorInterval = monitorInterval;

    } catch (err) {
      console.error('Error initiating call:', err);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    const socket = socketService.getSocket();
    if (!socket || !callState.offer || !callState.remoteUser) {
      console.error('Cannot accept call - missing data');
      return;
    }

    if (callSoundRef.current) {
      callSoundRef.current.stop();
      callSoundRef.current = null;
    }

    try {
      console.log('=== ACCEPTING CALL ===');
      
      const isLowBandwidth = networkQuality !== 'good';
      const constraints = isLowBandwidth ? getLowBandwidthConstraints() : getNormalConstraints();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints.audio,
        video: callState.type === 'video' ? constraints.video : false
      });
      setLocalStream(stream);

      const iceConfig = await getIceServers(isLowBandwidth);
      console.log('[CALL] Using ICE config with', iceConfig.iceServers?.length, 'servers, low bandwidth:', isLowBandwidth);
      
      const pc = new RTCPeerConnection(iceConfig);
      peerConnectionRef.current = pc;
      // @ts-expect-error expose for camera switch & ICE status
      window.__peerConnection = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        console.log('Remote track received');
        setRemoteStream(event.streams[0]);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && callState.remoteUser) {
          socket.emit('call:ice-candidate', {
            to: callState.remoteUser.username,
            candidate: event.candidate.toJSON()
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.log('ICE failed, attempting restart...');
          pc.restartIce();
        } else if (pc.iceConnectionState === 'disconnected') {
          setNetworkQuality('poor');
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              pc.restartIce();
            }
          }, 3000);
        } else if (pc.iceConnectionState === 'connected') {
          setNetworkQuality('good');
          applyNormalBitrate(pc);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          console.log('Connection failed, cleaning up');
          cleanupCall();
        }
      };

      // Monitor stats
      const monitorInterval = setInterval(() => {
        if (!pc || pc.connectionState !== 'connected') return;
        pc.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              const bytesReceived = report.bytesReceived || 0;
              const bytesSent = report.bytesSent || 0;
              const totalBytes = bytesReceived + bytesSent;
              
              if (totalBytes < 10000 && networkQuality !== 'poor') {
                setNetworkQuality('poor');
                applyLowBitrate(pc);
              } else if (totalBytes > 100000 && networkQuality === 'poor') {
                setNetworkQuality('fair');
                applyLowBitrate(pc);
              } else if (totalBytes > 500000 && networkQuality !== 'good') {
                setNetworkQuality('good');
                applyNormalBitrate(pc);
              }
            }
          });
        }).catch(() => {});
      }, 5000);

      await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));
      
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call:accept', {
        to: callState.remoteUser.username,
        answer: pc.localDescription?.toJSON()
      });

      setCallState(prev => ({
        ...prev,
        isActive: true,
        isIncoming: false
      }));

      // @ts-expect-error store on pc
      pc._monitorInterval = monitorInterval;

    } catch (err) {
      console.error('Error accepting call:', err);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (callSoundRef.current) {
      callSoundRef.current.stop();
      callSoundRef.current = null;
    }
    const socket = socketService.getSocket();
    if (socket && callState.remoteUser) {
      socket.emit('call:reject', { to: callState.remoteUser.username });
    }
    cleanupCall();
  };

  const endCall = useCallback(() => {
    if (callSoundRef.current) {
      callSoundRef.current.stop();
      callSoundRef.current = null;
    }
    playEndCallSound();
    const socket = socketService.getSocket();
    if (socket && callState.remoteUser) {
      socket.emit('call:end', { to: callState.remoteUser.username });
    }
    cleanupCall();
  }, [callState.remoteUser, cleanupCall]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(prev => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(prev => !prev);
    }
  };

  const minimizeCall = () => {
    setCallState(prev => ({ ...prev, isMinimized: true }));
  };

  const maximizeCall = () => {
    setCallState(prev => ({ ...prev, isMinimized: false }));
  };

  const markMessagesRead = (chatId: string) => {
    const socket = socketService.getSocket();
    if (!socket || !user) return;
    
    socket.emit('messages:read', { chatId, username: user.username });
    setMessages(prev => prev.map(msg => ({
      ...msg,
      readBy: msg.readBy ? [...new Set([...msg.readBy, user.username])] : [user.username]
    })));
    
    // Обновляем счётчик непрочитанных в списке чатов
    setChats(prev => prev.map(chat => {
      if (chat.id === chatId) {
        return { ...chat, unreadCount: 0 };
      }
      return chat;
    }));
  };

  const setChatBackground = (bg: string) => {
    setChatBackgroundState(bg);
    localStorage.setItem('chatBackground', bg);
  };

  const sendTyping = (chatId: string) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('typing:start', { chatId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit('typing:stop', { chatId });
    }, 2000);
  };

  const saveDraft = (chatId: string, text: string) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    setDrafts(prev => ({ ...prev, [chatId]: text }));
    socket.emit('draft:save', { chatId, text });
  };

  const getDraft = (chatId: string): string => {
    return drafts[chatId] || '';
  };

  const markVoiceListened = (messageId: string) => {
    const socket = socketService.getSocket();
    if (!socket || !user || !activeChat) return;
    
    socket.emit('voice:listened', { chatId: activeChat.id, messageId, username: user.username });
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          listenedBy: msg.listenedBy ? [...new Set([...msg.listenedBy, user.username])] : [user.username]
        };
      }
      return msg;
    }));
  };

  const deleteMessage = (messageId: string, forEveryone: boolean) => {
    const socket = socketService.getSocket();
    if (!socket || !user || !activeChat) return;
    
    socket.emit('message:delete', { 
      chatId: activeChat.id, 
      messageId, 
      username: user.username,
      forEveryone 
    });
    
    if (forEveryone) {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, deleted: true, content: 'Сообщение удалено' } : msg
      ));
    } else {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const startDownload = (messageId: string, type: string, totalBytes: number) => {
    const totalStr = formatBytes(totalBytes);
    setDownloadProgress(prev => ({ ...prev, [messageId]: { progress: 0, type, total: totalStr } }));

    const steps = 25;
    const stepTime = Math.max(30, Math.min(100, totalBytes / 15000));
    let current = 0;

    const interval = setInterval(() => {
      current += totalBytes / steps;
      if (current >= totalBytes) {
        current = totalBytes;
        clearInterval(interval);
        setDownloadProgress(prev => {
          const next = { ...prev };
          delete next[messageId];
          return next;
        });
      }
      setDownloadProgress(prev => ({
        ...prev,
        [messageId]: { ...prev[messageId], progress: Math.min(100, (current / totalBytes) * 100) }
      }));
    }, stepTime);
  };

  // WebRTC event listeners
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !user) return;

    const handleIncomingCall = async (data: { from: User; type: 'audio' | 'video'; offer: RTCSessionDescriptionInit }) => {
      console.log('=== INCOMING CALL ===');
      console.log('From:', data.from?.username);
      console.log('Type:', data.type);
      console.log('Has offer:', !!data.offer);
      
      if (callState.isActive || callState.isCalling) {
        console.log('Already in a call, rejecting');
        socket.emit('call:reject', { to: data.from.username });
        return;
      }

      // Play ringing sound
      if (callSoundRef.current) callSoundRef.current.stop();
      callSoundRef.current = playCallSound();

      setCallState({
        isActive: false,
        isCalling: false,
        isIncoming: true,
        isMinimized: false,
        type: data.type,
        remoteUser: data.from,
        offer: data.offer
      });
    };

    const handleCallAccepted = async (data: { answer: RTCSessionDescriptionInit }) => {
      console.log('=== CALL ACCEPTED ===');
      if (callSoundRef.current) {
        callSoundRef.current.stop();
        callSoundRef.current = null;
      }
      const pc = peerConnectionRef.current;
      if (pc && data.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        
        // Process pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current = [];
        
        setCallState(prev => ({
          ...prev,
          isActive: true,
          isCalling: false
        }));
      }
    };

    const handleCallRejected = () => {
      console.log('=== CALL REJECTED ===');
      if (callSoundRef.current) {
        callSoundRef.current.stop();
        callSoundRef.current = null;
      }
      playEndCallSound();
      cleanupCall();
    };

    const handleCallEnded = () => {
      console.log('=== CALL ENDED ===');
      if (callSoundRef.current) {
        callSoundRef.current.stop();
        callSoundRef.current = null;
      }
      playEndCallSound();
      cleanupCall();
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      const pc = peerConnectionRef.current;
      if (pc && data.candidate) {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            pendingCandidatesRef.current.push(new RTCIceCandidate(data.candidate));
          }
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    };

    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:ice-candidate', handleIceCandidate);
    };
  }, [user, callState.isActive, callState.isCalling, cleanupCall]);

  return (
    <AppContext.Provider value={{
      user,
      chats,
      activeChat,
      messages,
      isLoading,
      userStatuses,
      callState,
      localStream,
      remoteStream,
      chatBackground,
      setChatBackground,
      typingUsers,
      sendTyping,
      login,
      register,
      logout,
      selectChat,
      setActiveChat,
      sendMessage,
      createChat,
      searchUsers,
      updateProfile,
      getUserProfile,
      loadChats,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      toggleVideo,
      minimizeCall,
      maximizeCall,
      markMessagesRead,
      markVoiceListened,
      deleteMessage,
      isMuted,
      isVideoOff,
      networkQuality,
      downloadProgress,
      startDownload,
      drafts,
      saveDraft,
      getDraft
    }}>
      {children}
    </AppContext.Provider>
  );
}
