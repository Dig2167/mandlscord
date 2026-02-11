import { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface SettingsProps {
  onClose: () => void;
}

const CHAT_BACKGROUNDS = [
  { id: 'default', name: 'По умолчанию', value: '' },
  { id: 'gradient1', name: 'Космос', value: 'bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950' },
  { id: 'gradient2', name: 'Океан', value: 'bg-gradient-to-br from-cyan-950 via-blue-950 to-slate-950' },
  { id: 'gradient3', name: 'Закат', value: 'bg-gradient-to-br from-orange-950 via-rose-950 to-purple-950' },
  { id: 'gradient4', name: 'Лес', value: 'bg-gradient-to-br from-green-950 via-emerald-950 to-teal-950' },
  { id: 'gradient5', name: 'Вулкан', value: 'bg-gradient-to-br from-red-950 via-orange-950 to-yellow-950' },
  { id: 'gradient6', name: 'Аврора', value: 'bg-gradient-to-br from-green-950 via-cyan-950 to-purple-950' },
];

const ACCENT_COLORS = [
  { id: 'purple', name: 'Фиолетовый', from: 'from-purple-600', to: 'to-pink-600', bg: 'bg-purple-600' },
  { id: 'blue', name: 'Синий', from: 'from-blue-600', to: 'to-cyan-600', bg: 'bg-blue-600' },
  { id: 'green', name: 'Зелёный', from: 'from-green-600', to: 'to-emerald-600', bg: 'bg-green-600' },
  { id: 'orange', name: 'Оранжевый', from: 'from-orange-600', to: 'to-red-600', bg: 'bg-orange-600' },
  { id: 'pink', name: 'Розовый', from: 'from-pink-600', to: 'to-rose-600', bg: 'bg-pink-600' },
  { id: 'cyan', name: 'Голубой', from: 'from-cyan-600', to: 'to-blue-600', bg: 'bg-cyan-600' },
];

const PROFILE_COLORS = [
  { id: 'purple-pink', name: 'Фиолетовый', gradient: 'from-purple-500 to-pink-500' },
  { id: 'blue-cyan', name: 'Океан', gradient: 'from-blue-500 to-cyan-500' },
  { id: 'green-emerald', name: 'Изумруд', gradient: 'from-green-500 to-emerald-500' },
  { id: 'orange-red', name: 'Огонь', gradient: 'from-orange-500 to-red-500' },
  { id: 'pink-rose', name: 'Роза', gradient: 'from-pink-500 to-rose-500' },
  { id: 'indigo-violet', name: 'Индиго', gradient: 'from-indigo-500 to-violet-500' },
  { id: 'yellow-orange', name: 'Солнце', gradient: 'from-yellow-500 to-orange-500' },
  { id: 'teal-cyan', name: 'Бирюза', gradient: 'from-teal-500 to-cyan-500' },
];

export default function Settings({ onClose }: SettingsProps) {
  const { user, updateProfile, logout, chatBackground, setChatBackground } = useApp();
  const [activeSection, setActiveSection] = useState<string>('profile');
  
  // Profile editing
  const [editName, setEditName] = useState(user?.displayName || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [editStatus, setEditStatus] = useState<string>(user?.status || 'online');
  const [profileColor, setProfileColor] = useState(localStorage.getItem('profileColor') || 'purple-pink');
  
  // Settings from localStorage
  const [chatBg, setChatBg] = useState(chatBackground);
  const [accentColor, setAccentColor] = useState(localStorage.getItem('accentColor') || 'purple');
  const [fontSize, setFontSize] = useState(localStorage.getItem('fontSize') || 'medium');
  const [notifications, setNotifications] = useState(localStorage.getItem('notifications') !== 'false');
  const [notifSound, setNotifSound] = useState(localStorage.getItem('notifSound') !== 'false');
  const [sendByEnter, setSendByEnter] = useState(localStorage.getItem('sendByEnter') !== 'false');
  const [messagePreview, setMessagePreview] = useState(localStorage.getItem('messagePreview') !== 'false');
  const [lastSeen, setLastSeen] = useState(localStorage.getItem('lastSeen') || 'everyone');
  const [profilePhoto, setProfilePhoto] = useState(localStorage.getItem('profilePhoto') || 'everyone');
  const [saved, setSaved] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        canvas.width = 256;
        canvas.height = 256;
        ctx?.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        updateProfile({ avatar: dataUrl });
      };
      const reader = new FileReader();
      reader.onloadend = () => { img.src = reader.result as string; };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = () => {
    updateProfile({
      displayName: editName,
      bio: editBio,
      status: editStatus as 'online' | 'offline' | 'away' | 'dnd' | 'invisible',
    });
    localStorage.setItem('profileColor', profileColor);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveSettings = () => {
    setChatBackground(chatBg);
    
    // Сохраняем все настройки
    const settings = {
      accentColor,
      fontSize,
      notifications,
      notificationSound: notifSound,
      sendByEnter,
      messagePreview,
      lastSeen,
      profilePhoto,
      chatBackground: chatBg
    };
    
    localStorage.setItem('mandlscord_settings', JSON.stringify(settings));
    localStorage.setItem('accentColor', accentColor);
    localStorage.setItem('fontSize', fontSize);
    localStorage.setItem('notifications', String(notifications));
    localStorage.setItem('notifSound', String(notifSound));
    localStorage.setItem('sendByEnter', String(sendByEnter));
    localStorage.setItem('messagePreview', String(messagePreview));
    localStorage.setItem('lastSeen', lastSeen);
    localStorage.setItem('profilePhoto', profilePhoto);
    
    // Применяем размер шрифта
    document.documentElement.style.setProperty('--font-size', 
      fontSize === 'small' ? '14px' : fontSize === 'large' ? '18px' : '16px'
    );
    
    // Запрашиваем разрешение на уведомления если включены
    if (notifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const sections = [
    { id: 'profile', name: 'Профиль', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )},
    { id: 'appearance', name: 'Оформление', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    )},
    { id: 'notifications', name: 'Уведомления', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    )},
    { id: 'privacy', name: 'Приватность', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    )},
    { id: 'chats', name: 'Чаты', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    )},
  ];

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-white">Настройки</h2>
        {saved && (
          <span className="ml-auto text-green-400 text-sm animate-pulse">Сохранено</span>
        )}
      </div>

      {/* Navigation */}
      <div className="flex border-b border-gray-800 overflow-x-auto">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap transition-colors border-b-2 ${
              activeSection === s.id ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-white'
            }`}>
            {s.icon}
            <span className="hidden sm:inline">{s.name}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* PROFILE */}
        {activeSection === 'profile' && (
          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center">
              <div className="relative group">
                <div className={`w-28 h-28 rounded-full bg-gradient-to-br ${PROFILE_COLORS.find(c => c.id === profileColor)?.gradient || 'from-purple-500 to-pink-500'} p-0.5`}>
                  <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-4xl font-bold">{user?.displayName?.[0]}</span>
                    )}
                  </div>
                </div>
                <label className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </label>
              </div>
              <p className="text-gray-500 text-sm mt-2">@{user?.username}</p>
            </div>

            {/* Name */}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Имя</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-purple-500 focus:outline-none" />
            </div>

            {/* Bio */}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">О себе</label>
              <textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-purple-500 focus:outline-none resize-none" />
            </div>

            {/* Status */}
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Статус</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'online', label: 'В сети', color: 'bg-green-500' },
                  { value: 'away', label: 'Отошёл', color: 'bg-yellow-500' },
                  { value: 'dnd', label: 'Не беспокоить', color: 'bg-red-500' },
                  { value: 'invisible', label: 'Невидимый', color: 'bg-gray-500' },
                ].map(s => (
                  <button key={s.value} onClick={() => setEditStatus(s.value)}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${
                      editStatus === s.value ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}>
                    <div className={`w-3 h-3 rounded-full ${s.color}`} />
                    <span className="text-white text-sm">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Profile Color */}
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Цвет профиля</label>
              <div className="grid grid-cols-4 gap-2">
                {PROFILE_COLORS.map(c => (
                  <button key={c.id} onClick={() => setProfileColor(c.id)}
                    className={`h-12 rounded-xl bg-gradient-to-r ${c.gradient} border-2 transition-all ${
                      profileColor === c.id ? 'border-white scale-105' : 'border-transparent hover:border-gray-500'
                    }`}>
                    <span className="text-white text-xs font-medium drop-shadow">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={saveProfile}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/30 transition-all">
              Сохранить профиль
            </button>

            <button onClick={logout}
              className="w-full py-3 bg-red-600/20 text-red-400 rounded-xl font-medium hover:bg-red-600/30 transition-colors">
              Выйти из аккаунта
            </button>
          </div>
        )}

        {/* APPEARANCE */}
        {activeSection === 'appearance' && (
          <div className="space-y-6">
            {/* Accent Color */}
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Цвет акцента</label>
              <div className="grid grid-cols-3 gap-2">
                {ACCENT_COLORS.map(c => (
                  <button key={c.id} onClick={() => setAccentColor(c.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${
                      accentColor === c.id ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 bg-gray-800'
                    }`}>
                    <div className={`w-5 h-5 rounded-full ${c.bg}`} />
                    <span className="text-white text-sm">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Размер текста</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'small', label: 'Мелкий' },
                  { value: 'medium', label: 'Средний' },
                  { value: 'large', label: 'Крупный' },
                ].map(s => (
                  <button key={s.value} onClick={() => setFontSize(s.value)}
                    className={`p-3 rounded-xl border text-sm transition-colors ${
                      fontSize === s.value ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Background */}
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Фон чата</label>
              <div className="grid grid-cols-2 gap-2">
                {CHAT_BACKGROUNDS.map(bg => (
                  <button key={bg.id} onClick={() => setChatBg(bg.id)}
                    className={`h-20 rounded-xl border-2 transition-all overflow-hidden ${
                      chatBg === bg.id ? 'border-purple-500 scale-[1.02]' : 'border-gray-700 hover:border-gray-500'
                    } ${bg.value || 'bg-gray-900'}`}>
                    <span className="text-white text-xs font-medium drop-shadow-lg">{bg.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={saveSettings}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">
              Сохранить
            </button>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeSection === 'notifications' && (
          <div className="space-y-4">
            <ToggleSetting label="Уведомления" description="Получать уведомления о новых сообщениях" value={notifications} onChange={setNotifications} />
            <ToggleSetting label="Звук" description="Звуковые уведомления" value={notifSound} onChange={setNotifSound} />
            <ToggleSetting label="Предпросмотр" description="Показывать текст сообщения в уведомлении" value={messagePreview} onChange={setMessagePreview} />
            
            <button onClick={saveSettings}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">
              Сохранить
            </button>
          </div>
        )}

        {/* PRIVACY */}
        {activeSection === 'privacy' && (
          <div className="space-y-6">
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Последний визит</label>
              <div className="space-y-2">
                {[
                  { value: 'everyone', label: 'Все' },
                  { value: 'contacts', label: 'Только контакты' },
                  { value: 'nobody', label: 'Никто' },
                ].map(o => (
                  <button key={o.value} onClick={() => setLastSeen(o.value)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      lastSeen === o.value ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">Фото профиля</label>
              <div className="space-y-2">
                {[
                  { value: 'everyone', label: 'Все' },
                  { value: 'contacts', label: 'Только контакты' },
                  { value: 'nobody', label: 'Никто' },
                ].map(o => (
                  <button key={o.value} onClick={() => setProfilePhoto(o.value)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      profilePhoto === o.value ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={saveSettings}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">
              Сохранить
            </button>
          </div>
        )}

        {/* CHATS */}
        {activeSection === 'chats' && (
          <div className="space-y-4">
            <ToggleSetting label="Отправка по Enter" description="Отправлять сообщение при нажатии Enter" value={sendByEnter} onChange={setSendByEnter} />
            
            <button onClick={saveSettings}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">
              Сохранить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleSetting({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-xl">
      <div>
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-gray-500 text-xs">{description}</p>
      </div>
      <button onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full transition-colors relative ${value ? 'bg-purple-600' : 'bg-gray-600'}`}>
        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
