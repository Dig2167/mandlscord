import { useState, useCallback, useRef, useEffect } from 'react';
import socketService from '../services/socket';
import { User } from '../types';
import { playCallSound, playEndCallSound } from '../utils/sounds';

export interface GroupCallState {
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
}

export function useGroupCall(currentUser: User | null) {
  const [groupCallState, setGroupCallState] = useState<GroupCallState>({
    isActive: false,
    isIncoming: false,
    isCalling: false,
    isMinimized: false,
    callType: 'audio',
    chatId: '',
    chatName: '',
    roomId: '',
    participants: [],
    initiator: ''
  });
  
  const callSoundRef = useRef<{ stop: () => void } | null>(null);
  const jitsiApiRef = useRef<any>(null);
  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);

  const cleanup = useCallback(() => {
    console.log('[GROUP CALL] Cleanup');
    
    // Dispose Jitsi
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }
    
    // Stop sound
    if (callSoundRef.current) {
      callSoundRef.current.stop();
      callSoundRef.current = null;
    }
    
    // Reset state
    setGroupCallState({
      isActive: false,
      isIncoming: false,
      isCalling: false,
      isMinimized: false,
      callType: 'audio',
      chatId: '',
      chatName: '',
      roomId: '',
      participants: [],
      initiator: ''
    });
  }, []);

  const loadJitsiScript = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).JitsiMeetExternalAPI) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Jitsi'));
      document.body.appendChild(script);
    });
  }, []);

  const startJitsiCall = useCallback(async (
    roomId: string,
    displayName: string,
    isVideo: boolean,
    container: HTMLDivElement
  ) => {
    await loadJitsiScript();
    
    const JitsiMeetExternalAPI = (window as any).JitsiMeetExternalAPI;
    if (!JitsiMeetExternalAPI) {
      throw new Error('Jitsi API not loaded');
    }
    
    // Dispose previous instance
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
    }
    
    const options = {
      roomName: `mandlscord_${roomId}`,
      parentNode: container,
      width: '100%',
      height: '100%',
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: !isVideo,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
        enableWelcomePage: false,
        enableClosePage: false,
        disableInviteFunctions: true,
        toolbarButtons: [
          'microphone',
          'camera',
          'hangup',
          'tileview',
          'fullscreen',
          ...(isVideo ? ['desktop'] : [])
        ],
        notifications: [],
        hideConferenceSubject: true,
        hideConferenceTimer: false,
        disableRemoteMute: true,
        remoteVideoMenu: { disabled: true },
        defaultLanguage: 'ru'
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_POWERED_BY: false,
        TOOLBAR_ALWAYS_VISIBLE: true,
        TILE_VIEW_MAX_COLUMNS: 5,
        MOBILE_APP_PROMO: false,
        HIDE_INVITE_MORE_HEADER: true,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        DEFAULT_BACKGROUND: '#1a1a2e',
        TOOLBAR_TIMEOUT: 10000
      },
      userInfo: {
        displayName: displayName
      }
    };
    
    const api = new JitsiMeetExternalAPI('meet.jit.si', options);
    jitsiApiRef.current = api;
    
    // Event listeners
    api.addListener('readyToClose', () => {
      console.log('[GROUP CALL] Jitsi closed');
      const socket = socketService.getSocket();
      if (socket && currentUser) {
        socket.emit('group-call:leave', {
          chatId: groupCallState.chatId,
          username: currentUser.username
        });
      }
      playEndCallSound();
      cleanup();
    });
    
    api.addListener('participantJoined', (data: any) => {
      console.log('[GROUP CALL] Participant joined:', data);
    });
    
    api.addListener('participantLeft', (data: any) => {
      console.log('[GROUP CALL] Participant left:', data);
    });
    
    api.addListener('videoConferenceJoined', () => {
      console.log('[GROUP CALL] Joined conference');
      // Stop calling sound
      if (callSoundRef.current) {
        callSoundRef.current.stop();
        callSoundRef.current = null;
      }
    });
    
    return api;
  }, [loadJitsiScript, cleanup, currentUser, groupCallState.chatId]);

  const initiateGroupCall = useCallback(async (
    chatId: string,
    chatName: string,
    targetUsernames: string[],
    type: 'audio' | 'video'
  ) => {
    const socket = socketService.getSocket();
    if (!socket || !currentUser) return;
    
    console.log('[GROUP CALL] Initiating to', targetUsernames);
    
    // Generate unique room ID
    const roomId = `${chatId}_${Date.now()}`;
    
    // Play call sound
    if (callSoundRef.current) callSoundRef.current.stop();
    callSoundRef.current = playCallSound();
    
    setGroupCallState({
      isActive: true,
      isIncoming: false,
      isCalling: true,
      isMinimized: false,
      callType: type,
      chatId,
      chatName,
      roomId,
      participants: targetUsernames,
      initiator: currentUser.username
    });
    
    // Send group call invite to all participants
    socket.emit('group-call:initiate', {
      chatId,
      chatName,
      roomId,
      participants: targetUsernames,
      type,
      from: {
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar
      }
    });
  }, [currentUser]);

  const joinGroupCall = useCallback(async () => {
    const socket = socketService.getSocket();
    if (!socket || !currentUser) return;
    
    console.log('[GROUP CALL] Accepting call');
    
    // Stop ringing
    if (callSoundRef.current) {
      callSoundRef.current.stop();
      callSoundRef.current = null;
    }
    
    setGroupCallState(prev => ({
      ...prev,
      isActive: true,
      isIncoming: false,
      isCalling: false
    }));
    
    // Notify others we joined
    socket.emit('group-call:join', {
      chatId: groupCallState.chatId,
      roomId: groupCallState.roomId,
      from: {
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar
      }
    });
  }, [currentUser, groupCallState.chatId, groupCallState.roomId]);

  const rejectGroupCall = useCallback(() => {
    const socket = socketService.getSocket();
    if (callSoundRef.current) {
      callSoundRef.current.stop();
      callSoundRef.current = null;
    }
    if (socket) {
      socket.emit('group-call:reject', {
        chatId: groupCallState.chatId,
        roomId: groupCallState.roomId
      });
    }
    playEndCallSound();
    cleanup();
  }, [groupCallState.chatId, groupCallState.roomId, cleanup]);

  const leaveGroupCall = useCallback(() => {
    const socket = socketService.getSocket();
    if (socket && currentUser) {
      socket.emit('group-call:leave', {
        chatId: groupCallState.chatId,
        roomId: groupCallState.roomId,
        username: currentUser.username
      });
    }
    
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand('hangup');
    }
    
    playEndCallSound();
    cleanup();
  }, [currentUser, groupCallState.chatId, groupCallState.roomId, cleanup]);

  const minimizeCall = useCallback(() => {
    setGroupCallState(prev => ({ ...prev, isMinimized: true }));
  }, []);

  const maximizeCall = useCallback(() => {
    setGroupCallState(prev => ({ ...prev, isMinimized: false }));
  }, []);

  const setJitsiContainer = useCallback((container: HTMLDivElement | null) => {
    jitsiContainerRef.current = container;
    
    if (container && groupCallState.isActive && !jitsiApiRef.current) {
      startJitsiCall(
        groupCallState.roomId,
        currentUser?.displayName || currentUser?.username || 'User',
        groupCallState.callType === 'video',
        container
      );
    }
  }, [groupCallState.isActive, groupCallState.roomId, groupCallState.callType, currentUser, startJitsiCall]);

  // Socket event listeners
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !currentUser) return;
    
    // Incoming group call
    const handleGroupCallIncoming = (data: {
      chatId: string;
      chatName: string;
      roomId: string;
      type: 'audio' | 'video';
      from: { username: string; displayName: string; avatar?: string };
      participants: string[];
    }) => {
      console.log('[GROUP CALL] Incoming from', data.from.username);
      
      if (groupCallState.isActive || groupCallState.isCalling) {
        socket.emit('group-call:reject', { chatId: data.chatId, roomId: data.roomId });
        return;
      }
      
      if (callSoundRef.current) callSoundRef.current.stop();
      callSoundRef.current = playCallSound();
      
      setGroupCallState({
        isActive: false,
        isIncoming: true,
        isCalling: false,
        isMinimized: false,
        callType: data.type,
        chatId: data.chatId,
        chatName: data.chatName,
        roomId: data.roomId,
        participants: data.participants,
        initiator: data.from.username
      });
    };
    
    // Someone joined
    const handleUserJoined = (data: { chatId: string; roomId: string; username: string }) => {
      if (data.roomId !== groupCallState.roomId) return;
      console.log('[GROUP CALL] User joined:', data.username);
      
      // Stop ringing sound
      if (callSoundRef.current) {
        callSoundRef.current.stop();
        callSoundRef.current = null;
      }
      
      setGroupCallState(prev => ({
        ...prev,
        isCalling: false
      }));
    };
    
    // User left
    const handleUserLeft = (data: { chatId: string; roomId: string; username: string }) => {
      if (data.roomId !== groupCallState.roomId) return;
      console.log('[GROUP CALL] User left:', data.username);
    };
    
    // Call ended by initiator
    const handleCallEnded = (data: { chatId: string; roomId: string }) => {
      if (data.roomId !== groupCallState.roomId) return;
      console.log('[GROUP CALL] Call ended');
      playEndCallSound();
      cleanup();
    };
    
    socket.on('group-call:incoming', handleGroupCallIncoming);
    socket.on('group-call:user-joined', handleUserJoined);
    socket.on('group-call:user-left', handleUserLeft);
    socket.on('group-call:ended', handleCallEnded);
    
    return () => {
      socket.off('group-call:incoming', handleGroupCallIncoming);
      socket.off('group-call:user-joined', handleUserJoined);
      socket.off('group-call:user-left', handleUserLeft);
      socket.off('group-call:ended', handleCallEnded);
    };
  }, [currentUser, groupCallState.isActive, groupCallState.isCalling, groupCallState.roomId, cleanup]);

  return {
    groupCallState,
    initiateGroupCall,
    joinGroupCall,
    rejectGroupCall,
    leaveGroupCall,
    minimizeCall,
    maximizeCall,
    setJitsiContainer
  };
}
