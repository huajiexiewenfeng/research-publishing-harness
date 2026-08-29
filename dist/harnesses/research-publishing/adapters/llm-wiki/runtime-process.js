import { spawn } from 'node:child_process';
import { HarnessError } from '../../core/errors.js';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
function terminateProcessTree(pid) {
    if (pid === undefined)
        return;
    if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
            shell: false,
            windowsHide: true,
            stdio: 'ignore'
        });
        killer.unref();
        return;
    }
    try {
        process.kill(pid, 'SIGKILL');
    }
    catch {
        // The process may already have exited between the timeout and termination.
    }
}
function parseEnvelope(bytes) {
    const text = bytes.toString('utf8').replace(/^\uFEFF/, '').trim();
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'runtime stdout must contain exactly one JSON object');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'runtime response is not a JSON object');
    }
    return parsed;
}
export class NodeRuntimeProcessRunner {
    async run(input) {
        if (input.shell !== false) {
            throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'runtime shell execution is forbidden');
        }
        const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;
        const maxOutputBytes = input.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES;
        return new Promise((resolve, reject) => {
            let settled = false;
            let totalBytes = 0;
            const stdout = [];
            let stderrPresent = false;
            const child = spawn(input.executable, [...input.args], {
                cwd: input.cwd,
                shell: false,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            const finishError = (error) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                terminateProcessTree(child.pid);
                reject(error);
            };
            const count = (length) => {
                totalBytes += length;
                if (totalBytes <= maxOutputBytes)
                    return true;
                finishError(new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'runtime output exceeded the configured byte limit'));
                return false;
            };
            child.stdout.on('data', (chunk) => {
                if (count(chunk.length))
                    stdout.push(Buffer.from(chunk));
            });
            child.stderr.on('data', (chunk) => {
                stderrPresent = stderrPresent || chunk.length > 0;
                count(chunk.length);
            });
            child.once('error', () => finishError(new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'runtime process could not be started')));
            child.once('close', (exitCode) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                try {
                    resolve({
                        exit_code: exitCode,
                        envelope: parseEnvelope(Buffer.concat(stdout)),
                        stderr_present: stderrPresent
                    });
                }
                catch (error) {
                    reject(error);
                }
            });
            const timer = setTimeout(() => finishError(new HarnessError('MEMORY_RUNTIME_TIMEOUT', 'runtime process exceeded the configured timeout')), timeoutMs);
            timer.unref();
        });
    }
}
//# sourceMappingURL=runtime-process.js.map