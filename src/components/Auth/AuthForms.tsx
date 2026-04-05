import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import socketService from '../../services/socket';

export default function AuthForms() {
  const { login, register } = useApp();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    displayName: '',
    password: '',
    confirmPassword: ''
  });
  
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  useEffect(() => {
    if (mode === 'register' && formData.username.length >= 3) {
      setUsernameStatus('checking');
      const timer = setTimeout(async () => {
        try {
          const exists = await socketService.checkUsername(formData.username);
          setUsernameStatus(exists ? 'taken' : 'available');
        } catch {
          setUsernameStatus('idle');
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setUsernameStatus('idle');
    }
  }, [formData.username, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(formData.username, formData.password);
      } else if (mode === 'register') {
        if (usernameStatus === 'taken') {
          setError('Username уже занят');
          setLoading(false);
          return;
        }
        if (formData.password !== formData.confirmPassword) {
          setError('Пароли не совпадают');
          setLoading(false);
          return;
        }
        if (formData.password.length < 6) {
          setError('Пароль должен быть минимум 6 символов');
          setLoading(false);
          return;
        }
        await register({
          username: formData.username,
          email: formData.email,
          displayName: formData.displayName,
          password: formData.password
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 animated-bg">
      {/* Animated orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Mandlscord</h1>
          <p className="text-gray-300">Общайтесь с друзьями</p>
        </div>
        
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-white/10">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Вход
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Регистрация
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-300 text-sm mb-1">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg py-3 pl-8 pr-10 text-white focus:border-purple-500 focus:outline-none"
                  placeholder="username"
                  required
                />
                {mode === 'register' && formData.username.length >= 3 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && (
                      <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {usernameStatus === 'available' && (
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {usernameStatus === 'taken' && (
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
              {mode === 'register' && usernameStatus === 'taken' && (
                <p className="text-red-400 text-xs mt-1">Этот username уже занят</p>
              )}
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-gray-300 text-sm mb-1">Имя</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg py-3 px-4 text-white focus:border-purple-500 focus:outline-none"
                    placeholder="Ваше имя"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-sm mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg py-3 px-4 text-white focus:border-purple-500 focus:outline-none"
                    placeholder="email@example.com"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-gray-300 text-sm mb-1">Пароль</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg py-3 px-4 text-white focus:border-purple-500 focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-gray-300 text-sm mb-1">Подтвердите пароль</label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg py-3 px-4 text-white focus:border-purple-500 focus:outline-none"
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="text-sm text-purple-400 hover:text-purple-300"
              >
                Забыли пароль?
              </button>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'register' && usernameStatus === 'taken')}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Загрузка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          {mode === 'forgot' && (
            <div className="mt-4 text-center">
              <p className="text-gray-400 text-sm mb-4">
                Введите email для восстановления пароля
              </p>
              <input
                type="email"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg py-3 px-4 text-white focus:border-purple-500 focus:outline-none mb-4"
                placeholder="email@example.com"
              />
              <button className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:opacity-90">
                Восстановить
              </button>
              <button
                onClick={() => setMode('login')}
                className="mt-4 text-purple-400 hover:text-purple-300 text-sm"
              >
                Вернуться к входу
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
