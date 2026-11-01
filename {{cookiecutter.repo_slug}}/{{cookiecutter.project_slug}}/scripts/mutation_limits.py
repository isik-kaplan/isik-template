"""Tell a mutant that cannot finish apart from a machine too busy to wait for it.

mutmut ends a child with SIGXCPU both when its wall clock runs out and when the kernel's `RLIMIT_CPU`
is spent, and its wall is half the CPU budget, so every `-24` was the wall. This moves the wall past
the budget and has it send SIGTERM: `-24` then means the mutant never ends, and `-15` a busy machine.
"""

import signal
from time import process_time

from mutmut import __main__ as mutmut_main
from mutmut.threading import timeout as timeout_module


# mutmut sends SIGKILL one second after the soft CPU limit, so the wall must clear the budget by more.
WALL_GRACE = 30


class _WallClockSignal:
    """What mutmut's checker thread reads `SIGXCPU` from; it uses `signal` for nothing else."""

    SIGXCPU = signal.SIGTERM


def wall_limit(seconds):
    """The child's CPU budget is twice mutmut's wall plus what the parent had spent when it forked."""
    return seconds * 2 + process_time() + WALL_GRACE


def install():
    """Safe to call twice."""
    timeout_module.signal = _WallClockSignal
    mutmut_main.register_timeout = _registrar(mutmut_main.register_timeout)


def _registrar(register):
    original = getattr(register, "unpatched", register)

    def register_timeout(pid, timeout_s):
        return original(pid=pid, timeout_s=wall_limit(timeout_s))

    register_timeout.unpatched = original
    return register_timeout
