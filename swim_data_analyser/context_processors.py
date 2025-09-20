import subprocess
from pathlib import Path

def git_version(request):
    """
    Returns two template variables:
        APP_VERSION – the most recent tag or short SHA if no tag
        GIT_COMMIT  – the short commit hash (7 chars)
    """
    base_dir = Path(__file__).resolve().parent.parent

    def _run_git(args):
        try:
            out = subprocess.check_output(
                ["git"] + args,
                cwd=base_dir,
                stderr=subprocess.DEVNULL,
            )
            return out.decode().strip()
        except Exception:
            return ""

    # Prefer a tag (e.g. v1.2.3); fall back to short SHAG
    version = _run_git(["describe", "--tags", "--always"])
    commit  = _run_git(["rev-parse", "--short", "HEAD"])

    return {
        "APP_VERSION": version,
        "GIT_COMMIT":  commit,
    }
