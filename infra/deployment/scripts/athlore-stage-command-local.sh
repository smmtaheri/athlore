#!/usr/bin/env bash
# Laptop-side entrypoint for the remote, isolated Athlore stage environment.
set -euo pipefail

ROOT="${ATHLORE_LOCAL_ROOT:-$HOME/Desktop/Tasks/Nobitex/athlore}"
SSH_HOST="${ATHLORE_STAGE_SSH_HOST:-athlore}"
REMOTE_ROOT="${ATHLORE_STAGE_REMOTE_ROOT:-/root/athlore-stage}"
ACTION="${1:-}"

usage() {
  cat <<'USAGE'
Usage:
  deploy-stage-athlore [--help]
  stage-up-athlore [--build]
  stage-down-athlore
  stage-status-athlore
  stage-build-athlore

All commands operate on the remote isolated stage checkout over SSH.
Configuration overrides: ATHLORE_LOCAL_ROOT, ATHLORE_STAGE_SSH_HOST,
ATHLORE_STAGE_REMOTE_ROOT.
USAGE
}

if [[ "$ACTION" == "--help" || "$ACTION" == "-h" ]]; then
  usage
  exit 0
fi

case "$ACTION" in
  deploy)
    if [[ "$#" -gt 1 ]]; then
      usage >&2
      exit 2
    fi
    ;;
  up)
    if [[ "$#" -gt 2 || ( "$#" -eq 2 && "$2" != "--build" ) ]]; then
      usage >&2
      exit 2
    fi
    ;;
  down|status|build)
    if [[ "$#" -gt 1 ]]; then
      usage >&2
      exit 2
    fi
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [[ ! -d "$ROOT/.git" ]]; then
  echo "ERROR: Athlore checkout not found: $ROOT" >&2
  echo "Set ATHLORE_LOCAL_ROOT to your Athlore checkout root." >&2
  exit 1
fi

_push_stage_branch_if_needed() {
  local branch upstream ahead behind short

  if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=all)" ]]; then
    echo "ERROR: Athlore has uncommitted changes. Commit (or stash) before deploy-stage-athlore." >&2
    echo "  path: $ROOT" >&2
    git -C "$ROOT" status -sb >&2
    exit 1
  fi

  branch="$(git -C "$ROOT" branch --show-current)"
  if [[ "$branch" != "stage" ]]; then
    echo "ERROR: deploy-stage-athlore only deploys the local stage branch (current: ${branch:-detached HEAD})." >&2
    exit 1
  fi
  short="$(git -C "$ROOT" rev-parse --short HEAD)"

  if upstream="$(git -C "$ROOT" rev-parse --abbrev-ref '@{u}' 2>/dev/null)"; then
    if [[ "$upstream" != "origin/stage" ]]; then
      echo "ERROR: local stage branch tracks '$upstream', expected 'origin/stage'." >&2
      exit 1
    fi
    echo "==> Checking origin/stage before deployment"
    git -C "$ROOT" fetch origin stage
    ahead="$(git -C "$ROOT" rev-list --count '@{u}..HEAD')"
    behind="$(git -C "$ROOT" rev-list --count "HEAD..@{u}")"
    if [[ "$behind" != "0" ]]; then
      echo "ERROR: local stage is behind origin/stage by $behind commit(s). Fast-forward it, review, then retry." >&2
      exit 1
    fi
    if [[ "$ahead" == "0" ]]; then
      echo "==> athlore stage: nothing to push ($short = $upstream)"
    else
      echo "==> Pushing athlore stage: $ahead local commit(s) -> origin/stage"
      git -C "$ROOT" push origin HEAD:refs/heads/stage
    fi
  else
    echo "==> Pushing athlore stage and setting upstream: origin/stage"
    git -C "$ROOT" push -u origin HEAD:refs/heads/stage
  fi
}

if [[ "$ACTION" == "deploy" ]]; then
  REPO_URL="$(git -C "$ROOT" remote get-url origin)"
  echo "==> deploy-stage-athlore: publish stage if needed, then deploy the isolated stage stack"
  _push_stage_branch_if_needed

  printf -v REMOTE_COMMAND 'bash -s -- %q %q' "$REMOTE_ROOT" "$REPO_URL"
  ssh "$SSH_HOST" "$REMOTE_COMMAND" <<'REMOTE_DEPLOY'
set -euo pipefail
remote_root="$1"
repo_url="$2"

if [[ ! -e "$remote_root" ]]; then
  echo "==> Creating the separate stage checkout at $remote_root"
  mkdir -p "$(dirname "$remote_root")"
  git clone --branch stage --single-branch "$repo_url" "$remote_root"
elif [[ ! -d "$remote_root/.git" ]]; then
  echo "ERROR: stage target exists but is not a Git checkout: $remote_root" >&2
  exit 1
fi

checkout_root="$(git -C "$remote_root" rev-parse --show-toplevel)"
requested_root="$(cd "$remote_root" && pwd -P)"
if [[ "$checkout_root" != "$requested_root" ]]; then
  echo "ERROR: stage target resolves to a different Git checkout: $checkout_root" >&2
  exit 1
fi
if [[ "$(git -C "$remote_root" branch --show-current)" != "stage" ]]; then
  echo "ERROR: remote stage checkout is not on the stage branch: $remote_root" >&2
  exit 1
fi

echo "==> Updating and building the isolated remote stage stack"
exec bash "$remote_root/infra/deployment/scripts/stage-deploy.sh"
REMOTE_DEPLOY
  echo "==> deploy-stage-athlore finished"
  exit 0
fi

REMOTE_SCRIPT="stage-${ACTION}.sh"
REMOTE_ARGS=()
if [[ "$ACTION" == "up" && "$#" -eq 2 ]]; then
  REMOTE_ARGS+=("$2")
fi

printf -v REMOTE_COMMAND 'bash -s -- %q %q' "$REMOTE_ROOT" "$REMOTE_SCRIPT"
for arg in "${REMOTE_ARGS[@]}"; do
  printf -v escaped_arg '%q' "$arg"
  REMOTE_COMMAND+=" $escaped_arg"
done

ssh "$SSH_HOST" "$REMOTE_COMMAND" <<'REMOTE_COMMAND_BODY'
set -euo pipefail
remote_root="$1"
script_name="$2"
shift 2
case "$script_name" in
  stage-up.sh|stage-down.sh|stage-status.sh|stage-build.sh) ;;
  *) echo "ERROR: invalid stage command." >&2; exit 2 ;;
esac
exec bash "$remote_root/infra/deployment/scripts/$script_name" "$@"
REMOTE_COMMAND_BODY
