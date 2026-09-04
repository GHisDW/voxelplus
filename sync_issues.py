
import os
import json
import re
import subprocess

import requests


WEBHOOK_URL = os.environ["DISCORD_WEBHOOK_URL"]
EVENT_PATH = os.environ["GITHUB_EVENT_PATH"]
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
GITHUB_REPOSITORY = os.environ["GITHUB_REPOSITORY"]

MAP_FILE = "discord_issue_map.json"

DISCORD_MAX_MESSAGE_LENGTH = 2000
MAX_DESCRIPTION_LENGTH = 1400


LABEL_EMOJIS = {
    "accessibility": "♿",
    "bug": "🐛",
    "diagnostic": "🔎",
    "documentation": "📚",
    "duplicate": "📋",
    "enhancement": "✨",
    "error-handling": "⚠️",
    "good first issue": "🌱",
    "help wanted": "🙋",
    "invalid": "🚫",
    "logging": "📝",
    "question": "❓",
    "ui": "🎨",
    "wontfix": "🔒",
}


def load_map():
    if not os.path.exists(MAP_FILE):
        return {}

    try:
        with open(MAP_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            return {}

        return data

    except (json.JSONDecodeError, OSError):
        return {}


def save_map(data):
    with open(MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_event():
    with open(EVENT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def make_labels(labels):
    if not labels:
        return "🏷️ **Labels:** None"

    result = []

    for label in labels:
        name = label.get("name", "unknown")
        emoji = LABEL_EMOJIS.get(name.lower(), "🏷️")
        result.append(f"{emoji} {name}")

    return "🏷️ **Labels:** " + " · ".join(result)


def make_content(issue):
    body = issue.get("body") or "No description provided."

    # Discord message content has a 2000-character limit.
    if len(body) > MAX_DESCRIPTION_LENGTH:
        body = (
            body[:MAX_DESCRIPTION_LENGTH]
            + "\n\n…Description truncated. "
            + "See the GitHub issue for the full description."
        )

    author = issue.get("user", {}).get("login", "Unknown")
    number = issue.get("number", "Unknown")
    url = issue.get("html_url", "")
    state = issue.get("state", "open")

    status = "🟢 Open" if state == "open" else "🔴 Closed"

    content = (
        f"{make_labels(issue.get('labels', []))}\n\n"
        f"📝 **Description**\n"
        f"{body}\n\n"
        f"👤 **Opened by:** {author}\n"
        f"📊 **Status:** {status}\n\n"
        f"🔗 **GitHub Issue #{number}**\n"
        f"{url}"
    )

    # Final safety check.
    if len(content) > DISCORD_MAX_MESSAGE_LENGTH:
        content = content[: DISCORD_MAX_MESSAGE_LENGTH - 3] + "..."

    return content


def print_discord_error(response):
    print("================================")
    print("DISCORD REQUEST FAILED")
    print("================================")
    print(f"HTTP status: {response.status_code}")
    print(f"Response: {response.text}")
    print("================================")


def create_post(issue):
    title = issue.get("title") or "GitHub Issue"

    # Discord forum thread names have a maximum length.
    title = title[:100]

    url = WEBHOOK_URL.rstrip("/") + "?wait=true"

    payload = {
        "thread_name": title,
        "content": make_content(issue),
    }

    response = requests.post(
        url,
        json=payload,
        timeout=30,
    )

    if not response.ok:
        print_discord_error(response)

    response.raise_for_status()

    try:
        message = response.json()
    except ValueError:
        raise RuntimeError(
            "Discord returned a non-JSON response."
        )

    thread_id = message.get("channel_id")

    if not thread_id:
        raise RuntimeError(
            "Discord did not return a Forum post ID. "
            f"Response was: {message}"
        )

    print(
        f"Created Discord post for Issue "
        f"#{issue['number']}: {thread_id}"
    )

    return thread_id


def webhook_parts():
    match = re.match(
        r"^https://discord(?:app)?\.com/api/webhooks/(\d+)/([^/?]+)",
        WEBHOOK_URL,
    )

    if not match:
        raise RuntimeError(
            "Invalid Discord webhook URL. "
            "Check the DISCORD_WEBHOOK_URL secret."
        )

    return match.group(1), match.group(2)


def update_post(thread_id, issue):
    webhook_id, webhook_token = webhook_parts()

    url = (
        f"https://discord.com/api/webhooks/"
        f"{webhook_id}/{webhook_token}/messages/@original"
        f"?thread_id={thread_id}"
    )

    response = requests.patch(
        url,
        json={
            "content": make_content(issue),
        },
        timeout=30,
    )

    if not response.ok:
        print_discord_error(response)

    response.raise_for_status()

    print(
        f"Updated Discord post for Issue #{issue['number']}"
    )


def get_all_issues():
    url = (
        f"https://api.github.com/repos/"
        f"{GITHUB_REPOSITORY}/issues"
    )

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    all_issues = []
    page = 1

    while True:
        response = requests.get(
            url,
            headers=headers,
            params={
                "state": "all",
                "per_page": 100,
                "page": page,
            },
            timeout=30,
        )

        response.raise_for_status()

        issues = response.json()

        if not issues:
            break

        for issue in issues:
            # GitHub's Issues API also returns pull requests.
            if "pull_request" not in issue:
                all_issues.append(issue)

        page += 1

    return all_issues


def sync_all():
    print("================================")
    print("FULL DISCORD SYNC")
    print("================================")

    issues = get_all_issues()

    print(f"Found {len(issues)} GitHub issues.")

    mapping = load_map()

    created = 0
    updated = 0
    failed = 0

    for issue in issues:
        number = str(issue["number"])

        try:
            if number in mapping:
                thread_id = mapping[number]["thread_id"]

                update_post(
                    thread_id,
                    issue,
                )

                updated += 1

            else:
                thread_id = create_post(issue)

                mapping[number] = {
                    "thread_id": thread_id,
                    "issue_url": issue.get("html_url"),
                }

                save_map(mapping)
                created += 1

        except Exception as error:
            print(
                f"FAILED Issue #{number}: {error}"
            )
            failed += 1

    save_map(mapping)

    print("================================")
    print("SYNC FINISHED")
    print(f"Created: {created}")
    print(f"Updated: {updated}")
    print(f"Failed: {failed}")
    print("================================")


def sync_event(issue):
    mapping = load_map()
    number = str(issue["number"])

    if number in mapping:
        update_post(
            mapping[number]["thread_id"],
            issue,
        )

    else:
        thread_id = create_post(issue)

        mapping[number] = {
            "thread_id": thread_id,
            "issue_url": issue.get("html_url"),
        }

        save_map(mapping)


def run_git_command(*args):
    result = subprocess.run(
        args,
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(
            f"Git command failed: {' '.join(args)}"
        )

        if result.stdout:
            print(result.stdout)

        if result.stderr:
            print(result.stderr)

    return result.returncode


def save_to_git():
    run_git_command(
        "git",
        "config",
        "user.name",
        "github-actions[bot]",
    )

    run_git_command(
        "git",
        "config",
        "user.email",
        "41898282+github-actions[bot]@users.noreply.github.com",
    )

    if run_git_command(
        "git",
        "add",
        MAP_FILE,
    ) != 0:
        return

    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        check=False,
    )

    # Exit code 0 means there are no staged changes.
    if result.returncode == 0:
        print("No mapping changes to commit.")
        return

    if run_git_command(
        "git",
        "commit",
        "-m",
        "Update Discord issue mapping",
    ) != 0:
        return

    run_git_command(
        "git",
        "push",
    )


def main():
    event = get_event()

    # Manual workflow run = sync everything.
    if "issue" not in event:
        print("Manual workflow run detected.")

        sync_all()
        save_to_git()

        return

    # GitHub issue event = sync that issue.
    issue = event["issue"]

    print(
        f"Automatic issue event: #{issue['number']}"
    )

    sync_event(issue)
    save_to_git()


if __name__ == "__main__":
    main()

