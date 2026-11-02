/**
 * Builds the detached Windows script that swaps the launcher executable after
 * the running process exits.
 *
 * Data-safety contract: this script only ever touches the executable file
 * (`VoxelPlus.exe`) and its `.old` backup. It never reads, moves or deletes the
 * portable data folder, `instances/`, `config/`, `vpacks/` or anything else in
 * the user data directory — an update must never cost the user their worlds.
 *
 * Paths are passed as arguments (`%~1`..`%~4`) rather than interpolated into the
 * script body, so spaces/`&`/`%` in a user's install path cannot break or
 * inject into the script.
 *
 * Arguments:
 *   1 = PID to wait for, 2 = downloaded exe, 3 = target exe, 4 = log file
 *
 * The `.old` backup is intentionally **kept** after a successful swap: the
 * launcher deletes it on the next clean start (UpdateService.cleanupStaleBackup),
 * so a build that fails to boot still has a rollback copy on disk.
 */
export function buildApplyUpdateScript(): string {
  return [
    '@echo off',
    'setlocal EnableExtensions',
    'set "WAIT_PID=%~1"',
    'set "SRC=%~2"',
    'set "DST=%~3"',
    'set "LOG=%~4"',
    'set /a TRIES=0',
    '',
    'rem --- 0. Sanity-check the downloaded build before touching anything ---',
    'if not exist "%SRC%" goto nosource',
    'for %%A in ("%SRC%") do if %%~zA LSS 1 goto nosource',
    'if not exist "%DST%" goto nosource',
    '',
    'rem --- 1. Wait for the launcher to exit (bounded, ~60s) ---',
    ':wait',
    'tasklist /FI "PID eq %WAIT_PID%" /NH 2>nul | find "%WAIT_PID%" >nul',
    'if errorlevel 1 goto swap',
    'set /a TRIES+=1',
    'if %TRIES% GEQ 60 goto swap',
    'timeout /t 1 /nobreak >nul',
    'goto wait',
    '',
    'rem --- 2. Back up the current exe, then swap in the new one ---',
    ':swap',
    'if exist "%DST%.old" del /f /q "%DST%.old" >nul 2>&1',
    'copy /Y "%DST%" "%DST%.old" >nul 2>&1',
    'if errorlevel 1 goto nosource',
    'set /a TRIES=0',
    ':copy',
    'copy /Y "%SRC%" "%DST%" >nul 2>&1',
    'if not errorlevel 1 goto verify',
    'set /a TRIES+=1',
    'if %TRIES% GEQ 30 goto restore',
    'timeout /t 1 /nobreak >nul',
    'goto copy',
    '',
    'rem --- 3. Confirm the replacement is complete before relaunching ---',
    ':verify',
    'for %%A in ("%SRC%") do set "SRC_SIZE=%%~zA"',
    'for %%A in ("%DST%") do set "DST_SIZE=%%~zA"',
    'if not "%SRC_SIZE%"=="%DST_SIZE%" goto restore',
    'if not exist "%DST%" goto restore',
    'goto done',
    '',
    'rem --- 4. Swap failed: restore the old exe so the launcher still works ---',
    ':restore',
    'if exist "%DST%.old" copy /Y "%DST%.old" "%DST%" >nul 2>&1',
    'if defined LOG echo [voxelplus] update swap failed; restored previous launcher>>"%LOG%"',
    'if exist "%DST%" start "" "%DST%"',
    'del "%~f0" >nul 2>&1',
    'exit /b 1',
    '',
    'rem --- 5. Nothing usable to install: keep the current launcher intact ---',
    ':nosource',
    'if defined LOG echo [voxelplus] downloaded update unavailable; launcher left unchanged>>"%LOG%"',
    'if exist "%DST%" start "" "%DST%"',
    'del "%~f0" >nul 2>&1',
    'exit /b 1',
    '',
    'rem --- 6. Success: relaunch and keep the .old backup for one clean start ---',
    ':done',
    'if defined LOG echo [voxelplus] launcher updated successfully; backup kept as %DST%.old>>"%LOG%"',
    'start "" "%DST%"',
    'del "%~f0" >nul 2>&1',
    'exit /b 0',
    ''
  ].join('\r\n');
}
