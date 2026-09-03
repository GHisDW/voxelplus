import { LogEntry } from '../../types';
import crypto from 'node:crypto';

export class LogStreamer {
  private static logs: LogEntry[] = [];
  private static readonly MAX_LOGS = 5000;
  private static listeners: ((entry: LogEntry) => void)[] = [];

  public static onLog(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public static addLog(
    message: string,
    level: 'INFO' | 'WARN' | 'ERROR' | 'GRADLE' | 'LOOM' | 'DEBUG' = 'INFO',
    instanceId?: string,
    instanceName?: string
  ): LogEntry {
    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0]; // HH:MM:SS

    // Auto-detect log level from Gradle / Loom / MC output
    let detectedLevel = level;
    if (message.includes('ERROR') || message.includes('Exception') || message.includes('FAILURE:')) {
      detectedLevel = 'ERROR';
    } else if (message.includes('WARN') || message.includes('WARNING')) {
      detectedLevel = 'WARN';
    } else if (message.includes('Fabric Loom') || message.includes('[Loom]')) {
      detectedLevel = 'LOOM';
    } else if (message.startsWith('> Task') || message.includes('BUILD SUCCESSFUL')) {
      detectedLevel = 'GRADLE';
    }

    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      timeString,
      level: detectedLevel,
      message,
      instanceId,
      instanceName
    };

    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (e) {
        console.error('Error in log listener:', e);
      }
    }

    return entry;
  }

  public static getLogs(instanceId?: string, levelFilter?: string, query?: string): LogEntry[] {
    let filtered = this.logs;

    if (instanceId && instanceId !== 'all') {
      filtered = filtered.filter(l => l.instanceId === instanceId);
    }

    if (levelFilter && levelFilter !== 'ALL') {
      filtered = filtered.filter(l => l.level.toUpperCase() === levelFilter.toUpperCase());
    }

    if (query && query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(l => l.message.toLowerCase().includes(q));
    }

    return filtered;
  }

  public static clearLogs(instanceId?: string): void {
    if (instanceId && instanceId !== 'all') {
      this.logs = this.logs.filter(l => l.instanceId !== instanceId);
    } else {
      this.logs = [];
    }
  }

  public static exportLogs(instanceId?: string): string {
    const targetLogs = this.getLogs(instanceId);
    return targetLogs.map(l => `[${l.timeString}] [${l.level}] ${l.message}`).join('\n');
  }
}
