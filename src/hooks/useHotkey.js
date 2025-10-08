import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 热键管理Hook
 * 处理全局快捷键功能，包括F2双击功能
 */
export const useHotkey = () => {
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+Space');
  const [isRegistered, setIsRegistered] = useState(false);
  const [hotkeyMode, setHotkeyMode] = useState('toggle');
  const registeredHotkeyRef = useRef(null); // 跟踪已注册的热键

  // 获取当前热键
  useEffect(() => {
    const getCurrentHotkey = async () => {
      try {
        if (window.electronAPI) {
          const currentHotkey = await window.electronAPI.getCurrentHotkey();
          if (currentHotkey) {
            setHotkey(currentHotkey);
            registeredHotkeyRef.current = currentHotkey;
          }
        }
      } catch (error) {
        if (window.electronAPI && window.electronAPI.log) {
          window.electronAPI.log('warn', '获取当前热键失败:', error);
        }
      }
    };

    getCurrentHotkey();
  }, []);

  // 获取当前热键模式
  useEffect(() => {
    const fetchMode = async () => {
      try {
        if (window.electronAPI?.getHotkeyMode) {
          const result = await window.electronAPI.getHotkeyMode();
          if (result?.success && result.mode) {
            setHotkeyMode(result.mode);
            return;
          }
        }

        if (window.electronAPI?.getSetting) {
          const storedMode = await window.electronAPI.getSetting('hotkey_mode', 'toggle');
          setHotkeyMode(storedMode === 'hold' ? 'hold' : 'toggle');
        }
      } catch (error) {
        if (window.electronAPI?.log) {
          window.electronAPI.log('warn', '获取热键模式失败:', error);
        }
      }
    };

    fetchMode();
  }, []);

  // 监听主进程广播的热键更新事件（例如在独立设置窗口中修改）
  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.onHotkeyUpdated) {
      return undefined;
    }

    const unsubscribe = window.electronAPI.onHotkeyUpdated((_, data) => {
      if (!data || !data.hotkey) {
        return;
      }
      registeredHotkeyRef.current = data.hotkey;
      setHotkey(data.hotkey);
      setIsRegistered(true);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // 监听热键模式更新事件
  useEffect(() => {
    if (!window.electronAPI?.onHotkeyModeUpdated) {
      return undefined;
    }

    const unsubscribe = window.electronAPI.onHotkeyModeUpdated((_, data) => {
      if (data?.mode) {
        setHotkeyMode(data.mode);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // 移除F2双击相关的复杂逻辑，专注于传统热键

  // 注册传统热键 - 添加防重复注册机制
  const registerHotkey = async (newHotkey) => {
    try {
      // 防重复注册：如果已经注册了相同的热键，直接返回成功
      if (registeredHotkeyRef.current === newHotkey && isRegistered) {
        console.log(`热键 ${newHotkey} 已注册，跳过重复注册`);
        return { success: true, alreadyRegistered: true };
      }

      // 如果之前注册过不同的热键，先注销旧的
      if (registeredHotkeyRef.current && registeredHotkeyRef.current !== newHotkey) {
        console.log(`注销旧热键: ${registeredHotkeyRef.current}`);
        await unregisterHotkey(registeredHotkeyRef.current);
      }

      if (window.electronAPI) {
        const result = await window.electronAPI.registerHotkey(newHotkey);
        if (result.success) {
          registeredHotkeyRef.current = newHotkey;
          setHotkey(newHotkey);
          setIsRegistered(true);
          return result;
        }
        if (result.error && window.electronAPI.log) {
          window.electronAPI.log('warn', `热键 ${newHotkey} 注册失败: ${result.error}`);
        }
        return result;
      }
      // 非Electron环境下直接更新状态
      registeredHotkeyRef.current = newHotkey;
      setHotkey(newHotkey);
      setIsRegistered(true);
      return { success: true, simulated: true };
    } catch (error) {
      if (window.electronAPI && window.electronAPI.log) {
        window.electronAPI.log('error', '注册热键失败:', error);
      }
      return {
        success: false,
        error: error.message || '注册热键失败'
      };
    }
  };

  // 注销传统热键
  const unregisterHotkey = async (hotkeyToUnregister) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.unregisterHotkey(hotkeyToUnregister || hotkey);
        if (result.success) {
          setIsRegistered(false);
        }
        return result;
      }
      setIsRegistered(false);
      return { success: true, simulated: true };
    } catch (error) {
      if (window.electronAPI && window.electronAPI.log) {
        window.electronAPI.log('error', '注销热键失败:', error);
      }
      return {
        success: false,
        error: error.message || '注销热键失败'
      };
    }
  };

  // 同步录音状态到主进程
  const syncRecordingState = useCallback(async (isRecording) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.setRecordingState(isRecording);
      }
    } catch (error) {
      if (window.electronAPI && window.electronAPI.log) {
        window.electronAPI.log('error', '同步录音状态失败:', error);
      }
    }
  }, []);

  // 格式化热键显示
  const formatHotkey = (hotkeyString) => {
    return hotkeyString
      .replace('CommandOrControl', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
      .replace('Shift', '⇧')
      .replace('Alt', '⌥')
      .replace('Space', '空格')
      .replace('F2', 'F2')
      .replace('+', ' + ');
  };

  return {
    hotkey: formatHotkey(hotkey),
    rawHotkey: hotkey,
    hotkeyMode,
    isRegistered,
    registerHotkey,
    unregisterHotkey,
    syncRecordingState
  };
};
