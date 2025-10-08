import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Shield, Settings, Keyboard } from "lucide-react";
import { usePermissions } from "../hooks/usePermissions";
import PermissionCard from "./ui/permission-card";
import { toast } from "sonner";

const SettingsPanel = ({ onClose, rawHotkey, onHotkeyChange }) => {
  const [hotkey, setHotkey] = useState(rawHotkey || 'CommandOrControl+Shift+Space');
  const [isLoadingHotkey, setIsLoadingHotkey] = useState(!rawHotkey);
  const [isSavingHotkey, setIsSavingHotkey] = useState(false);
  const [pendingHotkey, setPendingHotkey] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [hotkeyMode, setHotkeyMode] = useState('toggle');
  const [isSavingHotkeyMode, setIsSavingHotkeyMode] = useState(false);
  const [isCapturingHotkey, setIsCapturingHotkey] = useState(false);
  const [captureDisplay, setCaptureDisplay] = useState('');
  const hotkeyInputRef = useRef(null);
  const captureStateRef = useRef({
    mainKey: null,
    mainCode: null,
    accelerator: null,
    modifiers: {
      meta: false,
      ctrl: false,
      alt: false,
      shift: false
    }
  });

  const showAlert = (alert) => {
    toast(alert.title, {
      description: alert.description,
      duration: 4000,
    });
  };

  const {
    micPermissionGranted,
    accessibilityPermissionGranted,
    requestMicPermission,
    testAccessibilityPermission,
  } = usePermissions(showAlert);

  // 从外部传入的原始热键更新时同步本地状态
  useEffect(() => {
    if (rawHotkey) {
      setHotkey(rawHotkey);
      setIsLoadingHotkey(false);
    }
  }, [rawHotkey]);

  // 当缺少外部值时，从设置数据库加载一次
  useEffect(() => {
    if (rawHotkey || !window.electronAPI) {
      return;
    }

    const loadHotkey = async () => {
      try {
        const savedHotkey = await window.electronAPI.getSetting('hotkey', 'CommandOrControl+Shift+Space');
        setHotkey(savedHotkey);
      } catch (error) {
        console.error('加载快捷键设置失败:', error);
        toast.error('加载快捷键失败', {
          description: error.message,
        });
      } finally {
        setIsLoadingHotkey(false);
      }
    };

    loadHotkey();
  }, [rawHotkey]);

  // 获取系统信息以提示潜在的快捷键限制
  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        if (window.electronAPI && window.electronAPI.getSystemInfo) {
          const info = await window.electronAPI.getSystemInfo();
          setSystemInfo(info);
        }
      } catch (error) {
        console.error('获取系统信息失败:', error);
      }
    };

    fetchSystemInfo();
  }, []);

  useEffect(() => {
    const loadMode = async () => {
      try {
        if (window.electronAPI?.getHotkeyMode) {
          const result = await window.electronAPI.getHotkeyMode();
          if (result?.success && result.mode) {
            setHotkeyMode(result.mode === 'hold' ? 'hold' : 'toggle');
            return;
          }
        }

        if (window.electronAPI?.getSetting) {
          const storedMode = await window.electronAPI.getSetting('hotkey_mode', 'toggle');
          setHotkeyMode(storedMode === 'hold' ? 'hold' : 'toggle');
        }
      } catch (error) {
        console.error('加载快捷键模式失败:', error);
      }
    };

    loadMode();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onHotkeyModeUpdated) {
      return undefined;
    }

    const unsubscribe = window.electronAPI.onHotkeyModeUpdated((_, data) => {
      if (data?.mode) {
        setHotkeyMode(data.mode === 'hold' ? 'hold' : 'toggle');
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // 保存快捷键设置
  const saveHotkey = async (newHotkey) => {
    if (hotkey === newHotkey || isSavingHotkey) {
      return;
    }

    setIsSavingHotkey(true);
    setPendingHotkey(newHotkey);
    const previousHotkey = hotkey;

    try {
      let result = null;

      if (onHotkeyChange) {
        result = await onHotkeyChange(newHotkey);
      } else if (window.electronAPI) {
        result = await window.electronAPI.registerHotkey(newHotkey);
      } else {
        result = { success: true, simulated: true };
      }

      if (!result || !result.success) {
        const errorMessage = result?.error || '热键注册失败，可能已被系统占用';
        throw new Error(errorMessage);
      }

      if (window.electronAPI && window.electronAPI.setSetting) {
        await window.electronAPI.setSetting('hotkey', newHotkey);
      }

      setHotkey(newHotkey);
      toast.success('快捷键已更新', {
        description: `当前快捷键: ${formatHotkeyDisplay(newHotkey)}`,
        duration: 3000,
      });
    } catch (error) {
      console.error('保存快捷键失败:', error);
      toast.error('快捷键更新失败', {
        description: error.message || '热键可能已被系统或其他应用占用',
        duration: 4000,
      });

      // 如果更新失败且提供了外部回调，则尝试恢复之前的设置
      if (onHotkeyChange && previousHotkey) {
        await onHotkeyChange(previousHotkey);
        setHotkey(previousHotkey);
      }
    } finally {
      setIsSavingHotkey(false);
      setPendingHotkey(null);
    }
  };

  // 格式化快捷键显示
  const formatHotkeyDisplay = (key) => {
    return key
      .replace('CommandOrControl', '⌘/Ctrl')
      .replace('Command', '⌘')
      .replace('Control', 'Ctrl')
      .replace('Shift', '⇧')
      .replace('Alt', '⌥')
      .replace('Space', '空格')
      .replace('+', ' + ');
  };

  const resetCaptureState = useCallback(() => {
    captureStateRef.current.mainKey = null;
    captureStateRef.current.mainCode = null;
    captureStateRef.current.accelerator = null;
    captureStateRef.current.modifiers = {
      meta: false,
      ctrl: false,
      alt: false,
      shift: false
    };
    setCaptureDisplay('');
  }, []);

  const updateModifierState = useCallback((event, isPressed) => {
    const modifiers = captureStateRef.current.modifiers || {};

    if (event.key === 'Meta' || event.code === 'MetaLeft' || event.code === 'MetaRight') {
      modifiers.meta = isPressed;
    }
    if (event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight') {
      modifiers.ctrl = isPressed;
    }
    if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
      modifiers.alt = isPressed;
    }
    if (event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      modifiers.shift = isPressed;
    }

    captureStateRef.current.modifiers = modifiers;
  }, []);

  const buildAcceleratorFromState = useCallback((mainKeyOverride = null) => {
    const state = captureStateRef.current;
    const modifiers = state.modifiers || {};
    const key = mainKeyOverride || state.mainKey;

    const parts = [];
    if (modifiers.meta || modifiers.ctrl) {
      parts.push('CommandOrControl');
    }
    if (modifiers.alt) {
      parts.push('Alt');
    }
    if (modifiers.shift) {
      parts.push('Shift');
    }
    if (key) {
      parts.push(key);
    }

    return parts.join('+');
  }, []);

  const getKeyTokenFromEvent = useCallback((event) => {
    if (!event) {
      return null;
    }

    const modifierKeys = ['Shift', 'Control', 'Alt', 'Meta'];
    if (modifierKeys.includes(event.key) || event.key === 'Dead') {
      return null;
    }

    if (event.key === ' ') {
      return 'Space';
    }

    if (/^F\d{1,2}$/i.test(event.key)) {
      return event.key.toUpperCase();
    }

    const specialByKey = {
      Backspace: 'Backspace',
      Enter: 'Enter',
      Tab: 'Tab',
      Delete: 'Delete',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
    };

    if (specialByKey[event.key]) {
      return specialByKey[event.key];
    }

    const code = event.code;
    const specialByCode = {
      NumpadAdd: 'NumpadAdd',
      NumpadSubtract: 'NumpadSubtract',
      NumpadMultiply: 'NumpadMultiply',
      NumpadDivide: 'NumpadDivide',
      NumpadDecimal: 'NumpadDecimal',
      NumpadEnter: 'NumpadEnter',
      Minus: 'Minus',
      Equal: 'Equal',
      BracketLeft: 'BracketLeft',
      BracketRight: 'BracketRight',
      Backslash: 'Backslash',
      Slash: 'Slash',
      Period: 'Period',
      Comma: 'Comma',
      Semicolon: 'Semicolon',
      Quote: 'Quote',
      Backquote: 'Backquote'
    };

    if (specialByCode[code]) {
      return specialByCode[code];
    }

    if (code?.startsWith('Key')) {
      return code.slice(3).toUpperCase();
    }

    if (code?.startsWith('Digit')) {
      return code.slice(5);
    }

    if (code?.startsWith('Numpad')) {
      const suffix = code.slice(6);
      if (/^[0-9]$/.test(suffix)) {
        return `Numpad${suffix}`;
      }
      const mapped = specialByCode[`Numpad${suffix}`];
      if (mapped) {
        return mapped;
      }
    }

    if (event.key && event.key.length === 1) {
      return event.key.toUpperCase();
    }

    return null;
  }, []);

  const handleCaptureKeyDown = useCallback((event) => {
    if (!isCapturingHotkey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      resetCaptureState();
      setIsCapturingHotkey(false);
      hotkeyInputRef.current?.blur();
      return;
    }

    updateModifierState(event, true);

    if (!event.repeat) {
      const keyToken = getKeyTokenFromEvent(event);
      if (keyToken) {
        captureStateRef.current.mainKey = keyToken;
        captureStateRef.current.mainCode = event.code;
      }
    }

    const accelerator = buildAcceleratorFromState();
    captureStateRef.current.accelerator = accelerator;

    if (accelerator) {
      setCaptureDisplay(formatHotkeyDisplay(accelerator));
    } else {
      const partial = buildAcceleratorFromState(null);
      setCaptureDisplay(partial ? formatHotkeyDisplay(partial) : '');
    }
  }, [isCapturingHotkey, resetCaptureState, updateModifierState, getKeyTokenFromEvent, buildAcceleratorFromState, formatHotkeyDisplay]);

  const handleCaptureKeyUp = useCallback((event) => {
    if (!isCapturingHotkey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const keyToken = getKeyTokenFromEvent(event);
    const state = captureStateRef.current;
    const isMainKey = !!state.mainKey && (
      (keyToken && keyToken === state.mainKey) ||
      (event.code && event.code === state.mainCode)
    );

    if (isMainKey) {
      const accelerator = state.accelerator || buildAcceleratorFromState();
      if (accelerator) {
        saveHotkey(accelerator);
      }
      resetCaptureState();
      setIsCapturingHotkey(false);
      hotkeyInputRef.current?.blur();
      return;
    }

    updateModifierState(event, false);

    if (state.mainKey) {
      const accelerator = buildAcceleratorFromState();
      state.accelerator = accelerator;
      setCaptureDisplay(accelerator ? formatHotkeyDisplay(accelerator) : '');
    } else {
      const partial = buildAcceleratorFromState(null);
      setCaptureDisplay(partial ? formatHotkeyDisplay(partial) : '');
    }
  }, [isCapturingHotkey, getKeyTokenFromEvent, buildAcceleratorFromState, saveHotkey, resetCaptureState, updateModifierState, formatHotkeyDisplay]);

  const handleCaptureFocus = useCallback(() => {
    resetCaptureState();
    setIsCapturingHotkey(true);
  }, [resetCaptureState]);

  const handleCaptureBlur = useCallback(() => {
    resetCaptureState();
    setIsCapturingHotkey(false);
  }, [resetCaptureState]);

  useEffect(() => {
    if (!isCapturingHotkey) {
      return undefined;
    }

    const keydownListener = (event) => handleCaptureKeyDown(event);
    const keyupListener = (event) => handleCaptureKeyUp(event);

    window.addEventListener('keydown', keydownListener, true);
    window.addEventListener('keyup', keyupListener, true);

    return () => {
      window.removeEventListener('keydown', keydownListener, true);
      window.removeEventListener('keyup', keyupListener, true);
    };
  }, [isCapturingHotkey, handleCaptureKeyDown, handleCaptureKeyUp]);

  const handleHotkeyModeChange = async (mode) => {
    if (mode === hotkeyMode || isSavingHotkeyMode) {
      return;
    }

    setIsSavingHotkeyMode(true);

    try {
      let result = null;

      if (window.electronAPI?.updateHotkeyMode) {
        result = await window.electronAPI.updateHotkeyMode(mode);
      } else if (window.electronAPI?.setSetting) {
        await window.electronAPI.setSetting('hotkey_mode', mode);
        result = { success: true };
      } else {
        result = { success: true, simulated: true };
      }

      if (!result || !result.success) {
        const errorMessage = result?.error || '热键模式更新失败';
        throw new Error(errorMessage);
      }

      setHotkeyMode(mode);
      toast.success('快捷键模式已更新', {
        description: mode === 'hold' ? '按住快捷键即可录音，松开后自动结束。' : '再次按下快捷键结束录音。',
        duration: 3000,
      });
    } catch (error) {
      console.error('更新快捷键模式失败:', error);
      toast.error('更新快捷键模式失败', {
        description: error.message || '请稍后重试',
        duration: 4000,
      });
    } finally {
      setIsSavingHotkeyMode(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900 chinese-title">设置</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="text-gray-500 text-xl">×</span>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-8">
          {/* 快捷键设置部分 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 chinese-title flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-blue-600" />
              快捷键设置
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              设置开始/停止录音的全局快捷键
            </p>

            <div className="bg-gray-50 p-4 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">当前快捷键</p>
                  <p className="text-lg font-bold text-blue-600 mt-1">
                    {isLoadingHotkey ? '加载中...' : formatHotkeyDisplay(hotkey)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-600 mb-2">自定义快捷键：</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    ref={hotkeyInputRef}
                    type="text"
                    readOnly
                    value={isCapturingHotkey ? (captureDisplay || '等待按键...') : formatHotkeyDisplay(hotkey)}
                    onFocus={handleCaptureFocus}
                    onBlur={handleCaptureBlur}
                    placeholder="点击后按下新的快捷键组合"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    {isCapturingHotkey ? (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          handleCaptureBlur();
                          hotkeyInputRef.current?.blur();
                        }}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-100 transition-colors"
                      >
                        取消
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          resetCaptureState();
                          hotkeyInputRef.current?.focus();
                          handleCaptureFocus();
                        }}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-100 transition-colors"
                      >
                        重新录制
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  聚焦输入框后按下想要的快捷键组合，松开即自动保存。
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-600 mb-2">选择预设快捷键：</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'CommandOrControl+Shift+Space', label: '⌘/Ctrl + ⇧ + 空格' },
                    { key: 'CommandOrControl+Shift+R', label: '⌘/Ctrl + ⇧ + R' },
                    { key: 'Alt+Space', label: '⌥ + 空格', unsupportedPlatforms: ['win32'], warning: 'Windows 系统会打开窗口菜单' },
                    { key: 'F2', label: 'F2' },
                    { key: 'CommandOrControl+R', label: '⌘/Ctrl + R', warning: '部分应用将此快捷键用于刷新' },
                    { key: 'Alt+R', label: '⌥ + R' },
                  ].map((preset) => {
                    const isPlatformBlocked = preset.unsupportedPlatforms?.includes(systemInfo?.platform);
                    const isActive = hotkey === preset.key;
                    return (
                      <button
                        key={preset.key}
                        onClick={() => saveHotkey(preset.key)}
                        disabled={isActive || isSavingHotkey || isPlatformBlocked}
                        title={isPlatformBlocked ? preset.warning : preset.warning || undefined}
                        className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600 cursor-default'
                            : `${isPlatformBlocked ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-blue-50 border-gray-200'}`
                        }`}
                      >
                        {isSavingHotkey && pendingHotkey === preset.key ? '正在保存...' : preset.label}
                      </button>
                    );
                  })}
                </div>
                {systemInfo?.platform === 'win32' && (
                  <p className="text-xs text-amber-600 mt-2">
                    提示：Windows 系统保留 Alt + 空格 用于窗口菜单，可能无法注册。
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  如果注册失败，系统会提示您换一个组合。
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-600 mb-2">快捷键行为模式：</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      value: 'toggle',
                      title: '按下开始 / 再按结束',
                      hint: '适合持续录音'
                    },
                    {
                      value: 'hold',
                      title: '按住开始 / 松开结束',
                      hint: '按住说话，松手结束'
                    }
                  ].map((option) => {
                    const isActive = hotkeyMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleHotkeyModeChange(option.value)}
                        disabled={isActive || isSavingHotkeyMode}
                        className={`px-3 py-2 text-left rounded-lg border transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600 cursor-default'
                            : 'bg-white text-gray-700 hover:bg-blue-50 border-gray-200'
                        }`}
                      >
                        <span className="block text-sm font-medium">
                          {isSavingHotkeyMode && !isActive ? '保存中...' : option.title}
                        </span>
                        <span className={`block text-xs mt-1 ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                          {option.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {hotkeyMode === 'hold'
                    ? '按住快捷键即可录音，松开后自动结束。'
                    : '按一次开始录音，再按一次结束录音。'}
                </p>
              </div>
            </div>
          </div>

          {/* 权限部分 */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 chinese-title">
              权限管理
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              测试和管理应用权限，确保麦克风和辅助功能正常工作。
            </p>

            <div className="space-y-4">
              <PermissionCard
                icon={Mic}
                title="麦克风权限"
                description="录制语音所需的权限"
                granted={micPermissionGranted}
                onRequest={requestMicPermission}
                buttonText="测试麦克风"
              />

              <PermissionCard
                icon={Shield}
                title="辅助功能权限"
                description="自动粘贴文本所需的权限"
                granted={accessibilityPermissionGranted}
                onRequest={testAccessibilityPermission}
                buttonText="测试权限"
              />
            </div>
          </div>

          {/* 应用信息部分 */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 chinese-title">
              关于蛐蛐
            </h3>
            <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-700 mb-2">
                🎤 <strong>蛐蛐 (QuQu)</strong> - 基于FunASR和AI的中文语音转文字应用
              </p>
              <p className="text-xs text-gray-600">
                • 高精度中文语音识别<br/>
                • AI智能文本优化<br/>
                • 实时语音处理<br/>
                • 隐私保护设计
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
