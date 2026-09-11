export type ThemeMode = 'dark' | 'light' | 'system';

/** Standardized error categories used across all Voxel+ subsystems. */
export type VoxelErrorCategory =
  | 'JAVA'
  | 'MINECRAFT'
  | 'FABRIC'
  | 'LOOM'
  | 'GRADLE'
  | 'MOD'
  | 'RESOURCE_PACK'
  | 'SHADER'
  | 'INSTANCE'
  | 'SKIN'
  | 'DOWNLOAD'
  | 'NETWORK'
  | 'FILESYSTEM'
  | 'IPC'
  | 'CONFIGURATION'
  | 'UNKNOWN';

/** Standardized severity levels used across all Voxel+ subsystems. */
export type VoxelErrorSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'FATAL';

/**
 * Serializable, IPC-safe representation of a structured Voxel+ error.
 * The renderer receives this payload (JSON-encoded) instead of raw exceptions.
 */
export interface VoxelErrorPayload {
  /** Short, user-facing headline, e.g. "Minecraft Launch Failed". */
  title: string;
  /** Clear explanation of what happened, in user-facing language. */
  message: string;
  /** Likely root cause, when known. */
  cause?: string;
  /** Actionable troubleshooting step for the user. */
  suggestedAction?: string;
  /** Stable technical identifier, e.g. JAVA_VERSION_MISMATCH. */
  code?: string;
  category: VoxelErrorCategory;
  severity: VoxelErrorSeverity;
  /** Technical/debug details (raw exception text, context) for logs. */
  details?: string;
}

/**
 * Marker prefix used to transport a structured VoxelErrorPayload across IPC.
 *
 * Electron only forwards the `message` string of errors thrown from
 * `ipcMain.handle` to the renderer (it does NOT transfer custom error
 * properties), so the main process embeds the serialized payload in the
 * message as `VOXEL_ERROR::{...json...}` and the renderer parses it back out.
 */
export const VOXEL_IPC_ERROR_MARKER = 'VOXEL_ERROR::';

/**
 * Parsed representation of a structured IPC failure, as reconstructed by the
 * renderer (see frontend/src/services/errors.ts). `message` keeps the raw
 * Electron error text so `e.message` consumers keep working.
 */
export interface VoxelIpcError {
  isVoxelError: true;
  message: string;
  payload: VoxelErrorPayload;
}

export type ProcessStatus =
  | 'READY'
  | 'PREPARING'
  | 'STARTING'
  | 'LAUNCHING'
  | 'RUNNING'
  | 'STOPPING'
  | 'STOPPED'
  | 'ERROR';

export type LoaderType = 'fabric' | 'quilt' | 'neoforge' | 'forge';

export interface JavaRuntime {
  id: string;
  name: string;
  majorVersion: number;
  fullVersion: string;
  vendor: string;
  architecture: 'x64' | 'x86' | 'arm64' | 'unknown';
  path: string;
  executablePath: string;
  isValid: boolean;
  isLts: boolean;
  isRecommended: boolean;
  testStatus: 'DETECTED' | 'TESTED' | 'FAILED' | 'INCOMPATIBLE' | 'RECOMMENDED';
  testOutput?: string;
  pros: string[];
  cons: string[];
  compatibilityDescription: string;
}

export interface DiskDriveInfo {
  drive: string;
  label: string;
  totalSpaceGb: number;
  freeSpaceGb: number;
  isAvailable: boolean;
}

export interface SystemScanResult {
  os: {
    caption: string;
    version: string;
    architecture: string;
    platform: string;
  };
  cpu: {
    name: string;
    cores: number;
    logicalProcessors: number;
    architecture: string;
  };
  memory: {
    totalGb: number;
    freeGb: number;
    usedGb: number;
    percentUsed: number;
  };
  gpu: {
    name: string;
  };
  storage: {
    drives: DiskDriveInfo[];
    defaultInstanceDriveAvailableGb: number;
  };
  java: {
    installed: JavaRuntime[];
    recommendedJava: JavaRuntime | null;
  };
  timestamp: string;
}

export interface EnvironmentCheckItem {
  id: string;
  title: string;
  description: string;
  status: 'passed' | 'failed' | 'warning' | 'checking';
  details?: string;
  fixAction?: {
    label: string;
    action: string;
    params?: Record<string, any>;
  };
}

export interface EnvironmentCheckResult {
  allPassed: boolean;
  items: EnvironmentCheckItem[];
  timestamp: string;
}

export interface InstanceAppearance {
  artwork: string | null; // Data URL or preset name
  item: string; // e.g. "minecraft:diamond"
  skinId?: string | null; // Reference to skin in skin library
}

export interface InstanceRuntime {
  java: 'auto' | string; // 'auto' or specific Java runtime ID / path
  memoryMb: number;
  jvmArgs?: string;
}

export interface InstanceLoader {
  type: LoaderType;
  version: string;
}

export interface InstanceMetadata {
  schemaVersion: number;
  id: string;
  name: string;
  minecraft: {
    version: string;
  };
  loader: InstanceLoader;
  runtime: InstanceRuntime;
  appearance: InstanceAppearance;
  isFavorite: boolean;
  createdAt: string;
  lastPlayedAt: string | null;
  status: ProcessStatus;
  modCount?: number;
  resourcePackCount?: number;
  shaderCount?: number;
  instancePath?: string;
}

export interface ModInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  icon?: string; // Data URL
  filename: string;
  enabled: boolean;
  path: string;
  sizeBytes: number;
  environment?: 'client' | 'server' | '*';
}

export interface ResourcePackInfo {
  name: string;
  description: string;
  format: number;
  icon?: string; // Data URL
  filename: string;
  enabled: boolean;
  path: string;
  sizeBytes: number;
}

export interface ShaderPackInfo {
  name: string;
  filename: string;
  enabled: boolean;
  path: string;
  sizeBytes: number;
}

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: string;
  server_side: string;
  body?: string;
  icon_url: string | null;
  downloads: number;
  follows: number;
  author: string;
  project_type: 'mod' | 'resourcepack' | 'shader' | 'modpack';
  versions?: ModrinthVersion[];
  gallery?: { url: string; title?: string }[];
}

export interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  hashes: {
    sha1: string;
    sha512: string;
  };
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  featured: boolean;
  date_published: string;
  downloads: number;
  files: ModrinthVersionFile[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  timeString: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'GRADLE' | 'LOOM' | 'DEBUG';
  message: string;
  instanceId?: string;
  instanceName?: string;
}

export interface AppSettings {
  theme: ThemeMode;
  instanceDirectory: string;
  globalJavaMode: 'auto' | string;
  preferredJavaId: string | null;
  defaultMemoryMb: number;
  notificationsEnabled: boolean;
  advancedJvmArgs: string;
  gradleWrapperArgs: string;
  debugLogging: boolean;
  firstRunCompleted: boolean;
}

export interface CreateInstancePayload {
  name: string;
  minecraftVersion: string;
  loaderType: LoaderType;
  loaderVersion?: string;
  javaRuntime?: 'auto' | string;
  memoryMb?: number;
  artwork?: string | null;
  item?: string;
}

export interface LaunchResult {
  success: boolean;
  instanceId: string;
  pid?: number;
  message?: string;
  errorDetails?: string;
}

export interface DownloadProgressEvent {
  downloadId: string;
  itemTitle: string;
  bytesReceived: number;
  totalBytes: number;
  percentage: number;
  status: 'downloading' | 'verifying' | 'completed' | 'failed';
  error?: string;
}

export interface ProcessStatusEvent {
  instanceId: string;
  status: ProcessStatus;
  pid?: number;
  exitCode?: number | null;
  error?: string;
}

export interface MinecraftVersionOption {
  version: string;
  type: 'release' | 'snapshot';
  releaseTime: string;
  recommendedJava: number;
  fabricSupported: boolean;
}

// Skin Manager Types
export type SkinModel = 'steve' | 'alex';

export interface SkinMetadata {
  id: string;
  name: string;
  filePath: string;
  model: SkinModel;
  dimensions: { width: number; height: number };
  sizeBytes: number;
  source: 'import' | 'download';
  sourceUsername?: string; // For downloaded skins
  downloadedAt?: string;
  isActive: boolean;
  createdAt: string;
  thumbnail: string; // Data URL for preview
}

export interface SkinValidationResult {
  isValid: boolean;
  error?: string;
  dimensions?: { width: number; height: number };
  model?: SkinModel;
  sizeBytes?: number;
}

export interface SkinSearchResult {
  username: string;
  uuid: string;
  skinUrl: string;
  capeUrl?: string;
  nameHistory: Array<{ name: string; changed_at: string }>;
}

export interface SkinDownloadProgress {
  downloadId: string;
  username: string;
  bytesReceived: number;
  totalBytes: number;
  percentage: number;
  status: 'downloading' | 'validating' | 'completed' | 'failed';
  error?: string;
}
