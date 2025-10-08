const THEME_SETTING_KEY = 'theme_preference';
const THEME_STORAGE_KEY = 'ququ-theme-preference';
const VALID_PREFERENCES = new Set(['system', 'light', 'dark']);

let initialized = false;
let currentPreference = 'system';
let systemPrefersDark = false;
let mediaQueryList = null;
let systemChangeHandler = null;
const listeners = new Set();
let ipcUnsubscribe = null;

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

function isValidPreference(value) {
  return typeof value === 'string' && VALID_PREFERENCES.has(value);
}

function computeShouldUseDark(preference) {
  if (preference === 'dark') {
    return true;
  }
  if (preference === 'light') {
    return false;
  }
  return systemPrefersDark;
}

function applyThemeClass(shouldUseDark) {
  if (!hasDocument || !document.documentElement) {
    return;
  }

  const root = document.documentElement;
  const body = hasDocument ? document.body : null;
  const nextThemeClass = shouldUseDark ? 'dark' : 'light';

  root.classList.remove('dark', 'light');
  root.classList.add(nextThemeClass);
  root.dataset.theme = nextThemeClass;
  root.style.colorScheme = shouldUseDark ? 'dark' : 'light';

  if (body) {
    body.classList.remove('dark', 'light');
    body.classList.add(nextThemeClass);
    body.dataset.theme = nextThemeClass;
    body.style.colorScheme = shouldUseDark ? 'dark' : 'light';
  }
}

function notifyListeners() {
  const payload = getThemePreference();
  listeners.forEach((callback) => {
    try {
      callback(payload);
    } catch (error) {
      // 避免单个监听器错误影响其他监听器
      console.error('主题监听器执行失败:', error);
    }
  });
}

function readLocalPreference() {
  if (!hasWindow || !window.localStorage) {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidPreference(stored) ? stored : null;
  } catch (error) {
    console.warn('读取本地主题偏好失败:', error);
    return null;
  }
}

function writeLocalPreference(preference) {
  if (!hasWindow || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch (error) {
    console.warn('写入本地主题偏好失败:', error);
  }
}

function broadcastThemePreference(preference) {
  if (!hasWindow || !window.electronAPI?.broadcastThemePreference) {
    return;
  }

  try {
    window.electronAPI.broadcastThemePreference(preference);
  } catch (error) {
    console.warn('广播主题偏好失败:', error);
  }
}

function ensureIpcSubscription() {
  if (!hasWindow || !window.electronAPI?.onThemePreferenceUpdated || ipcUnsubscribe) {
    return;
  }

  ipcUnsubscribe = window.electronAPI.onThemePreferenceUpdated(async (_, preference) => {
    if (!isValidPreference(preference) || preference === currentPreference) {
      return;
    }
    await setThemePreference(preference, { skipPersist: true, skipBroadcast: true });
  });
}

async function readStoredPreference() {
  if (hasWindow && window.electronAPI?.getSetting) {
    try {
      const stored = await window.electronAPI.getSetting(THEME_SETTING_KEY, 'system');
      if (isValidPreference(stored)) {
        return stored;
      }
    } catch (error) {
      console.warn('从数据库读取主题偏好失败，回退到本地存储:', error);
    }
  }

  const localPreference = readLocalPreference();
  return localPreference || 'system';
}

async function persistPreference(preference) {
  if (hasWindow && window.electronAPI?.setSetting) {
    try {
      await window.electronAPI.setSetting(THEME_SETTING_KEY, preference);
    } catch (error) {
      console.warn('保存主题偏好到数据库失败:', error);
    }
  }

  writeLocalPreference(preference);
}

function handleSystemThemeChange(event) {
  systemPrefersDark = !!event.matches;
  if (currentPreference === 'system') {
    applyThemeClass(systemPrefersDark);
  }
  notifyListeners();
}

function handleStorageChange(event) {
  if (event.key !== THEME_STORAGE_KEY || !isValidPreference(event.newValue)) {
    return;
  }

  if (event.newValue === currentPreference) {
    return;
  }

  currentPreference = event.newValue;
  applyThemeClass(computeShouldUseDark(currentPreference));
  notifyListeners();
}

export async function initializeTheme() {
  if (!hasWindow) {
    return { preference: currentPreference, isDark: computeShouldUseDark(currentPreference), systemPrefersDark };
  }

  if (!initialized) {
    initialized = true;

    if (typeof window.matchMedia === 'function') {
      mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      systemPrefersDark = mediaQueryList.matches;

      systemChangeHandler = (event) => handleSystemThemeChange(event);
      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', systemChangeHandler);
      } else if (typeof mediaQueryList.addListener === 'function') {
        mediaQueryList.addListener(systemChangeHandler);
      }
    }

    const storedPreference = await readStoredPreference();
    currentPreference = isValidPreference(storedPreference) ? storedPreference : 'system';
    applyThemeClass(computeShouldUseDark(currentPreference));
    writeLocalPreference(currentPreference);

    if (hasWindow) {
      window.addEventListener('storage', handleStorageChange);
      ensureIpcSubscription();
    }

    notifyListeners();
  } else {
    // 即使已初始化，也同步系统主题状态
    if (mediaQueryList) {
      systemPrefersDark = mediaQueryList.matches;
    }

    ensureIpcSubscription();
  }

  return getThemePreference();
}

export function getThemePreference() {
  return {
    preference: currentPreference,
    isDark: computeShouldUseDark(currentPreference),
    systemPrefersDark
  };
}

export async function setThemePreference(preference, options = {}) {
  const { skipPersist = false, skipBroadcast = false } = options;

  if (!isValidPreference(preference)) {
    console.warn('收到无效的主题偏好:', preference);
    return getThemePreference();
  }

  if (preference === currentPreference) {
    if (!skipBroadcast) {
      broadcastThemePreference(currentPreference);
    }
    return getThemePreference();
  }

  currentPreference = preference;
  applyThemeClass(computeShouldUseDark(currentPreference));

  if (skipPersist) {
    writeLocalPreference(currentPreference);
  } else {
    await persistPreference(currentPreference);
  }

  notifyListeners();

  if (!skipBroadcast) {
    broadcastThemePreference(currentPreference);
  }

  return getThemePreference();
}

export function onThemePreferenceChange(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  listeners.add(callback);

  return () => {
    listeners.delete(callback);
  };
}

export function resetThemeManagerForTests() {
  // 仅用于测试环境，防止跨测试污染
  if (mediaQueryList) {
    if (typeof mediaQueryList.removeEventListener === 'function' && systemChangeHandler) {
      mediaQueryList.removeEventListener('change', systemChangeHandler);
    } else if (typeof mediaQueryList.removeListener === 'function' && systemChangeHandler) {
      mediaQueryList.removeListener(systemChangeHandler);
    }
  }

  if (hasWindow) {
    window.removeEventListener('storage', handleStorageChange);
  }

  if (ipcUnsubscribe) {
    ipcUnsubscribe();
    ipcUnsubscribe = null;
  }

  if (hasDocument && document.documentElement) {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    delete root.dataset.theme;
    root.style.colorScheme = '';
  }

  if (hasDocument && document.body) {
    const { body } = document;
    body.classList.remove('dark', 'light');
    delete body.dataset.theme;
    body.style.colorScheme = '';
  }

  initialized = false;
  currentPreference = 'system';
  systemPrefersDark = false;
  mediaQueryList = null;
  systemChangeHandler = null;
}
