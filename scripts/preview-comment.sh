#!/usr/bin/env bash
# Posts the preview card on a pull request, or updates the one already there.
# Called by the `preview` job in .github/workflows/ci-cd.yml.
#
# Usage: scripts/preview-comment.sh deploying|success|failure
# Env:   GH_TOKEN, GH_REPO, PR_NUMBER, COMMIT_SHA, LOGS_URL,
#        PREVIEW_URL and DEPLOYMENT_URL (success only)
set -euo pipefail

case "${1:-}" in
  deploying) status="🔄 Deploying…" ;;
  success) status="✅ Deploy successful!" ;;
  failure) status="❌ Deploy failed" ;;
  *) echo "usage: $0 deploying|success|failure" >&2; exit 2 ;;
esac

row() { printf '<tr><td><strong>%s</strong></td><td>%s</td></tr>\n' "$1" "$2"; }

rows="$(row "Latest commit:" "<code>${COMMIT_SHA:0:7}</code>")"
rows+=$'\n'"$(row "Status:" "$status")"
if [ "$1" = success ]; then
  rows+=$'\n'"$(row "Preview URL:" "<a href=\"$PREVIEW_URL\">$PREVIEW_URL</a>")"
  rows+=$'\n'"$(row "This deploy:" "<a href=\"$DEPLOYMENT_URL\">$DEPLOYMENT_URL</a>")"
fi

body="## Deploying fakka with ⚡ Cloudflare Workers Previews

<table>
$rows
</table>

[View logs]($LOGS_URL)"

# --edit-last edits this bot's latest comment, so each PR keeps one card.
gh pr comment "$PR_NUMBER" --edit-last --create-if-none --body "$body"
