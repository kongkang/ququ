import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { toast, Toaster } from "sonner";
import { Settings, Save, Eye, EyeOff, X, Loader2, TestTube, CheckCircle, XCircle, Mic, Shield, Keyboard, Sun, Moon, Monitor } from "lucide-react";
import { usePermissions } from "./hooks/usePermissions";
import PermissionCard from "./components/ui/permission-card";
import { initializeTheme, setThemePreference as applyThemePreference, onThemePreferenceChange, getThemePreference } from "./utils/themeManager";

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    ai_api_key: "",
    ai_base_url: "https://api.openai.com/v1",
    ai_model: "gpt-3.5-turbo",
    enable_ai_optimization: true
  });
  
  const [customModel, setCustomModel] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+Space');
  const [isHotkeyLoading, setIsHotkeyLoading] = useState(true);
  const [isSavingHotkey, setIsSavingHotkey] = useState(false);
  const [pendingHotkey, setPendingHotkey] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [hotkeyMode, setHotkeyMode] = useState('hold');
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

  const [themePreference, setThemePreferenceState] = useState('system');
  const [systemThemeIsDark, setSystemThemeIsDark] = useState(false);
  const [isThemeUpdating, setIsThemeUpdating] = useState(false);
  const [pendingTheme, setPendingTheme] = useState(null);

  // 权限管理
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

  // 加载设置
  useEffect(() => {
    loadSettings();
    loadHotkey();
    loadHotkeyMode();
    loadSystemInfo();
  }, []);

  useEffect(() => {
    let mounted = true;

    const setupTheme = async () => {
      try {
        const snapshot = await initializeTheme();
        if (!mounted) {
          return;
        }

        const current = snapshot || getThemePreference();
        setThemePreferenceState(current.preference);
        setSystemThemeIsDark(!!current.systemPrefersDark);
      } catch (error) {
        console.error('初始化主题失败:', error);
      }
    };

    setupTheme();

    const unsubscribe = onThemePreferenceChange((payload) => {
      if (!mounted || !payload) {
        return;
      }
      setThemePreferenceState(payload.preference);
      setSystemThemeIsDark(!!payload.systemPrefersDark);
    });

    return () => {
      mounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      if (window.electronAPI) {
        const allSettings = await window.electronAPI.getAllSettings();
        const loadedSettings = {
          ai_api_key: allSettings.ai_api_key || "",
          ai_base_url: allSettings.ai_base_url || "https://api.openai.com/v1",
          ai_model: allSettings.ai_model || "gpt-3.5-turbo",
          enable_ai_optimization: allSettings.enable_ai_optimization !== false // 默认为true
        };
        setSettings(prev => ({ ...prev, ...loadedSettings }));
        
        // 检查是否使用自定义模型
        const predefinedModels = ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-4o-mini", "qwen3-30b-a3b-instruct-2507"];
        setCustomModel(!predefinedModels.includes(loadedSettings.ai_model));
      }
    } catch (error) {
      console.error("加载设置失败:", error);
      toast.error("加载设置失败");
    } finally {
      setLoading(false);
    }
  };

  const loadHotkey = async () => {
    try {
      if (window.electronAPI) {
        const savedHotkey = await window.electronAPI.getSetting('hotkey', 'CommandOrControl+Shift+Space');
        setHotkey(savedHotkey);
      }
    } catch (error) {
      console.error('加载快捷键设置失败:', error);
      toast.error('加载快捷键失败', {
        description: error.message,
      });
    } finally {
      setIsHotkeyLoading(false);
    }
  };

  const loadHotkeyMode = async () => {
    try {
      if (window.electronAPI?.getHotkeyMode) {
        const result = await window.electronAPI.getHotkeyMode();
        if (result?.success && result.mode) {
          setHotkeyMode(result.mode === 'toggle' ? 'toggle' : 'hold');
          return;
        }
      }

      if (window.electronAPI?.getSetting) {
        const storedMode = await window.electronAPI.getSetting('hotkey_mode', 'hold');
        setHotkeyMode(storedMode === 'toggle' ? 'toggle' : 'hold');
      }
    } catch (error) {
      console.error('加载热键模式失败:', error);
      toast.error('加载热键模式失败', {
        description: error.message,
      });
    }
  };

  const loadSystemInfo = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getSystemInfo) {
        const info = await window.electronAPI.getSystemInfo();
        setSystemInfo(info);
      }
    } catch (error) {
      console.error('获取系统信息失败:', error);
    }
  };

  useEffect(() => {
    if (!window.electronAPI?.onHotkeyModeUpdated) {
      return undefined;
    }

    const unsubscribe = window.electronAPI.onHotkeyModeUpdated((_, data) => {
      if (data?.mode) {
        setHotkeyMode(data.mode === 'toggle' ? 'toggle' : 'hold');
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const formatHotkeyDisplay = (key) => {
    if (!key) {
      return '';
    }
    return key
      .replace('CommandOrControl', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
      .replace('Command', '⌘')
      .replace('Control', 'Ctrl')
      .replace('Shift', '⇧')
      .replace('Alt', '⌥')
      .replace('Space', '空格')
      .replace('+', ' + ');
  };

  const handleThemePreferenceChange = async (preference) => {
    if (!preference || preference === themePreference || isThemeUpdating) {
      return;
    }

    setIsThemeUpdating(true);
    setPendingTheme(preference);

    try {
      const result = await applyThemePreference(preference);
      setThemePreferenceState(result.preference);
      setSystemThemeIsDark(!!result.systemPrefersDark);

      const descriptions = {
        light: '已切换到浅色模式',
        dark: '已切换到深色模式',
        system: '已切换为跟随系统外观'
      };

      toast.success('主题已更新', {
        description: descriptions[result.preference] || '已更新外观设置',
        duration: 2500,
      });
    } catch (error) {
      console.error('更新主题偏好失败:', error);
      toast.error('更新主题失败', {
        description: error.message || '请稍后重试',
        duration: 3500,
      });
    } finally {
      setIsThemeUpdating(false);
      setPendingTheme(null);
    }
  };

  const handleHotkeyUpdate = async (newHotkey) => {
    if (!newHotkey || newHotkey === hotkey || isSavingHotkey) {
      return;
    }

    setIsSavingHotkey(true);
    setPendingHotkey(newHotkey);

    try {
      let result = null;

      if (window.electronAPI && window.electronAPI.updateGlobalHotkey) {
        result = await window.electronAPI.updateGlobalHotkey(newHotkey);
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
      console.error('更新快捷键失败:', error);
      toast.error('快捷键更新失败', {
        description: error.message || '热键可能已被系统或其他应用占用',
        duration: 4000,
      });
    } finally {
      setIsSavingHotkey(false);
      setPendingHotkey(null);
    }
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
    if (modifierKeys.includes(event.key)) {
      return null;
    }

    if (event.key === 'Dead') {
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
      NumpadEqual: 'NumpadEqual',
      NumpadComma: 'NumpadComma',
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
        handleHotkeyUpdate(accelerator);
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
  }, [isCapturingHotkey, getKeyTokenFromEvent, buildAcceleratorFromState, handleHotkeyUpdate, resetCaptureState, updateModifierState, formatHotkeyDisplay]);

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

  // 保存设置
  const saveSettings = async () => {
    try {
      setSaving(true);
      if (window.electronAPI) {
        // 保存每个设置项
        await window.electronAPI.setSetting('ai_api_key', settings.ai_api_key);
        await window.electronAPI.setSetting('ai_base_url', settings.ai_base_url);
        await window.electronAPI.setSetting('ai_model', settings.ai_model);
        await window.electronAPI.setSetting('enable_ai_optimization', settings.enable_ai_optimization);
        
        toast.success("设置保存成功");
      }
    } catch (error) {
      console.error("保存设置失败:", error);
      toast.error("保存设置失败");
    } finally {
      setSaving(false);
    }
  };

  // 处理输入变化
  const handleInputChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 应用推荐配置
  const applyRecommendedConfig = () => {
    setSettings(prev => ({
      ...prev,
      ai_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      ai_model: "qwen3-30b-a3b-instruct-2507"
    }));
    setCustomModel(true);
    toast.info("已应用阿里云推荐配置");
  };

  // 重置为OpenAI配置
  const resetToOpenAI = () => {
    setSettings(prev => ({
      ...prev,
      ai_base_url: "https://api.openai.com/v1",
      ai_model: "gpt-3.5-turbo"
    }));
    setCustomModel(false);
    toast.info("已重置为OpenAI配置");
  };

  // 测试AI配置
  const testAIConfiguration = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      
      // 验证当前输入的配置
      if (!settings.ai_api_key.trim()) {
        setTestResult({
          available: false,
          error: '请先输入API密钥',
          details: 'API密钥不能为空'
        });
        toast.error("配置不完整", {
          description: "请先输入API密钥"
        });
        return;
      }
      
      if (window.electronAPI) {
        // 使用当前页面的配置进行测试，而不是已保存的配置
        const testConfig = {
          ai_api_key: settings.ai_api_key.trim(),
          ai_base_url: settings.ai_base_url.trim() || 'https://api.openai.com/v1',
          ai_model: settings.ai_model.trim() || 'gpt-3.5-turbo'
        };
        
        const result = await window.electronAPI.checkAIStatus(testConfig);
        setTestResult(result);
        
        if (result.available) {
          toast.success("AI配置测试成功！", {
            description: `模型: ${result.model || '未知'} - 连接正常`
          });
        } else {
          toast.error("AI配置测试失败", {
            description: result.error || "未知错误"
          });
        }
      }
    } catch (error) {
      console.error("测试AI配置失败:", error);
      setTestResult({
        available: false,
        error: error.message || "测试失败"
      });
      toast.error("测试失败", {
        description: error.message || "未知错误"
      });
    } finally {
      setTesting(false);
    }
  };

  // 关闭窗口
  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.hideSettingsWindow();
    }
  };

  const themeOptions = [
    {
      value: 'light',
      title: '浅色模式',
      description: '适合明亮环境，保持界面清爽',
      icon: Sun
    },
    {
      value: 'dark',
      title: '深色模式',
      description: '夜间或低光环境下更护眼',
      icon: Moon
    },
    {
      value: 'system',
      title: '跟随系统',
      description: '自动匹配系统的深浅色设置',
      icon: Monitor
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-gray-700 dark:text-gray-300">加载设置中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex flex-col">
      {/* 标题栏 - 固定 */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Settings className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 chinese-title">设置</h1>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* 主要内容 - 可滚动 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto p-6 pb-8">
          {/* 快捷键设置部分 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-6">
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 chinese-title flex items-center gap-2">
                  <Keyboard className="w-5 h-5 text-blue-600" />
                  快捷键设置
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  设置开始/停止录音的全局快捷键。
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">当前快捷键</p>
                    <p className="mt-1 text-lg font-semibold text-blue-600 dark:text-blue-300">
                      {isHotkeyLoading ? '加载中...' : formatHotkeyDisplay(hotkey)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">自定义快捷键：</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      ref={hotkeyInputRef}
                      type="text"
                      readOnly
                      value={isCapturingHotkey ? (captureDisplay || '等待按键...') : formatHotkeyDisplay(hotkey)}
                      onFocus={handleCaptureFocus}
                      onBlur={handleCaptureBlur}
                      placeholder="点击后按下新的快捷键组合"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                          className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          重新录制
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    聚焦输入框后按下想要的快捷键组合，松开即自动保存。
                  </p>
                </div>

                <div className="mt-4">
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">选择预设快捷键：</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
                          onClick={() => handleHotkeyUpdate(preset.key)}
                          disabled={isActive || isSavingHotkey || isPlatformBlocked}
                          title={isPlatformBlocked ? preset.warning : preset.warning || undefined}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600 cursor-default'
                              : `${isPlatformBlocked ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-blue-50 border-gray-200 dark:bg-gray-950/60 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-900/60'}`
                          }`}
                        >
                          {isSavingHotkey && pendingHotkey === preset.key ? '保存中...' : preset.label}
                        </button>
                      );
                    })}
                  </div>
                  {systemInfo?.platform === 'win32' && (
                    <p className="text-xs text-amber-600 mt-2">
                      提示：Windows 系统保留 Alt + 空格 用于窗口菜单，可能无法注册。
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    如果注册失败，系统会提示您更换组合。
                  </p>
                </div>

                <div className="mt-6">
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">快捷键行为模式：</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      {
                        value: 'hold',
                        title: '按住开始 / 松开结束',
                        hint: '适合即时对话或按住说话'
                      },
                      {
                        value: 'toggle',
                        title: '按下开始 / 再按结束',
                        hint: '适合较长时间的录音'
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
                              : 'bg-white text-gray-700 hover:bg-blue-50 border-gray-200 dark:bg-gray-950/60 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-900/60'
                          }`}
                        >
                          <span className="block text-sm font-medium">
                            {isSavingHotkeyMode && !isActive ? '保存中...' : option.title}
                          </span>
                          <span className={`block text-xs mt-1 ${isActive ? 'text-blue-100/90' : 'text-gray-500 dark:text-gray-400'}`}>
                            {option.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    {hotkeyMode === 'hold'
                      ? '按住快捷键即可录音，松开后自动结束。'
                      : '按一次开始录音，再按一次结束录音。'}
                  </p>
                </div>
          </div>
        </div>
      </div>

      {/* 外观设置部分 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-6">
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 chinese-title flex items-center gap-2">
              <Sun className="w-5 h-5 text-amber-500" />
              外观主题
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              选择应用的深浅色风格，可随时切换并立即生效。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isActive = themePreference === option.value;
              const isPending = isThemeUpdating && pendingTheme === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleThemePreferenceChange(option.value)}
                  disabled={isThemeUpdating && !isPending}
                  aria-pressed={isActive}
                  className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 text-left ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/20 dark:border-blue-500/80 shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-400/60 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                  } ${isThemeUpdating && !isPending ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                >
                  <span className={`p-2 rounded-lg transition-colors ${
                    isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${
                        isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'
                      }`}>
                        {option.title}
                      </p>
                      {isActive && (
                        <CheckCircle className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {option.description}
                    </p>
                    {option.value === 'system' && (
                      <p className="text-[11px] text-blue-600 dark:text-blue-300 mt-1">
                        当前系统主题：{systemThemeIsDark ? '深色' : '浅色'}
                      </p>
                    )}
                    {isPending && (
                      <p className="text-[11px] text-blue-500 dark:text-blue-300 mt-1">
                        切换中...
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 权限管理部分 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-6">
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 chinese-title">
                  权限管理
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  测试和管理应用权限，确保麦克风和辅助功能正常工作。
                </p>
              </div>
              
              <div className="space-y-2">
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
          </div>

          {/* AI配置部分 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 chinese-title">
                  AI配置
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                 配置AI模型以优化和增强语音识别结果。如果API Key无效或未填写，优化功能将自动禁用。
               </p>
              </div>

             <div className="space-y-4">
               {/* AI优化开关 */}
               <div className="flex items-center justify-between pt-4">
                 <label htmlFor="ai-optimization-toggle" className="text-sm font-medium text-gray-800 dark:text-gray-200">
                   启用AI文本优化
                 </label>
                 <button
                   type="button"
                   role="switch"
                   aria-checked={settings.enable_ai_optimization}
                   onClick={() => handleInputChange('enable_ai_optimization', !settings.enable_ai_optimization)}
                   className={`${
                     settings.enable_ai_optimization ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                   } relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                 >
                   <span
                     aria-hidden="true"
                     className={`${
                       settings.enable_ai_optimization ? 'translate-x-4' : 'translate-x-0'
                     } inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                   />
                 </button>
               </div>

               {/* API Key */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    API Key *
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={settings.ai_api_key}
                      onChange={(e) => handleInputChange('ai_api_key', e.target.value)}
                      placeholder="请输入您的AI API Key"
                      className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    用于AI文本优化功能的API密钥
                  </p>
                </div>

                {/* Base URL */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    API Base URL
                  </label>
                  <input
                    type="url"
                    value={settings.ai_base_url}
                    onChange={(e) => handleInputChange('ai_base_url', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    AI服务的API端点地址，支持OpenAI兼容的API
                  </p>
                </div>

                {/* Model */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      AI模型
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={applyRecommendedConfig}
                        className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                      >
                        阿里云推荐
                      </button>
                      <button
                        type="button"
                        onClick={resetToOpenAI}
                        className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        OpenAI
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="predefined-model"
                        name="model-type"
                        checked={!customModel}
                        onChange={() => setCustomModel(false)}
                        className="w-3 h-3 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <label htmlFor="predefined-model" className="text-xs text-gray-700 dark:text-gray-300">
                        预定义模型
                      </label>
                    </div>
                    
                    {!customModel && (
                      <select
                        value={settings.ai_model}
                        onChange={(e) => handleInputChange('ai_model', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        <option value="gpt-4">GPT-4</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="qwen3-30b-a3b-instruct-2507">Qwen3-30B (推荐)</option>
                      </select>
                    )}
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="custom-model"
                        name="model-type"
                        checked={customModel}
                        onChange={() => setCustomModel(true)}
                        className="w-3 h-3 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <label htmlFor="custom-model" className="text-xs text-gray-700 dark:text-gray-300">
                        自定义模型
                      </label>
                    </div>
                    
                    {customModel && (
                      <input
                        type="text"
                        value={settings.ai_model}
                        onChange={(e) => handleInputChange('ai_model', e.target.value)}
                        placeholder="输入自定义模型名称，如：qwen3-30b-a3b-instruct-2507"
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    )}
                  </div>
                  
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    选择用于文本优化的AI模型。推荐使用阿里云Qwen3模型获得更好的中文处理效果。
                  </p>
                </div>
              </div>

              {/* 测试结果显示 */}
              {testResult && (
                <div className={`mt-4 p-3 rounded-lg border ${
                  testResult.available
                    ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                    : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                }`}>
                  <div className="flex items-center space-x-2">
                    {testResult.available ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                    <span className={`font-medium ${
                      testResult.available
                        ? 'text-green-800 dark:text-green-200'
                        : 'text-red-800 dark:text-red-200'
                    }`}>
                      {testResult.available ? 'AI配置测试成功' : 'AI配置测试失败'}
                    </span>
                  </div>
                  
                  {testResult.available && (
                    <div className="mt-2 space-y-1">
                      {testResult.model && (
                        <p className="text-xs text-green-700 dark:text-green-300">
                          <strong>模型:</strong> {testResult.model}
                        </p>
                      )}
                      {testResult.details && (
                        <p className="text-xs text-green-700 dark:text-green-300">
                          <strong>状态:</strong> {testResult.details}
                        </p>
                      )}
                      {testResult.response && (
                        <p className="text-xs text-green-700 dark:text-green-300">
                          <strong>AI回复:</strong> {testResult.response}
                        </p>
                      )}
                      {testResult.usage && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          Token使用: {testResult.usage.total_tokens || 'N/A'}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {!testResult.available && (
                    <div className="mt-2 space-y-1">
                      {testResult.error && (
                        <p className="text-xs text-red-700 dark:text-red-300">
                          <strong>错误:</strong> {testResult.error}
                        </p>
                      )}
                      {testResult.details && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {testResult.details}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-col">
                  <button
                    onClick={testAIConfiguration}
                    disabled={testing}
                    className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <TestTube className="w-3 h-3" />
                    )}
                    <span>{testing ? "测试中..." : "测试配置"}</span>
                  </button>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    测试当前编辑的配置（无需保存）
                  </p>
                </div>
                
                <button
                  onClick={saveSettings}
                  disabled={saving || !settings.ai_api_key}
                  className="flex items-center space-x-2 px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  <span>{saving ? "保存中..." : "保存设置"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 其他设置部分 */}
          <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 chinese-title mb-3">
                关于蛐蛐
              </h2>
              <div className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 p-3 rounded-lg">
                <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">
                  🎤 <strong>蛐蛐 (QuQu)</strong> - 基于FunASR和AI的中文语音转文字应用
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
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
    </div>
  );
};

// 导出组件供App.jsx使用
export { SettingsPage };

// 如果是直接访问settings.html，则渲染应用
const settingsRoot = document.getElementById("settings-root");

if (settingsRoot) {
  initializeTheme()
    .catch((error) => {
      console.error('初始化主题失败:', error);
    })
    .finally(() => {
      const root = ReactDOM.createRoot(settingsRoot);
      root.render(<SettingsPage />);
    });
}
