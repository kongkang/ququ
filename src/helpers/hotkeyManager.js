const { globalShortcut } = require('electron');

let uiohookModule = null;
let uiohookLoadError = null;

try {
  // uiohook-napi 提供全局键盘监听能力，用于检测按键释放
  // 如果加载失败，后续会自动降级为传统切换模式
  // eslint-disable-next-line global-require
  uiohookModule = require('uiohook-napi');
} catch (error) {
  uiohookLoadError = error;
}

class HotkeyManager {
  constructor(logger = null) {
    this.registeredHotkeys = new Map();
    this.f2ClickTimes = [];
    this.f2DoubleClickTimeout = 500; // 500ms内的两次点击算作双击
    this.onF2DoubleClick = null;
    this.isRecording = false;
    this.logger = logger;

    // 简化的热键防抖机制
    this.lastHotkeyTrigger = new Map();
    this.hotkeyDebounceTime = 200; // 200ms防抖时间，防止意外双击

    // 按住检测相关
    this.uiohookModule = uiohookModule;
    this.uiohookLoadError = uiohookLoadError;
    this.uIOhook = null;
    this.UiohookKey = null;
    this.holdSupportInitialized = false;
    this.holdSupportEnabled = false;
    this.holdHandlers = new Map();
    this.activeHoldStates = new Map();
    this.currentPressedKeys = new Set();

    this.handleUiohookKeydown = this.handleUiohookKeydown.bind(this);
    this.handleUiohookKeyup = this.handleUiohookKeyup.bind(this);

    this.initializeHoldSupport();
  }

  initializeHoldSupport(forceRetry = false) {
    if (this.holdSupportEnabled && !forceRetry) {
      return true;
    }

    if (this.holdSupportInitialized && !forceRetry) {
      return this.holdSupportEnabled;
    }

    if (forceRetry && this.uIOhook) {
      try {
        this.uIOhook.removeListener('keydown', this.handleUiohookKeydown);
        this.uIOhook.removeListener('keyup', this.handleUiohookKeyup);
        if (typeof this.uIOhook.stop === 'function') {
          this.uIOhook.stop();
        }
      } catch (stopError) {
        if (this.logger && this.logger.warn) {
          this.logger.warn('重新初始化全局键盘监听前停止旧监听失败', stopError);
        }
      }
      this.holdSupportInitialized = false;
      this.holdSupportEnabled = false;
    }

    if (this.holdSupportInitialized) {
      return this.holdSupportEnabled;
    }

    this.holdSupportInitialized = true;

    if (!this.uiohookModule) {
      if (this.logger && this.logger.warn) {
        this.logger.warn('全局按键监听模块未加载，按住快捷键模式不可用', this.uiohookLoadError);
      }
      return false;
    }

    const { uIOhook, UiohookKey } = this.uiohookModule;
    if (!uIOhook || !UiohookKey) {
      if (this.logger && this.logger.warn) {
        this.logger.warn('uIOhook 模块不完整，按住快捷键模式不可用');
      }
      return false;
    }

    this.uIOhook = uIOhook;
    this.UiohookKey = UiohookKey;

    try {
      this.uIOhook.removeListener('keydown', this.handleUiohookKeydown);
    } catch (removeError) {
      // ignore, listener可能尚未注册
      if (this.logger && this.logger.debug) {
        this.logger.debug('移除旧的keydown监听失败（可忽略）', removeError);
      }
    }

    try {
      this.uIOhook.removeListener('keyup', this.handleUiohookKeyup);
    } catch (removeError) {
      if (this.logger && this.logger.debug) {
        this.logger.debug('移除旧的keyup监听失败（可忽略）', removeError);
      }
    }

    try {
      this.uIOhook.on('keydown', this.handleUiohookKeydown);
      this.uIOhook.on('keyup', this.handleUiohookKeyup);
      this.uIOhook.start();
      this.holdSupportEnabled = true;
      if (this.logger && this.logger.info) {
        this.logger.info('已启用全局键盘监听，支持按住快捷键模式');
      }
    } catch (error) {
      this.holdSupportEnabled = false;
      if (this.logger && this.logger.warn) {
        this.logger.warn('启动全局键盘监听失败，按住快捷键模式不可用', error);
      }
    }

    return this.holdSupportEnabled;
  }

  ensureHoldSupport(forceRetry = false) {
    return this.initializeHoldSupport(forceRetry);
  }

  /**
   * 配置按住模式的回调
   * @param {string} hotkey 加速键
   * @param {Function|null|undefined} onRelease 松开回调
   */
  configureHoldHandler(hotkey, onRelease) {
    this.holdHandlers.delete(hotkey);
    this.activeHoldStates.delete(hotkey);

    if (!onRelease) {
      return;
    }

    if (!this.holdSupportEnabled) {
      if (this.logger && this.logger.warn) {
        this.logger.warn(`按住快捷键模式未启用，热键 ${hotkey} 将以切换模式运行`);
      }
      return;
    }

    const parsed = this.parseAcceleratorForHold(hotkey);
    if (!parsed) {
      if (this.logger && this.logger.warn) {
        this.logger.warn(`无法解析热键 ${hotkey} 的按住行为，按住模式不可用`);
      }
      return;
    }

    parsed.onRelease = onRelease;
    this.holdHandlers.set(hotkey, parsed);
  }

  parseAcceleratorForHold(hotkey) {
    if (!hotkey || typeof hotkey !== 'string' || !this.UiohookKey) {
      return null;
    }

    const tokens = hotkey.split('+').map((token) => token.trim()).filter(Boolean);
    if (!tokens.length) {
      return null;
    }

    const mainToken = tokens[tokens.length - 1];
    const mainKeyCode = this.mapKeyTokenToCode(mainToken);
    if (!mainKeyCode) {
      return null;
    }

    const config = {
      mainKeyCode,
      requiresAlt: false,
      requiresShift: false,
      requiresCommandOrControl: false,
      requiresMeta: false,
      requiresCtrl: false,
    };

    for (const rawToken of tokens.slice(0, -1)) {
      const token = rawToken.toLowerCase();
      if (token === 'commandorcontrol') {
        config.requiresCommandOrControl = true;
      } else if (token === 'command' || token === 'meta' || token === 'super') {
        config.requiresMeta = true;
      } else if (token === 'control' || token === 'ctrl') {
        config.requiresCtrl = true;
      } else if (token === 'alt' || token === 'option') {
        config.requiresAlt = true;
      } else if (token === 'shift') {
        config.requiresShift = true;
      }
    }

    return config;
  }

  mapKeyTokenToCode(token) {
    if (!token || !this.UiohookKey) {
      return null;
    }

    const directMap = {
      Space: 'Space',
      Tab: 'Tab',
      Enter: 'Enter',
      Return: 'Enter',
      Escape: 'Escape',
      Esc: 'Escape',
      Backspace: 'Backspace',
      Delete: 'Delete',
      Insert: 'Insert',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ArrowUp: 'ArrowUp',
      Up: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      Down: 'ArrowDown',
      ArrowLeft: 'ArrowLeft',
      Left: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
      Right: 'ArrowRight',
      CapsLock: 'CapsLock',
      NumLock: 'NumLock',
      ScrollLock: 'ScrollLock',
      Comma: 'Comma',
      Period: 'Period',
      Slash: 'Slash',
      Backslash: 'Backslash',
      Minus: 'Minus',
      Equal: 'Equal',
      Semicolon: 'Semicolon',
      Quote: 'Quote',
      Backquote: 'Backquote',
      BracketLeft: 'BracketLeft',
      BracketRight: 'BracketRight',
      NumpadAdd: 'NumpadAdd',
      NumpadSubtract: 'NumpadSubtract',
      NumpadMultiply: 'NumpadMultiply',
      NumpadDivide: 'NumpadDivide',
      NumpadDecimal: 'NumpadDecimal',
      NumpadEnter: 'NumpadEnter',
    };

    const mapped = directMap[token];
    if (mapped && this.UiohookKey[mapped] !== undefined) {
      return this.UiohookKey[mapped];
    }

    if (/^f\d{1,2}$/i.test(token)) {
      const keyName = token.toUpperCase();
      if (this.UiohookKey[keyName] !== undefined) {
        return this.UiohookKey[keyName];
      }
    }

    if (/^numpad\d$/i.test(token)) {
      const keyName = `Numpad${token.slice(-1)}`;
      if (this.UiohookKey[keyName] !== undefined) {
        return this.UiohookKey[keyName];
      }
    }

    if (/^[0-9]$/.test(token)) {
      if (this.UiohookKey[token] !== undefined) {
        return this.UiohookKey[token];
      }
    }

    const upper = token.length === 1 ? token.toUpperCase() : token.toUpperCase();
    if (this.UiohookKey[upper] !== undefined) {
      return this.UiohookKey[upper];
    }

    return null;
  }

  matchHoldModifiers(event, config) {
    if (!config) {
      return false;
    }

    const modifiers = this.getModifierState(event);

    if (config.requiresAlt) {
      if (!modifiers.altActive) {
        return false;
      }
    } else if (modifiers.altActive) {
      return false;
    }

    if (config.requiresShift) {
      if (!modifiers.shiftActive) {
        return false;
      }
    } else if (modifiers.shiftActive) {
      return false;
    }

    if (config.requiresCommandOrControl) {
      if (!(modifiers.metaActive || modifiers.ctrlActive)) {
        return false;
      }
    } else {
      if (config.requiresMeta) {
        if (!modifiers.metaActive) {
          return false;
        }
      } else if (modifiers.metaActive) {
        return false;
      }

      if (config.requiresCtrl) {
        if (!modifiers.ctrlActive) {
          return false;
        }
      } else if (modifiers.ctrlActive) {
        return false;
      }
    }

    return true;
  }

  getModifierState(event = {}) {
    const altFromEvent = !!event.altKey;
    const shiftFromEvent = !!event.shiftKey;
    const metaFromEvent = !!event.metaKey;
    const ctrlFromEvent = !!event.ctrlKey;

    const altActive = altFromEvent || this.isAnyAltPressed();
    const shiftActive = shiftFromEvent || this.isAnyShiftPressed();
    const metaActive = metaFromEvent || this.isAnyMetaPressed();
    const ctrlActive = ctrlFromEvent || this.isAnyCtrlPressed();

    return {
      altActive,
      shiftActive,
      metaActive,
      ctrlActive,
    };
  }

  handleUiohookKeydown(event) {
    if (!this.holdSupportEnabled || this.holdHandlers.size === 0) {
      return;
    }

    if (event && typeof event.keycode === 'number') {
      this.currentPressedKeys.add(event.keycode);
    }

    for (const [hotkey, config] of this.holdHandlers.entries()) {
      if (config.mainKeyCode !== event.keycode) {
        continue;
      }

      if (!this.matchHoldModifiers(event, config)) {
        continue;
      }

      const state = this.activeHoldStates.get(hotkey);
      if (state && state.active) {
        continue;
      }

      this.activeHoldStates.set(hotkey, {
        active: true,
        mainKeyCode: config.mainKeyCode,
        metaUsed: event.metaKey,
        ctrlUsed: event.ctrlKey,
        requiresAlt: config.requiresAlt,
        requiresShift: config.requiresShift,
        requiresCommandOrControl: config.requiresCommandOrControl,
        requiresMeta: config.requiresMeta,
        requiresCtrl: config.requiresCtrl,
        releaseDispatched: false,
      });
    }
  }

  handleUiohookKeyup(event) {
    if (!this.holdSupportEnabled || this.holdHandlers.size === 0) {
      return;
    }

    if (event && typeof event.keycode === 'number') {
      this.currentPressedKeys.delete(event.keycode);
    }

    for (const [hotkey, config] of this.holdHandlers.entries()) {
      const state = this.activeHoldStates.get(hotkey);
      if (!state || !state.active || state.releaseDispatched) {
        continue;
      }

      const isMainKeyRelease = event.keycode === state.mainKeyCode;
      const isMetaRelease = (state.metaUsed || config.requiresMeta) && this.isMetaKey(event.keycode);
      const isCtrlRelease = (state.ctrlUsed || config.requiresCtrl) && this.isControlKey(event.keycode);
      const isAltRelease = config.requiresAlt && this.isAltKey(event.keycode);
      const isShiftRelease = config.requiresShift && this.isShiftKey(event.keycode);

      if (isMainKeyRelease || isMetaRelease || isCtrlRelease || isAltRelease || isShiftRelease) {
        state.releaseDispatched = true;
        this.activeHoldStates.delete(hotkey);

        try {
          config.onRelease();
        } catch (error) {
          if (this.logger && this.logger.error) {
            this.logger.error(`热键 ${hotkey} 释放回调执行失败`, error);
          }
        }
      }
    }
  }

  isMetaKey(keycode) {
    if (!this.UiohookKey) {
      return false;
    }
    return keycode === this.UiohookKey.Meta || keycode === this.UiohookKey.MetaRight;
  }

  isControlKey(keycode) {
    if (!this.UiohookKey) {
      return false;
    }
    return keycode === this.UiohookKey.Ctrl || keycode === this.UiohookKey.CtrlRight;
  }

  isAltKey(keycode) {
    if (!this.UiohookKey) {
      return false;
    }
    return keycode === this.UiohookKey.Alt || keycode === this.UiohookKey.AltRight;
  }

  isShiftKey(keycode) {
    if (!this.UiohookKey) {
      return false;
    }
    return keycode === this.UiohookKey.Shift || keycode === this.UiohookKey.ShiftRight;
  }

  isAnyMetaPressed() {
    if (!this.UiohookKey) {
      return false;
    }
    return this.currentPressedKeys.has(this.UiohookKey.Meta)
      || this.currentPressedKeys.has(this.UiohookKey.MetaRight);
  }

  isAnyCtrlPressed() {
    if (!this.UiohookKey) {
      return false;
    }
    return this.currentPressedKeys.has(this.UiohookKey.Ctrl)
      || this.currentPressedKeys.has(this.UiohookKey.CtrlRight);
  }

  isAnyAltPressed() {
    if (!this.UiohookKey) {
      return false;
    }
    return this.currentPressedKeys.has(this.UiohookKey.Alt)
      || this.currentPressedKeys.has(this.UiohookKey.AltRight);
  }

  isAnyShiftPressed() {
    if (!this.UiohookKey) {
      return false;
    }
    return this.currentPressedKeys.has(this.UiohookKey.Shift)
      || this.currentPressedKeys.has(this.UiohookKey.ShiftRight);
  }

  /**
   * 注册F2双击热键
   * @param {Function} callback - 双击回调函数
   */
  registerF2DoubleClick(callback) {
    // 如果已经注册了F2，只更新回调函数，不重新注册
    if (this.registeredHotkeys.has('F2')) {
      if (this.logger && this.logger.info) {
        this.logger.info('F2热键已注册，更新回调函数');
      }
      this.onF2DoubleClick = callback;
      return true;
    }

    this.onF2DoubleClick = callback;

    // 注册F2单击监听
    const success = globalShortcut.register('F2', () => {
      this.handleF2Click();
    });

    if (success) {
      if (this.logger && this.logger.info) {
        this.logger.info('F2热键首次注册成功');
      }
      this.registeredHotkeys.set('F2', callback);
      return true;
    }
    if (this.logger && this.logger.error) {
      this.logger.error('F2热键注册失败');
    }
    return false;
  }

  /**
   * 处理F2按键点击
   */
  handleF2Click() {
    const now = Date.now();
    this.f2ClickTimes.push(now);

    // 清理超过双击时间窗口的点击记录
    this.f2ClickTimes = this.f2ClickTimes.filter((time) => now - time <= this.f2DoubleClickTimeout);

    // 检查是否为双击
    if (this.f2ClickTimes.length >= 2) {
      if (this.logger && this.logger.info) {
        this.logger.info('检测到F2双击');
      }
      this.handleF2DoubleClick();
      this.f2ClickTimes = []; // 清空点击记录
    }
  }

  /**
   * 处理F2双击事件
   */
  handleF2DoubleClick() {
    if (this.onF2DoubleClick) {
      const action = this.isRecording ? 'stop' : 'start';
      if (this.logger && this.logger.info) {
        this.logger.info(`F2双击 - ${action === 'start' ? '开始' : '停止'}录音，当前状态: ${this.isRecording}`);
      }

      this.onF2DoubleClick({
        action,
        currentState: this.isRecording,
      });
    }
  }

  /**
   * 注册传统热键（如Cmd+Shift+Space）
   * @param {string} hotkey - 热键组合
   * @param {Function} callback - 回调函数
   * @param {{ onRelease?: Function }} [options] - 附加选项
   */
  registerHotkey(hotkey, callback, options = {}) {
    const onRelease = options.onRelease;

    if (this.registeredHotkeys.has(hotkey)) {
      this.configureHoldHandler(hotkey, onRelease);
      if (this.logger && this.logger.info) {
        this.logger.info(`热键 ${hotkey} 已注册，更新配置`);
      }
      return {
        success: true,
        alreadyRegistered: true,
      };
    }

    const debouncedCallback = () => {
      const now = Date.now();
      const lastTrigger = this.lastHotkeyTrigger.get(hotkey) || 0;

      if (now - lastTrigger < this.hotkeyDebounceTime) {
        return;
      }

      this.lastHotkeyTrigger.set(hotkey, now);
      callback();
    };

    let success = false;
    let errorMessage = null;

    try {
      success = globalShortcut.register(hotkey, debouncedCallback);
    } catch (error) {
      errorMessage = error.message || '未知错误';
      if (this.logger && this.logger.error) {
        this.logger.error(`热键 ${hotkey} 注册异常`, error);
      }
    }

    if (success) {
      if (this.logger && this.logger.info) {
        this.logger.info(`热键 ${hotkey} 注册成功`);
      }
      this.registeredHotkeys.set(hotkey, debouncedCallback);
      this.configureHoldHandler(hotkey, onRelease);
      return { success: true };
    }

    this.configureHoldHandler(hotkey, null);

    if (!errorMessage) {
      errorMessage = '热键可能已被系统或其他应用占用';
    }

    if (this.logger && this.logger.error) {
      this.logger.error(`热键 ${hotkey} 注册失败: ${errorMessage}`);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }

  /**
   * 注销热键
   * @param {string} hotkey - 热键组合
   */
  unregisterHotkey(hotkey) {
    if (this.registeredHotkeys.has(hotkey)) {
      globalShortcut.unregister(hotkey);
      this.registeredHotkeys.delete(hotkey);
      this.lastHotkeyTrigger.delete(hotkey);
      this.configureHoldHandler(hotkey, null);
      if (this.logger && this.logger.info) {
        this.logger.info(`热键 ${hotkey} 已注销`);
      }
      return true;
    }
    return false;
  }

  /**
   * 注销所有热键
   */
  unregisterAllHotkeys() {
    globalShortcut.unregisterAll();
    this.registeredHotkeys.clear();
    this.lastHotkeyTrigger.clear();
    this.f2ClickTimes = [];
    this.holdHandlers.clear();
    this.activeHoldStates.clear();
    this.currentPressedKeys.clear();
    if (this.logger && this.logger.info) {
      this.logger.info('所有热键已注销');
    }
  }

  /**
   * 获取已注册的热键列表
   */
  getRegisteredHotkeys() {
    return Array.from(this.registeredHotkeys.keys());
  }

  /**
   * 检查热键是否已注册
   * @param {string} hotkey - 热键组合
   */
  isHotkeyRegistered(hotkey) {
    return this.registeredHotkeys.has(hotkey);
  }

  /**
   * 设置录音状态（用于外部同步状态）
   * @param {boolean} isRecording - 录音状态
   */
  setRecordingState(isRecording) {
    this.isRecording = isRecording;
  }

  /**
   * 获取当前录音状态
   */
  getRecordingState() {
    return this.isRecording;
  }

  /**
   * 是否已经启用按住检测能力
   */
  isHoldSupported() {
    return this.holdSupportEnabled;
  }
}

module.exports = HotkeyManager;
