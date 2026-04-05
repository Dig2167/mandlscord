// Генерация приятных звуков через Web Audio API

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

// Проверка настроек звука
function isSoundEnabled(): boolean {
  try {
    const settings = localStorage.getItem('mandlscord_settings');
    if (settings) {
      const parsed = JSON.parse(settings);
      return parsed.notificationSound !== false;
    }
  } catch (e) {}
  return true;
}

// Приятный звук нового сообщения - мягкий "bubble pop"
export function playMessageSound() {
  if (!isSoundEnabled()) return;
  
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Основной "поп" звук
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1400, now);
    osc1.frequency.exponentialRampToValueAtTime(600, now + 0.15);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.Q.setValueAtTime(1, now);
    
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    osc1.connect(filter);
    filter.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Мягкий обертон для "блеска"
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2100, now);
    osc2.frequency.exponentialRampToValueAtTime(900, now + 0.1);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.15);

  } catch (e) {
    console.warn('Sound play failed:', e);
  }
}

// Звук входящего звонка - мелодичный рингтон
export function playCallSound(): { stop: () => void } {
  if (!isSoundEnabled()) return { stop: () => {} };
  
  try {
    const ctx = getAudioContext();
    let stopped = false;
    let timeoutId: number;
    const oscillators: OscillatorNode[] = [];

    const playRing = () => {
      if (stopped) return;
      const now = ctx.currentTime;

      // Мелодия из 4 нот - приятный рингтон
      const melody = [
        { freq: 523.25, time: 0 },      // C5
        { freq: 659.25, time: 0.15 },   // E5
        { freq: 783.99, time: 0.30 },   // G5
        { freq: 1046.50, time: 0.45 },  // C6
      ];

      melody.forEach(({ freq, time }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);
        
        // Добавляем вибрато для живости
        const vibrato = ctx.createOscillator();
        const vibratoGain = ctx.createGain();
        vibrato.frequency.setValueAtTime(5, now);
        vibratoGain.gain.setValueAtTime(3, now);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        vibrato.start(now + time);
        vibrato.stop(now + time + 0.3);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2500, now);
        
        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.15, now + time + 0.02);
        gain.gain.setValueAtTime(0.15, now + time + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.28);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + time);
        osc.stop(now + time + 0.3);
        oscillators.push(osc);
      });

      // Повторять каждые 2.5 секунды
      timeoutId = window.setTimeout(playRing, 2500);
    };

    playRing();

    return {
      stop: () => {
        stopped = true;
        clearTimeout(timeoutId);
        oscillators.forEach(osc => {
          try { osc.stop(); } catch(e) {}
        });
      }
    };
  } catch (e) {
    console.warn('Call sound failed:', e);
    return { stop: () => {} };
  }
}

// Звук отправки сообщения - мягкий "свуш"
export function playSendSound() {
  if (!isSoundEnabled()) return;
  
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Быстрый свуш вверх
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.12);
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(0.5, now);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

  } catch (e) {
    console.warn('Send sound failed:', e);
  }
}

// Звук завершения звонка - мягкий нисходящий тон
export function playEndCallSound() {
  if (!isSoundEnabled()) return;
  
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Два нисходящих тона
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(261.63, now + 0.3); // C4
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(392, now + 0.1); // G4
    osc2.frequency.exponentialRampToValueAtTime(196, now + 0.4); // G3
    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.1, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.45);

  } catch (e) {
    console.warn('End call sound failed:', e);
  }
}
