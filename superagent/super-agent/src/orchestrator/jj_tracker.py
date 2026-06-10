"""
AgentDB Bridge Client + Task Trajectory Tracker

AgentDBBridge: singleton async client for agentdb_bridge.mjs subprocess.
TaskTrajectoryTracker: higher-level wrapper for agentic-jujutsu-style trajectory tracking.
"""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

BRIDGE_SCRIPT = Path(__file__).parent / 'agentdb_bridge.mjs'
MODULES_PATH = os.environ.get('AGENTDB_MODULES', '/home/user/ruflo/v3/node_modules')


class AgentDBBridge:
    """Singleton async client for the agentdb_bridge.mjs subprocess."""

    _instance: Optional['AgentDBBridge'] = None

    def __init__(self) -> None:
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._start_lock = asyncio.Lock()
        self._call_lock = asyncio.Lock()
        self._ready = False
        self.logger = logging.getLogger(__name__)

    @classmethod
    async def get(cls) -> 'AgentDBBridge':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def _ensure_started(self) -> None:
        if self._ready:
            return
        async with self._start_lock:
            if self._ready:
                return
            try:
                env = {**os.environ, 'AGENTDB_MODULES': MODULES_PATH}
                self._proc = await asyncio.create_subprocess_exec(
                    'node', str(BRIDGE_SCRIPT),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                )
                # Confirm the bridge is alive with a quick ping
                pong = await self._send_raw({'op': 'ping'}, timeout=10.0)
                if pong.get('ok'):
                    self._ready = True
                    self.logger.info(f"AgentDB bridge ready (pid={self._proc.pid})")
                else:
                    self.logger.warning("AgentDB bridge ping failed")
            except Exception as e:
                self.logger.warning(f"AgentDB bridge unavailable: {e}")

    async def _send_raw(self, payload: dict, timeout: float = 5.0) -> Dict[str, Any]:
        assert self._proc is not None
        line = json.dumps(payload) + '\n'
        self._proc.stdin.write(line.encode())
        await self._proc.stdin.drain()
        resp = await asyncio.wait_for(self._proc.stdout.readline(), timeout=timeout)
        return json.loads(resp.decode().strip() or '{}')

    async def call(self, **kwargs: Any) -> Dict[str, Any]:
        """Send a request to the bridge and return the response."""
        await self._ensure_started()
        if not self._ready:
            return {'error': 'bridge unavailable'}
        async with self._call_lock:
            try:
                return await self._send_raw(kwargs)
            except Exception as e:
                self.logger.warning(f"Bridge call {kwargs.get('op')} failed: {e}")
                self._ready = False   # force restart on next call
                return {'error': str(e)}

    async def shutdown(self) -> None:
        if self._proc:
            try:
                self._proc.stdin.close()
                await asyncio.wait_for(self._proc.wait(), timeout=3.0)
            except Exception:
                self._proc.kill()
        self._ready = False
        AgentDBBridge._instance = None


class TaskTrajectoryTracker:
    """Tracks task execution trajectories via the AgentDB bridge.

    Mirrors the agentic-jujutsu JjWrapper API:
      start()   → startTrajectory
      record()  → addToTrajectory / traj_step
      finish()  → finalizeTrajectory / traj_end
      recent()  → getRecentTrajectories
    """

    def __init__(self) -> None:
        self._total: int = 0
        self._successful: int = 0
        self.logger = logging.getLogger(__name__)

    async def start(self, description: str) -> int:
        """Start a new trajectory; returns trajectory id (-1 on failure)."""
        try:
            bridge = await AgentDBBridge.get()
            result = await bridge.call(op='traj_start', description=description)
            traj_id = int(result.get('id', -1))
            if traj_id >= 0:
                self._total += 1
            return traj_id
        except Exception as e:
            self.logger.debug(f"traj_start skipped: {e}")
            return -1

    async def record(self, traj_id: int) -> None:
        """Increment step count for an active trajectory."""
        if traj_id < 0:
            return
        try:
            bridge = await AgentDBBridge.get()
            await bridge.call(op='traj_step', id=traj_id)
        except Exception as e:
            self.logger.debug(f"traj_step skipped: {e}")

    async def finish(self, traj_id: int, success: bool, note: str = 'ok') -> None:
        """Finalize trajectory with outcome."""
        if traj_id < 0:
            return
        try:
            bridge = await AgentDBBridge.get()
            await bridge.call(op='traj_end', id=traj_id, success=success, note=note)
            if success:
                self._successful += 1
        except Exception as e:
            self.logger.debug(f"traj_end skipped: {e}")

    async def recent(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Return recent trajectories."""
        try:
            bridge = await AgentDBBridge.get()
            result = await bridge.call(op='traj_recent', limit=limit)
            return result.get('trajectories', [])
        except Exception:
            return []

    def get_stats(self) -> Dict[str, Any]:
        return {
            'jj_trajectories': self._total,
            'jj_successful':   self._successful,
            'jj_success_rate': (
                self._successful / self._total if self._total > 0 else 0.0
            ),
        }
