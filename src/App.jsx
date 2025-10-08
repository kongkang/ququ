import React, { useState, useEffect, useRef, useCallback } from "react";
import "./index.css";
import { toast } from "sonner";
import { LoadingDots } from "./components/ui/loading-dots";
import { useHotkey } from "./hooks/useHotkey";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useRecording } from "./hooks/useRecording";
import { useTextProcessing } from "./hooks/useTextProcessing";
import { useModelStatus } from "./hooks/useModelStatus";
import { Settings, History, Copy, Download, Sun, Moon, Monitor } from "lucide-react";
import SettingsPanel from "./components/SettingsPanel";
import { ModelDownloadProgress } from "./components/ui/model-status-indicator";
import { initializeTheme, setThemePreference as applyThemePreference, onThemePreferenceChange, getThemePreference } from "./utils/themeManager";

const THEME_ORDER = ['light', 'dark', 'system'];
const THEME_LABELS = {
  light: '浅色模式',
  dark: '深色模式',
  system: '跟随系统'
};

// 动态导入设置页面组件
const SettingsPage = React.lazy(() => import('./settings.jsx').then(module => ({ default: module.SettingsPage })));

// 声波图标组件（空闲/悬停状态）
const SoundWaveIcon = ({ size = 16, isActive = false }) => {
  return (
    <div className="flex items-center justify-center gap-1">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={`bg-slate-600 dark:bg-gray-300 rounded-full transition-all duration-150 shadow-sm ${
            isActive ? "wave-bar" : ""
          }`}
          style={{
            width: size * 0.15,
            height: isActive ? size * 0.8 : size * 0.4,
            animationDelay: isActive ? `${i * 0.1}s` : "0s",
          }}
        />
      ))}
    </div>
  );
};

// 加载指示器组件（FunASR启动中）
const LoadingIndicator = ({ size = 20 }) => {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="w-1 bg-gray-500 rounded-full"
          style={{
            height: size * 0.6,
            animation: `loading-dots 1.4s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
};

// 语音波形指示器组件（处理状态）
const VoiceWaveIndicator = ({ isListening }) => {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={`w-0.5 bg-white rounded-full transition-all duration-150 drop-shadow-sm ${
            isListening ? "animate-pulse h-5" : "h-2"
          }`}
          style={{
            animationDelay: isListening ? `${i * 0.1}s` : "0s",
            animationDuration: isListening ? `${0.6 + i * 0.1}s` : "0s",
          }}
        />
      ))}
    </div>
  );
};

// 增强的工具提示组件
const Tooltip = ({ children, content, position = "top" }) => {
  const [isVisible, setIsVisible] = useState(false);

  const getPositionClasses = () => {
    if (position === "bottom") {
      return {
        tooltip: "absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 text-white bg-gradient-to-r from-neutral-800 to-neutral-700 rounded-md whitespace-nowrap z-50 transition-opacity duration-150",
        arrow: "absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-b-2 border-transparent border-b-neutral-800"
      };
    }
    // 默认为顶部
    return {
      tooltip: "absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-white bg-gradient-to-r from-neutral-800 to-neutral-700 rounded-md whitespace-nowrap z-50 transition-opacity duration-150",
      arrow: "absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-neutral-800"
    };
  };

  const { tooltip, arrow } = getPositionClasses();

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div
          className={tooltip}
          style={{ fontSize: "10px" }}
        >
          {content}
          <div className={arrow}></div>
        </div>
      )}
    </div>
  );
};

// 文本显示区域组件
const TextDisplay = ({ originalText, processedText, isProcessing, onCopy, onExport, onPaste }) => {
  if (!originalText && !processedText) {
    return null; // 当没有文本时不显示任何内容，避免重复
  }

  return (
    <div className="space-y-4">
      {/* 原始识别文本 - 简化设计，单行显示 */}
      {originalText && (
        <div className="bg-slate-100/80 dark:bg-gray-800/80 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="chinese-content text-gray-800 dark:text-gray-200 flex-1 truncate pr-2">
              {originalText}
            </p>
            <button
              onClick={() => onCopy(originalText)}
              className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-gray-700/70 rounded-md transition-colors flex-shrink-0"
              title="复制识别文本"
            >
              <Copy className="w-4 h-4 text-slate-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {/* AI处理后文本 */}
      {(processedText || isProcessing) && (
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 rounded-xl p-5 border-l-4 border-emerald-400 dark:border-emerald-500 shadow-lg border border-emerald-200/50 dark:border-emerald-700/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold chinese-title text-emerald-700 dark:text-emerald-400">AI优化后</h3>
            <div className="flex space-x-2">
              {processedText && (
                <>
                  <button
                    onClick={() => onPaste(processedText)}
                    className="p-2 hover:bg-emerald-200/70 dark:hover:bg-emerald-700/30 rounded-lg transition-colors shadow-sm"
                    title="粘贴优化文本"
                  >
                    <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onCopy(processedText)}
                    className="p-2 hover:bg-emerald-200/70 dark:hover:bg-emerald-700/30 rounded-lg transition-colors shadow-sm"
                    title="复制优化文本"
                  >
                    <Copy className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </button>
                  <button
                    onClick={() => onExport(processedText)}
                    className="p-2 hover:bg-emerald-200/70 dark:hover:bg-emerald-700/30 rounded-lg transition-colors shadow-sm"
                    title="导出文本"
                  >
                    <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </button>
                </>
              )}
            </div>
          </div>
          {isProcessing ? (
            <div className="flex items-center space-x-3 text-emerald-700 dark:text-emerald-400">
              <LoadingDots />
              <span className="status-text">AI正在优化文本...</span>
            </div>
          ) : (
            <p className="chinese-content leading-loose fade-in text-gray-800 dark:text-gray-200">
              {processedText}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const page = urlParams.get('page');

  if (page === 'settings') {
    return (
      <React.Suspense fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <LoadingDots />
            <span className="text-gray-700 dark:text-gray-300">加载设置页面...</span>
          </div>
        </div>
      }>
        <SettingsPage />
      </React.Suspense>
    );
  }

  return <MainAppContent />;
}

function MainAppContent() {
  const [isHovered, setIsHovered] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [processedText, setProcessedText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [themePreference, setThemePreferenceState] = useState('system');
  const [themeLoading, setThemeLoading] = useState(true);
  const [isThemeUpdating, setIsThemeUpdating] = useState(false);

  const { handleMouseDown, handleMouseMove, handleMouseUp, handleClick } = useWindowDrag();
  const modelStatus = useModelStatus();

  const {
    isRecording,
    isProcessing: isRecordingProcessing,
    isOptimizing,
    startRecording,
    stopRecording,
    error: recordingError
  } = useRecording();

  const {
    isProcessing: isTextProcessing,
    error: textProcessingError
  } = useTextProcessing();

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
      } catch (error) {
        console.error('初始化主题失败:', error);
      } finally {
        if (mounted) {
          setThemeLoading(false);
        }
      }
    };

    setupTheme();

    const unsubscribe = onThemePreferenceChange((payload) => {
      if (!mounted || !payload) {
        return;
      }
      setThemePreferenceState(payload.preference);
    });

    return () => {
      mounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const cycleThemePreference = useCallback(async () => {
    if (isThemeUpdating || themeLoading) {
      return;
    }

    const currentIndex = Math.max(THEME_ORDER.indexOf(themePreference), 0);
    const nextPreference = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];

    setIsThemeUpdating(true);
    try {
      const result = await applyThemePreference(nextPreference);
      setThemePreferenceState(result.preference);
      toast.success('主题已切换', {
        description: `当前：${THEME_LABELS[result.preference] || result.preference}`,
        duration: 2000,
      });
    } catch (error) {
      console.error('切换主题失败:', error);
      toast.error('切换主题失败', {
        description: error.message || '请稍后重试',
        duration: 3000,
      });
    } finally {
      setIsThemeUpdating(false);
    }
  }, [isThemeUpdating, themeLoading, themePreference]);

  // 防重复粘贴的引用
  const lastPasteRef = useRef({ text: '', timestamp: 0 });
  const PASTE_DEBOUNCE_TIME = 1000; // 1秒内相同文本不重复粘贴

  // 安全粘贴函数
  const safePaste = useCallback(async (text) => {
    const now = Date.now();
    const lastPaste = lastPasteRef.current;

    // 防重复粘贴：如果是相同文本且在防抖时间内，则跳过
    if (lastPaste.text === text && (now - lastPaste.timestamp) < PASTE_DEBOUNCE_TIME) {
      console.log("🚫 跳过重复粘贴，文本:", text.substring(0, 50) + "...");
      return;
    }

    // 更新最后粘贴记录
    lastPasteRef.current = { text, timestamp: now };

    console.log("🔄 safePaste 被调用，文本:", text.substring(0, 50) + "...");
    try {
      if (window.electronAPI) {
        console.log("📱 使用 Electron API 进行粘贴");
        await window.electronAPI.pasteText(text);
        console.log("✅ 粘贴成功");
        toast.success("文本已自动粘贴到当前输入框");
      } else {
        // Web环境下只能复制到剪贴板
        console.log("🌐 Web环境，仅复制到剪贴板");
        await navigator.clipboard.writeText(text);
        toast.info("文本已复制到剪贴板，请手动粘贴");
      }
    } catch (error) {
      console.error("❌ 粘贴文本失败:", error);
      toast.error("粘贴失败", {
        description: "请检查辅助功能权限。文本已复制到剪贴板 - 请手动使用 Cmd+V 粘贴。"
      });
    }
  }, []);

  // 处理录音完成（FunASR识别完成）
  const handleRecordingComplete = useCallback(async (transcriptionResult) => {
    console.log("🎤 handleRecordingComplete 被调用:", transcriptionResult);
    if (transcriptionResult.success && transcriptionResult.text) {
      console.log("✅ 转录成功，文本:", transcriptionResult.text);
      // 立即显示FunASR识别的原始文本
      setOriginalText(transcriptionResult.text);
      // 清空之前的处理结果，等待AI优化
      setProcessedText("");

      // 不立即粘贴，等待AI优化完成后再粘贴
      console.log("⏳ 等待AI优化完成后再进行粘贴...");

      // 注意：不在这里保存到数据库，由 useRecording.js 统一处理保存逻辑

      toast.success("🎤 语音识别完成，AI正在优化文本...");
    } else {
      console.log("❌ 转录失败或无文本:", transcriptionResult);
    }
  }, []);

  // 处理AI优化完成
  const handleAIOptimizationComplete = useCallback(async (optimizedResult) => {
    console.log('AI优化完成回调被触发:', optimizedResult);
    if (optimizedResult.success && optimizedResult.enhanced_by_ai && optimizedResult.text) {
      // 显示AI优化后的文本
      setProcessedText(optimizedResult.text);

      // 自动粘贴AI优化后的文本
      console.log("📋 准备粘贴AI优化后的文本:", optimizedResult.text);
      await safePaste(optimizedResult.text);
      console.log("✅ AI优化文本粘贴完成");

      toast.success("🤖 AI文本优化完成并已自动粘贴！");
      console.log('AI优化文本已设置:', optimizedResult.text);
    } else {
      console.warn('AI优化结果无效，使用原始文本:', optimizedResult);
      // 如果AI优化失败，则粘贴原始文本
      if (originalText) {
        console.log("📋 AI优化失败，粘贴原始文本:", originalText);
        await safePaste(originalText);
        toast.info("AI优化失败，已粘贴原始识别文本");
      }
    }
  }, [safePaste, originalText]);

  // 设置转录完成回调
  useEffect(() => {
    console.log('设置回调函数');
    window.onTranscriptionComplete = handleRecordingComplete;
    window.onAIOptimizationComplete = handleAIOptimizationComplete;

    // 验证回调函数是否正确设置
    console.log('回调函数设置完成:', {
      onTranscriptionComplete: typeof window.onTranscriptionComplete,
      onAIOptimizationComplete: typeof window.onAIOptimizationComplete
    });

    return () => {
      console.log('清理回调函数');
      window.onTranscriptionComplete = null;
      window.onAIOptimizationComplete = null;
    };
  }, [handleRecordingComplete, handleAIOptimizationComplete]);

  // 处理复制文本
  const handleCopyText = async (text) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.copyText(text);
        if (result.success) {
          toast.success("文本已复制到剪贴板");
        } else {
          throw new Error(result.error || "复制失败");
        }
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("文本已复制到剪贴板");
      }
    } catch (error) {
      console.error("复制文本失败:", error);
      toast.error(`无法复制文本到剪贴板: ${error.message}`);
    }
  };


  // 处理导出文本
  const handleExportText = async (text) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.exportTranscriptions('txt');
        toast.success("文本已导出到文件");
      } else {
        // Web环境下载文件
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `蛐蛐转录_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("无法导出文本文件", error);
      toast.error("无法导出文本文件");
    }
  };

  // 处理模型下载
  const handleDownloadModels = useCallback(async () => {
    try {
      // 显示开始下载的提示
      toast.info("📥 开始下载模型文件...");

      const result = await modelStatus.downloadModels();
      if (result.success) {
        toast.success("🎉 模型下载完成，正在加载...");
      } else {
        toast.error(`❌ 模型下载失败: ${result.error}`);
      }
    } catch (error) {
      console.error('下载模型失败:', error);
      toast.error(`❌ 模型下载失败: ${error.message}`);
    }
  }, [modelStatus]);

  // 切换录音状态
  const ensureModelReady = useCallback(() => {
    if (modelStatus.stage === 'need_download') {
      toast.warning("📥 请先下载AI模型文件");
      return false;
    }

    if (modelStatus.stage === 'downloading') {
      toast.warning("⬇️ 模型正在下载中，请稍候...");
      return false;
    }

    if (modelStatus.stage === 'loading') {
      toast.warning("🤖 模型正在加载中，请稍候...");
      return false;
    }

    if (modelStatus.stage === 'error') {
      toast.error(`❌ 模型错误: ${modelStatus.error}`);
      return false;
    }

    if (!modelStatus.isReady) {
      toast.warning("⏳ 模型未就绪，请稍候...");
      return false;
    }

    return true;
  }, [modelStatus]);

  const toggleRecording = useCallback((action = 'toggle') => {
    if (action === 'stop') {
      if (isRecording) {
        stopRecording();
      }
      return;
    }

    if (!ensureModelReady()) {
      return;
    }

    if (action === 'start') {
      if (!isRecording && !isRecordingProcessing) {
        startRecording();
      }
      return;
    }

    if (!isRecording && !isRecordingProcessing) {
      startRecording();
    } else if (isRecording) {
      stopRecording();
    }
  }, [ensureModelReady, isRecording, isRecordingProcessing, startRecording, stopRecording]);

  // 使用热键Hook，不再使用F2双击功能
  const { hotkey, rawHotkey, hotkeyMode, syncRecordingState, registerHotkey } = useHotkey();

  // 注册传统热键监听 - 只在主窗口注册，避免重复
  useEffect(() => {
    // 检查是否为控制面板窗口
    const urlParams = new URLSearchParams(window.location.search);
    const isControlPanel = urlParams.get('panel') === 'control';

    // 只有主窗口才注册热键
    if (isControlPanel) {
      console.log('控制面板窗口，跳过热键注册');
      return;
    }

    const initializeHotkey = async () => {
      try {
        // 从设置中读取快捷键，默认为 CommandOrControl+Shift+Space
        const savedHotkey = await window.electronAPI.getSetting('hotkey', 'CommandOrControl+Shift+Space');
        console.log('读取到的快捷键设置:', savedHotkey);

        const result = await registerHotkey(savedHotkey);
        if (result?.success) {
          console.log('主窗口热键注册成功:', savedHotkey);
        } else {
          const errorMessage = result?.error || '未知原因';
          console.error('主窗口热键注册失败:', errorMessage);
          toast.error('全局快捷键注册失败', {
            description: `无法注册 ${savedHotkey}：${errorMessage}`,
            duration: 5000,
          });
        }
      } catch (error) {
        console.error('主窗口热键注册异常:', error);
      }
    };

    if (registerHotkey) {
      initializeHotkey();
    }
  }, [registerHotkey]);

  // 处理关闭窗口
  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.hideWindow();
    }
  };

  // 处理打开设置
  const handleOpenSettings = () => {
    if (window.electronAPI) {
      window.electronAPI.openSettingsWindow();
    } else {
      // Web环境下仍然使用模态框
      setShowSettings(true);
    }
  };

  // 处理打开历史记录
  const handleOpenHistory = () => {
    if (window.electronAPI) {
      window.electronAPI.openHistoryWindow();
    }
  };


  // 监听全局热键触发事件
  useEffect(() => {
    if (!window.electronAPI) {
      return undefined;
    }

    const handleHotkeyPress = () => {
      if (hotkeyMode === 'hold') {
        toggleRecording('start');
      } else {
        toggleRecording();
      }
    };

    const unsubscribeHotkey = window.electronAPI.onHotkeyTriggered(handleHotkeyPress);

    const unsubscribeToggle = window.electronAPI.onToggleDictation(() => {
      toggleRecording();
    });

    let unsubscribeRelease;
    if (window.electronAPI.onHotkeyReleased) {
      unsubscribeRelease = window.electronAPI.onHotkeyReleased(() => {
        if (hotkeyMode === 'hold') {
          stopRecording({ allowPending: true });
        }
      });
    }

    return () => {
      if (typeof unsubscribeHotkey === 'function') unsubscribeHotkey();
      if (typeof unsubscribeToggle === 'function') unsubscribeToggle();
      if (typeof unsubscribeRelease === 'function') unsubscribeRelease();
    };
  }, [toggleRecording, stopRecording, hotkeyMode]);

  // 同步录音状态到热键管理器
  useEffect(() => {
    if (syncRecordingState) {
      syncRecordingState(isRecording);
    }
  }, [isRecording, syncRecordingState]);

  // 监听键盘事件
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, []);

  // 错误处理
  useEffect(() => {
    if (recordingError) {
      toast.error(recordingError);
    }
  }, [recordingError]);

  useEffect(() => {
    if (textProcessingError) {
      toast.error(textProcessingError);
    }
  }, [textProcessingError]);

  // 确定当前麦克风状态
  const getMicState = () => {
    if (isRecording) return "recording";
    if (isRecordingProcessing) return "processing";
    if (isOptimizing) return "optimizing";
    if (isHovered && !isRecording && !isRecordingProcessing && !isOptimizing) return "hover";
    return "idle";
  };

  const micState = getMicState();

  // 获取麦克风按钮属性
  const getMicButtonProps = () => {
    const baseClasses =
      "rounded-full w-16 h-16 flex items-center justify-center relative overflow-hidden border-2 border-white/80 transition-all duration-300 shadow-xl";

    // 统一的按钮样式，不再根据状态变色
    const buttonStyle = `${baseClasses} bg-gradient-to-br from-slate-100 to-slate-200 dark:from-gray-700 dark:to-gray-600 hover:from-slate-200 hover:to-slate-300 dark:hover:from-gray-600 dark:hover:to-gray-500 hover:shadow-2xl transform hover:scale-105`;

    // 如果模型未就绪，显示禁用状态（统一的灰色）
    if (!modelStatus.isReady) {
      return {
        className: `${baseClasses} bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 cursor-not-allowed opacity-70`,
        tooltip: modelStatus.stage === 'need_download' ? "请先下载AI模型文件" :
                 modelStatus.stage === 'downloading' ? `模型下载中... ${modelStatus.downloadProgress || 0}%` :
                 modelStatus.stage === 'loading' ? "模型加载中，请稍候..." :
                 modelStatus.stage === 'error' ? `模型错误: ${modelStatus.error}` :
                 "模型未就绪，请稍候...",
        disabled: true
      };
    }

    switch (micState) {
      case "idle":
        return {
          className: `${buttonStyle} cursor-pointer`,
          tooltip: `按 [${hotkey}] 开始录音`,
          disabled: false
        };
      case "hover":
        return {
          className: `${buttonStyle} scale-105 shadow-2xl cursor-pointer`,
          tooltip: `按 [${hotkey}] 开始录音`,
          disabled: false
        };
      case "recording":
        return {
          className: `${buttonStyle} recording-pulse cursor-pointer`,
          tooltip: "正在录音...",
          disabled: false
        };
      case "processing":
        return {
          className: `${buttonStyle} cursor-not-allowed opacity-70`,
          tooltip: "正在识别语音...",
          disabled: true
        };
      case "optimizing":
        return {
          className: `${buttonStyle} cursor-not-allowed opacity-70`,
          tooltip: "AI正在优化文本...",
          disabled: true
        };
      default:
        return {
          className: `${buttonStyle} cursor-pointer`,
          tooltip: "点击开始录音",
          disabled: false
        };
    }
  };

  const micProps = getMicButtonProps();

  const ThemeIcon = themePreference === 'light' ? Sun : themePreference === 'dark' ? Moon : Monitor;
  const themeIconClassName = themePreference === 'light'
    ? 'text-amber-500 dark:text-amber-400'
    : themePreference === 'dark'
      ? 'text-indigo-500 dark:text-indigo-300'
      : 'text-gray-700 dark:text-gray-300';
  const themeTooltipLabel = themeLoading
    ? '主题加载中...'
    : `当前主题：${THEME_LABELS[themePreference] || themePreference}${isThemeUpdating ? '（切换中）' : '（点击切换）'}`;
  const themeButtonDisabled = themeLoading || isThemeUpdating;
  const themeButtonClassName = `p-3 rounded-xl transition-colors shadow-sm ${themeButtonDisabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-white/70 dark:hover:bg-gray-700/70'}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 pb-4">
      {/* 主界面 */}
      <div className="max-w-2xl mx-auto min-h-screen flex flex-col">
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between mb-8 draggable"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 chinese-title">
            蛐蛐
          </h1>
          <div className="flex items-center space-x-3 non-draggable">
            <Tooltip content={themeTooltipLabel} position="bottom">
              <button
                type="button"
                onClick={cycleThemePreference}
                disabled={themeButtonDisabled}
                className={themeButtonClassName}
              >
                <ThemeIcon className={`w-6 h-6 ${themeIconClassName}`} />
              </button>
            </Tooltip>
            <Tooltip content="历史记录" position="bottom">
              <button
                onClick={handleOpenHistory}
                className="p-3 hover:bg-white/70 dark:hover:bg-gray-700/70 rounded-xl transition-colors shadow-sm"
              >
                <History className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              </button>
            </Tooltip>
            <Tooltip content="设置" position="bottom">
              <button
                onClick={handleOpenSettings}
                className="p-3 hover:bg-white/70 dark:hover:bg-gray-700/70 rounded-xl transition-colors shadow-sm"
              >
                <Settings className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* 录音控制区域 */}
        <div className="text-center mb-8 flex-shrink-0">
          <Tooltip content={micProps.tooltip}>
            <button
              onClick={(e) => {
                if (handleClick(e) && !micProps.disabled) {
                  toggleRecording();
                }
              }}
              onMouseEnter={() => {
                if (!micProps.disabled) {
                  setIsHovered(true);
                }
              }}
              onMouseLeave={() => setIsHovered(false)}
              className={`${micProps.className} non-draggable shadow-lg`}
              disabled={micProps.disabled}
            >
              {/* 动态内容基于状态 */}
              {modelStatus.stage === 'downloading' ? (
                <LoadingIndicator size={20} />
              ) : modelStatus.stage === 'loading' || !modelStatus.isReady ? (
                <LoadingIndicator size={20} />
              ) : micState === "idle" ? (
                <SoundWaveIcon size={20} isActive={false} />
              ) : micState === "hover" ? (
                <SoundWaveIcon size={20} isActive={false} />
              ) : micState === "recording" ? (
                <SoundWaveIcon size={20} isActive={true} />
              ) : micState === "processing" ? (
                <VoiceWaveIndicator isListening={true} />
              ) : micState === "optimizing" ? (
                <LoadingIndicator size={20} />
              ) : null}

              {/* 移除所有状态指示环，保持简洁 */}
            </button>
          </Tooltip>

          <p className="mt-4 status-text text-gray-700 dark:text-gray-300">
            {modelStatus.stage === 'need_download' ? (
              "需要下载AI模型文件才能开始使用"
            ) : modelStatus.stage === 'downloading' ? (
              `正在下载模型文件... ${modelStatus.downloadProgress || 0}%`
            ) : modelStatus.stage === 'loading' ? (
              "模型加载中，请稍候..."
            ) : modelStatus.stage === 'error' ? (
              `模型错误: ${modelStatus.error}`
            ) : !modelStatus.isReady ? (
              "模型未就绪，请稍候..."
            ) : micState === "recording" ? (
              "正在录音，再次点击停止"
            ) : micState === "processing" ? (
              "正在识别语音..."
            ) : micState === "optimizing" ? (
              "AI正在优化文本，请稍候..."
            ) : (
              `点击麦克风或按 ${hotkey} 开始录音`
            )}
          </p>
        </div>

        {/* 模型下载进度显示 */}
        {(modelStatus.stage === 'need_download' || modelStatus.stage === 'downloading') && (
          <div className="mb-6">
            <ModelDownloadProgress
              modelStatus={modelStatus}
              onDownload={handleDownloadModels}
            />
          </div>
        )}

        {/* 文本显示区域 - 可滚动 */}
        <div className="flex-1 text-area-scroll">
          <TextDisplay
            originalText={originalText}
            processedText={processedText}
            isProcessing={isTextProcessing || isOptimizing}
            onCopy={handleCopyText}
            onExport={handleExportText}
            onPaste={safePaste}
          />
        </div>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          rawHotkey={rawHotkey}
          onHotkeyChange={registerHotkey}
        />
      )}

    </div>
  );
}
