export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar?: string | null;
  bio?: string;
  status?: 'online' | 'offline' | 'away' | 'dnd' | 'invisible';
  createdAt?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderUsername: string;
  senderName?: string;
  senderAvatar?: string | null;
  content: string;
  type: 'text' | 'image' | 'voice';
  duration?: number;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
  readBy?: string[];
  listenedBy?: string[];
  deleted?: boolean;
  deletedFor?: string[];
}

export interface Chat {
  id: string;
  participants: string[];
  isGroup: boolean;
  name?: string | null;
  avatar?: string | null;
  lastMessage?: Message;
  otherParticipants?: User[];
  createdAt?: string;
  unreadCount?: number;
}

export interface GroupCallParticipant {
  odíusername: string;
  odídisplayName: string;
  avatar?: string;
  odístream?: MediaStream;
  peerConnection?: RTCPeerConnection;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export interface CallState {
  isActive: boolean;
  isIncoming: boolean;
  isCalling: boolean;
  isMinimized: boolean;
  isGroup: boolean;
  callType: 'audio' | 'video';
  chatId?: string;
  participants: GroupCallParticipant[];
  pendingParticipants?: string[];
  remoteUsername: string;
  remoteDisplayName: string;
  remoteAvatar?: string;
  startTime?: number;
}
