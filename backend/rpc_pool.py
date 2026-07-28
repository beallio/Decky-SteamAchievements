"""Daemon-thread work pool for RPC offload.

Decky Loader stops a plugin by raising SystemExit inside its sandboxed
process. concurrent.futures.ThreadPoolExecutor uses non-daemon workers and an
atexit hook that joins them, so one in-flight RPC (a release fetch, a
multi-second ludusavi subprocess) keeps the dying process alive after unload —
long enough to overlap the replacement process during a plugin update.

DaemonThreadPool is a minimal Executor whose workers are daemon threads and
are never joined at interpreter exit: when the main thread finishes, the
process exits immediately and abandoned work dies with it. Persisted state
stays safe because all persistence writes are atomic temp+rename.
"""

from __future__ import annotations

import functools
import queue
import threading
from collections.abc import Callable
from concurrent.futures import Executor, Future
from typing import Any, ParamSpec, TypeVar

_P = ParamSpec("_P")
_T = TypeVar("_T")


class _WorkItem:
    __slots__ = ("future", "fn")

    def __init__(self, future: Future[Any], fn: Callable[[], Any]) -> None:
        self.future = future
        self.fn = fn


class DaemonThreadPool(Executor):
    """Executor-compatible pool backed by daemon threads.

    Returns real concurrent.futures.Future objects, so it works directly with
    asyncio's loop.run_in_executor. shutdown(wait=False, cancel_futures=True)
    cancels queued work and lets running callbacks finish in the background;
    they cannot block interpreter exit.
    """

    def __init__(self, max_workers: int = 4, thread_name_prefix: str = "daemon-pool") -> None:
        if max_workers < 1:
            raise ValueError("max_workers must be at least 1")
        self._max_workers = max_workers
        self._thread_name_prefix = thread_name_prefix
        self._work_queue: queue.SimpleQueue[_WorkItem | None] = queue.SimpleQueue()
        self._threads: list[threading.Thread] = []
        self._spawned = 0
        self._lock = threading.Lock()
        self._is_shutdown = False

    def submit(self, fn: Callable[_P, _T], /, *args: _P.args, **kwargs: _P.kwargs) -> Future[_T]:
        future: Future[_T] = Future()
        with self._lock:
            if self._is_shutdown:
                raise RuntimeError("cannot schedule new futures after shutdown")
            self._work_queue.put(_WorkItem(future, functools.partial(fn, *args, **kwargs)))
            self._spawn_worker_locked()
        return future

    def shutdown(self, wait: bool = True, *, cancel_futures: bool = False) -> None:
        with self._lock:
            self._is_shutdown = True
            threads = list(self._threads)

        if cancel_futures:
            while True:
                try:
                    item = self._work_queue.get_nowait()
                except queue.Empty:
                    break
                if item is not None:
                    item.future.cancel()

        for _ in threads:
            self._work_queue.put(None)

        if wait:
            for thread in threads:
                thread.join()

    def _spawn_worker_locked(self) -> None:
        self._threads = [thread for thread in self._threads if thread.is_alive()]
        if len(self._threads) >= self._max_workers:
            return
        name = f"{self._thread_name_prefix}_{self._spawned}"
        self._spawned += 1
        thread = threading.Thread(target=self._worker, name=name, daemon=True)
        self._threads.append(thread)
        thread.start()

    def _worker(self) -> None:
        while True:
            item = self._work_queue.get()
            if item is None:
                return
            if not item.future.set_running_or_notify_cancel():
                continue
            try:
                result = item.fn()
            # Intentionally broad: every outcome must be delivered via the future
            except BaseException as exc:  # noqa: BLE001
                item.future.set_exception(exc)
            else:
                item.future.set_result(result)
