/**
 * Tailscale Detection — checks if Tailscale is running and returns mesh status.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TailscaleStatus {
  running: boolean;
  hostname: string | null;
  ip: string | null;
  tailnet: string | null;
}

export async function getTailscaleStatus(): Promise<TailscaleStatus> {
  try {
    const { stdout } = await execAsync('tailscale status --json');
    const data = JSON.parse(stdout);
    return {
      running: true,
      hostname: data.Self?.HostName ?? null,
      ip: data.Self?.TailscaleIPs?.[0] ?? null,
      tailnet: data.CurrentTailnet?.Name ?? null,
    };
  } catch {
    return { running: false, hostname: null, ip: null, tailnet: null };
  }
}

export async function isTailscaleRunning(): Promise<boolean> {
  const status = await getTailscaleStatus();
  return status.running;
}
