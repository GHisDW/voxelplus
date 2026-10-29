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
  // skinId removed in v2 — old metadata files may still contain it; ignored on read, stripped on write
}

export interface InstanceExtras {
  tags?: string[]; // Custom tags for organization (e.g., "survival", "tech", "magic")
  notes?: string; // Custom notes about the instance
  difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard'; // Intended difficulty
  gameMode?: 'survival' | 'creative' | 'adventure' | 'spectator'; // Intended game mode
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
  description?: string;
  minecraft: {
    version: string;
  };
  loader: InstanceLoader;
  runtime: InstanceRuntime;
  appearance: InstanceAppearance;
  extras?: InstanceExtras;
  isFavorite: boolean;
  createdAt: string;
  lastPlayedAt: string | null;
  status: ProcessStatus;
  shareSource?: string; // where it was shared from (e.g. "discord", "voxelplus-hub", "friend")
  isVPack?: boolean; // whether this instance was imported from a VPack
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
  description?: string;
  minecraftVersion: string;
  loaderType: LoaderType;
  loaderVersion?: string;
  javaRuntime?: 'auto' | string;
  memoryMb?: number;
  artwork?: string | null;
  item?: string;
  shareSource?: string;
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

// ────────────────────────────────────────────────────────
// Player Profile & Economy Types
// ────────────────────────────────────────────────────────

export interface PlayerProfile {
  id: string;
  displayName: string;
  avatar: string | null; // Data URL
  equippedCosmeticId: string | null;
  equippedEffectId: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface WalletState {
  balance: number; // Integer VP
  lifetimeEarned: number;
  lifetimeSpent: number;
  lastTransactionId: string | null;
}

export interface WalletTransaction {
  id: string;
  type: 'earn' | 'spend';
  amount: number; // positive integer
  reason: string;
  sourceId?: string; // achievement ID, game run ID, etc.
  timestamp: string;
}

export type AchievementCategory =
  | 'launcher'
  | 'vpack'
  | 'content'
  | 'stocker'
  | 'cookie'
  | 'player'
  | 'collection';

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  icon?: string;
  hidden: boolean;
  /** For boolean achievements: target = 1. For numeric: the threshold. */
  target: number;
  /** VP reward on first unlock. 0 = no reward. */
  rewardVP: number;
  /** Cosmetic ID unlocked by this achievement, if any. */
  rewardCosmeticId?: string;
  /** Multi-stage: ordered list of sub-targets, each granting partial credit. */
  stages?: { target: number; rewardVP: number }[];
  /** Hex color for achievement badge (e.g., '#6366f1') */
  color?: string;
  /** Badge shape: hexagon, diamond, shield, octagon, badge */
  shape?: 'hexagon' | 'diamond' | 'shield' | 'octagon' | 'badge';
  /** Whether this is a win condition (master achievement) */
  isWinCondition?: boolean;
}

export interface AchievementProgress {
  achievementId: string;
  currentValue: number;
  unlocked: boolean;
  unlockedAt: string | null;
  rewardClaimed: boolean;
  stagesClaimed: number[]; // indices of claimed stages
}

export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type CosmeticCategory =
  | 'gem'
  | 'mining'
  | 'relic'
  | 'mob'
  | 'badge'
  | 'cosmic'
  | 'original';

export interface CosmeticDefinition {
  id: string;
  name: string;
  description: string;
  rarity: CosmeticRarity;
  category: CosmeticCategory;
  artworkPath: string;
  /** null = purchasable with VP. 'achievement:xxx' = unlocked by achievement. */
  unlockCondition: string | null;
  /** VP price. 0 or null if not purchasable. */
  price: number | null;
  supportedEffectIds: string[];
  available: boolean;
}

export interface CosmeticEffect {
  id: string;
  name: string;
  family: 'glitter' | 'rainbow' | 'shine' | 'enchantment' | 'fire' | 'ice' | 'poison' | 'ender' | 'golden' | 'redstone' | 'nether' | 'wither';
  cssClass: string;
}

export interface CosmeticOwnership {
  cosmeticId: string;
  acquiredAt: string;
  source: 'purchase' | 'achievement' | 'default';
}

// ────────────────────────────────────────────────────────
// VPack Types
// ────────────────────────────────────────────────────────

export interface VPackManifest {
  formatId: 'voxelplus-vpack';
  formatVersion: 1;
  packId: string;
  name: string;
  description: string;
  author: string;
  packVersion: string;
  minecraft: {
    version: string;
  };
  loader: {
    type: LoaderType;
    version: string;
  };
  content: VPackContentEntry[];
  artwork: string | null; // relative path inside archive
  item?: string; // Minecraft item texture ID derived from instance
  shareSource?: string; // e.g. "discord", "voxelplus-hub", "friend"
  price?: number; // VP price in marketplace
  createdAt: string;
  generatorVersion: string;
  source?: {
    platform: 'modrinth';
    projectId: string;
    versionId: string;
    url: string;
  };
}

export interface VPackListing {
  fileName: string;
  filePath: string;
  manifest: VPackManifest;
  price: number;
}

export interface VPackContentEntry {
  relativePath: string;
  type: 'mod' | 'resourcepack' | 'shaderpack' | 'config' | 'other';
  sizeBytes: number;
  sha256?: string;
  sha1?: string;
  /** Optional remote source used when a catalog pack intentionally keeps large binaries out of git. */
  downloadUrl?: string;
}

export interface VPackValidationResult {
  valid: boolean;
  manifest: VPackManifest | null;
  errors: string[];
  warnings: string[];
}

// ────────────────────────────────────────────────────────
// Arcade Types
// ────────────────────────────────────────────────────────

export type StockerMode = 'wave' | 'ship';

export interface StockerRunResult {
  mode: StockerMode;
  score: number;
  distance: number;
  obstaclesCleared: number;
  durationMs: number;
  timestamp: string;
}

export interface StockerSaveData {
  bestScore: number;
  bestScoreWave: number;
  bestScoreShip: number;
  totalRuns: number;
  totalDistance: number;
  totalObstaclesCleared: number;
  lastRunTimestamp: string | null;
}

export interface CookieClickerSaveData {
  cookies: number;
  lifetimeCookies: number;
  cookiesPerClick: number;
  cookiesPerSecond: number;
  upgrades: Record<string, number>; // upgradeId -> count owned
  producers: Record<string, number>; // producerId -> count owned
  milestonesClaimed: number[]; // lifetime cookie thresholds claimed
  lastTickTimestamp: string;
  totalClicks: number;
  totalTimePlayedMs: number;
}

export interface ArcadeRewardResult {
  vpEarned: number;
  newAchievements: string[];
  transactionId: string | null;
}

// ─── Launcher updates ────────────────────────────────────────────────────────

export interface UpdateAssetInfo {
  name: string;
  url: string;
  /** Expected size in bytes (0 when the API does not report one). */
  size: number;
  /** Expected SHA-256 hex digest from the release asset metadata, if any. */
  sha256: string | null;
}

export type UpdateCheckStatus = 'up-to-date' | 'available' | 'error';

export interface UpdateInfo {
  status: UpdateCheckStatus;
  currentVersion: string;
  latestVersion: string | null;
  /** Forced update: the launcher must be updated before it can be used. */
  mandatory: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
  asset: UpdateAssetInfo | null;
  /** True when this build can download and swap its own executable. */
  canAutoInstall: boolean;
  portable: boolean;
  checkedAt: string;
  error?: string;
}

export interface UpdateProgressEvent {
  received: number;
  total: number;
  percent: number;
  fileName: string;
}

export interface UpdateInstallResult {
  started: boolean;
  reason?: string;
}

export interface UpdateRuntimeInfo {
  version: string;
  portable: boolean;
  canAutoInstall: boolean;
  platform: string;
}
