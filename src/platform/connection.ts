import { platform } from 'os';
import { Logger } from '../utils/logger.js';
import { PhotoshopDetector } from './detector.js';
import { ScriptExecutor } from './script-executor.js';
import { WindowsExecutor } from './windows-executor.js';
import { MacOSExecutor } from './macos-executor.js';

export interface PhotoshopInfo {
  version: string;
  path: string;
  isRunning: boolean;
  appName?: string;
}

export class PhotoshopConnection {
  private logger: Logger;
  private detector: PhotoshopDetector;
  private executor: ScriptExecutor | null = null;
  private photoshopInfo: PhotoshopInfo | null = null;
  private macosExecutor?: MacOSExecutor;

  constructor() {
    this.logger = new Logger('PhotoshopConnection');
    this.detector = new PhotoshopDetector();
    // Executor is initialized lazily on first use so that constructing a
    // PhotoshopConnection on an unsupported platform (e.g. the Linux CI runner
    // used for the verify-photoshop-prompts script) does not throw immediately.
  }

  /** Returns the platform executor, initializing it on first call. */
  private getExecutor(): ScriptExecutor {
    if (this.executor) return this.executor;

    const platformType = platform();
    if (platformType === 'win32') {
      this.executor = new WindowsExecutor();
    } else if (platformType === 'darwin') {
      this.macosExecutor = new MacOSExecutor();
      this.executor = this.macosExecutor;
    } else {
      throw new Error(`Unsupported platform: ${platformType}`);
    }
    return this.executor;
  }

  async ping(): Promise<boolean> {
    try {
      this.logger.debug('Pinging Photoshop...');
      
      // Try to detect Photoshop if not already detected
      if (!this.photoshopInfo) {
        this.photoshopInfo = await this.detector.detect();
      }

      // For now, just check if Photoshop is detected
      return this.photoshopInfo !== null;
    } catch (error) {
      this.logger.error('Ping failed:', error);
      return false;
    }
  }

  async getVersion(): Promise<string> {
    try {
      if (!this.photoshopInfo) {
        this.photoshopInfo = await this.detector.detect();
      }

      return this.photoshopInfo?.version || 'Unknown';
    } catch (error) {
      this.logger.error('Failed to get version:', error);
      throw error;
    }
  }

  // Deep Artisan 20.09: Photoshop в модальном режиме (диалог, прогресс «Ход
  // выполнения», «Выделение объектов» в режиме поиска) не исполняет Apple-events —
  // КАЖДЫЙ вызов висел до таймаута (30 с) и отдавал безликий «Script execution
  // timeout», модель повторяла вызов вслепую (живой прогон 20.09: три get_state
  // подряд). Теперь: таймаут → проба живости 4 с мимо очереди; не ответила →
  // ошибка `Photoshop busy` (код photoshop_busy) и удержание 8 с — повторные вызовы
  // падают сразу, без ожидания.
  private busyUntil = 0;
  private static readonly BUSY_HOLD_MS = 8000;
  static readonly BUSY_MESSAGE =
    'Photoshop busy: it is not responding to scripts — a modal dialog or progress bar is open, or a tool is busy (e.g. Object Selection in search mode). ' +
    'Tell the user to close the dialog / wait for it to finish / switch to another tool, then retry. Do not repeat the same call blindly.';

  async executeScript(script: string, timeout?: number): Promise<unknown> {
    if (Date.now() < this.busyUntil) {
      throw new Error(PhotoshopConnection.BUSY_MESSAGE);
    }
    try {
      // Ensure Photoshop is detected
      if (!this.photoshopInfo) {
        this.photoshopInfo = await this.detector.detect();
      }

      const executor = this.getExecutor();
      this.applyMacOSAppName();

      // Check if Photoshop is running, launch if needed
      const isRunning = await executor.isPhotoshopRunning();
      if (!isRunning) {
        this.logger.info('Photoshop not running, launching...');
        await executor.launchPhotoshop(this.photoshopInfo.path);
      }

      // Execute the script
      const result = await executor.execute(script, timeout);
      return result;
    } catch (error) {
      this.logger.error('Script execution failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (/Script execution timeout|waiting in the execution queue/i.test(msg) && this.macosExecutor) {
        const alive = await this.macosExecutor.probeResponsive(4000);
        if (!alive) {
          this.busyUntil = Date.now() + PhotoshopConnection.BUSY_HOLD_MS;
          throw new Error(PhotoshopConnection.BUSY_MESSAGE);
        }
      }
      throw error;
    }
  }

  getPhotoshopInfo(): PhotoshopInfo | null {
    return this.photoshopInfo;
  }

  async ensurePhotoshopRunning(): Promise<void> {
    if (!this.photoshopInfo) {
      this.photoshopInfo = await this.detector.detect();
    }

    const executor = this.getExecutor();
    this.applyMacOSAppName();
    const isRunning = await executor.isPhotoshopRunning();
    if (!isRunning) {
      this.logger.info('Launching Photoshop...');
      await executor.launchPhotoshop(this.photoshopInfo.path);
    }
  }

  /**
   * Point the macOS executor at the detected app bundle name. Must run after
   * getExecutor(): the executor is created lazily, and before this ordering fix
   * the first script of every session ran against the hard-coded default
   * ("Adobe Photoshop 2025"), so on any other version pgrep reported Photoshop
   * as not running, launchPhotoshop() stole focus for 5s, and osascript failed
   * to compile `do javascript` (-2741) because the app name did not resolve.
   */
  private applyMacOSAppName(): void {
    if (this.macosExecutor && this.photoshopInfo?.appName) {
      this.macosExecutor.setAppName(this.photoshopInfo.appName);
    }
  }
}
