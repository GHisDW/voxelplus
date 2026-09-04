import os
import json
import re
import requests

WEBHOOK_URL = os.environ["DISCORD_WEBHOOK_URL"]
EVENT_PATH = os.environ["GITHUB_EVENT_PATH"]
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
GITHUB_REPOSITORY = os.environ["GITHUB_REPOSITORY"]

MAP_FILE = "discord_issue_map.json"

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
            return json.load(f)
    except Exception:
        return {}


def save_map(data):
    with open(MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


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
    author = issue.get("user", {}).get("login", "Unknown")
    number = issue.get("number")
    url = issue.get("html_url")
    state = issue.get("state", "open")

    status = "🟢 Open" if state == "open" else "🔴 Closed"

    return (
        f"{make_labels(issue.get('labels', []))}\n\n"
        f"📝 **Description**\n"
        f"{body}\n\n"
        f"👤 **Opened by:** {author}\n"
        f"📊 **Status:** {status}\n\n"
        f"🔗 **GitHub Issue #{number}**\n"
        f"{url}"
    )


def create_post(issue):
    response = requests.post(
        WEBHOOK_URL + "?wait=true",
        json={
            "thread_name": issue.get("title", "GitHub Issue"),
            "content": make_content(issue),
        },
        timeout=30,
    )

    response.raise_for_status()

    message = response.json()
    thread_id = message.get("channel_id")

    if not thread_id:
        raise RuntimeError("Discord did not return a Forum post ID.")

    print(f"Created Discord post for Issue #{issue['number']}: {thread_id}")

    return thread_id


def webhook_parts():
    match = re.match(
        r"https://discord(?:app)?\.com/api/webhooks/(\d+)/([^/?]+)",
        WEBHOOK_URL,
    )

    if not match:
        raise RuntimeError("Invalid Discord webhook URL.")

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
            "content": make_content(issue)
        },
        timeout=30,
    )

    response.raise_for_status()

    print(f"Updated Discord post for Issue #{issue['number']}")


def get_all_issues():
    url = f"https://api.github.com/repos/{GITHUB_REPOSITORY}/issues"

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


def save_to_git():
    os.system(
        "git config user.name 'github-actions[bot]'"
    )

    os.system(
        "git config user.email "
        "'41898282+github-actions[bot]@users.noreply.github.com'"
    )

    os.system(
        f"git add {MAP_FILE}"
    )

    if os.system("git diff --cached --quiet") != 0:
        os.system(
            "git commit -m 'Update Discord issue mapping'"
        )
        os.system("git push")


def main():
    event = get_event()

    # Manual Run button = sync EVERYTHING.
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
