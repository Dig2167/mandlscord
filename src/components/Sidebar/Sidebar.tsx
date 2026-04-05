import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Chat, User } from '../../types';

interface SidebarProps {
  onChatSelect?: () => void;
}

export default function Sidebar({ onChatSelect }: SidebarProps) {
  const { user, chats, activeChat, selectChat, createChat, searchUsers, userStatuses, loadChats } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filter, setFilter] = useState<'all' | 'personal' | 'groups'>('all');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      setIsSearching(true);
      const timer = setTimeout(async () => {
        const results = await searchUsers(searchQuery);
        setSearchResults(results);
        setIsSearching(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery, searchUsers]);

  const filteredChats = chats.filter(chat => {
    if (filter === 'personal') return !chat.isGroup;
    if (filter === 'groups') return chat.isGroup;
    return true;
  });

  const handleStartChat = (targetUser: User) => {
    createChat([targetUser.username]);
    setSearchQuery('');
    setSearchResults([]);
    onChatSelect?.();
  };

  const handleCreateGroup = () => {
    if (newGroupName && selectedUsers.length > 0) {
      createChat(
        selectedUsers.map(u => u.username),
        true,
        newGroupName
      );
      setShowNewGroup(false);
      setNewGroupName('');
      setSelectedUsers([]);
      onChatSelect?.();
    }
  };

  const getChatName = (chat: Chat) => {
    if (chat.isGroup) return chat.name || 'Группа';
    const other = chat.otherParticipants?.[0];
    return other?.displayName || other?.username || 'Чат';
  };

  const getChatAvatar = (chat: Chat) => {
    if (chat.isGroup) return null;
    return chat.otherParticipants?.[0]?.avatar;
  };

  const getChatStatus = (chat: Chat): string => {
    if (chat.isGroup) return `${chat.participants.length} участников`;
    const other = chat.otherParticipants?.[0];
    if (!other) return '';
    const status = userStatuses[other.username] || other.status || 'offline';
    if (status === 'invisible') return 'был(а) недавно';
    if (status === 'online') return 'в сети';
    if (status === 'away') return 'отошёл';
    if (status === 'dnd') return 'не беспокоить';
    return 'был(а) недавно';
  };

  const getStatusColor = (chat: Chat) => {
    if (chat.isGroup) return 'bg-gray-500';
    const other = chat.otherParticipants?.[0];
    if (!other) return 'bg-gray-500';
    const status = userStatuses[other.username] || other.status || 'offline';
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 86400000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) {
      return date.toLocaleDateString('ru-RU', { weekday: 'short' });
    }
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const getUnreadCount = (chat: Chat): number => {
    return chat.unreadCount || 0;
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg sm:text-xl font-bold text-white">Чаты</h1>
          <button
            onClick={() => setShowNewGroup(true)}
            className="p-2 bg-purple-600 rounded-full hover:bg-purple-700 transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по @username..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl py-2 pl-9 pr-4 text-white text-sm focus:border-purple-500 focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-1 mt-3">
          {(['all', 'personal', 'groups'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs sm:text-sm transition-colors ${
                filter === f
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {f === 'all' ? 'Все' : f === 'personal' ? 'Личные' : 'Группы'}
            </button>
          ))}
        </div>
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="border-b border-gray-800">
          {isSearching ? (
            <div className="p-4 text-center text-gray-400">Поиск...</div>
          ) : searchResults.length > 0 ? (
            <div className="p-2">
              <p className="text-xs text-gray-500 px-2 mb-2">Найденные пользователи</p>
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleStartChat(u)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-medium">{u.displayName[0]}</span>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-white font-medium text-sm">{u.displayName}</p>
                    <p className="text-gray-500 text-xs">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-400 text-sm">Никого не найдено</div>
          )}
        </div>
      )}

      {/* Chats List */}
      <div className="flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            <p>Нет чатов</p>
            <p className="text-xs mt-1">Найдите пользователя по @username</p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => {
                selectChat(chat);
                onChatSelect?.();
              }}
              className={`w-full flex items-center gap-3 p-3 transition-colors ${
                activeChat?.id === chat.id
                  ? 'bg-purple-600/20 border-l-2 border-purple-500'
                  : 'hover:bg-gray-800/50 border-l-2 border-transparent'
              }`}
            >
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
                  {getChatAvatar(chat) ? (
                    <img src={getChatAvatar(chat)!} alt="" className="w-full h-full object-cover" />
                  ) : chat.isGroup ? (
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  ) : (
                    <span className="text-white font-bold text-lg">{getChatName(chat)[0]}</span>
                  )}
                </div>
                {!chat.isGroup && (
                  <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-gray-900 ${getStatusColor(chat)}`} />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium truncate">{getChatName(chat)}</span>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {getUnreadCount(chat) > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
                        {getUnreadCount(chat) > 99 ? '99+' : getUnreadCount(chat)}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      {formatTime(chat.lastMessage?.timestamp)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-gray-400 text-sm truncate flex-1">
                    {chat.lastMessage ? (
                      chat.lastMessage.type === 'voice' ? (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          Голосовое
                        </span>
                      ) : chat.lastMessage.type === 'image' ? (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Фото
                        </span>
                      ) : (
                        <>
                          {chat.lastMessage.senderUsername === user?.username && 'Вы: '}
                          {chat.lastMessage.content.substring(0, 30)}
                          {chat.lastMessage.content.length > 30 && '...'}
                        </>
                      )
                    ) : (
                      getChatStatus(chat)
                    )}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Новая группа</h3>
              <button onClick={() => setShowNewGroup(false)} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Название группы"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white mb-4 focus:border-purple-500 focus:outline-none"
            />
            
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск участников..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white mb-4 focus:border-purple-500 focus:outline-none"
            />
            
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1"
                  >
                    {u.displayName}
                    <button onClick={() => setSelectedUsers(prev => prev.filter(p => p.id !== u.id))}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            <div className="max-h-48 overflow-y-auto mb-4">
              {searchResults.filter(u => !selectedUsers.some(s => s.id === u.id)).map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUsers(prev => [...prev, u])}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-white">{u.displayName[0]}</span>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-white">{u.displayName}</p>
                    <p className="text-gray-500 text-sm">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
            
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName || selectedUsers.length === 0}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium disabled:opacity-50"
            >
              Создать группу
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
