import os
import json
import re
import requests

WEBHOOK_URL = os.environ["DISCORD_WEBHOOK_URL"]
EVENT_PATH = os.environ["GITHUB_EVENT_PATH"]

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
    except (json.JSONDecodeError, OSError):
        return {}


def save_map(issue_map):
    with open(MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(issue_map, f, indent=2)


def get_issue_from_event():
    with open(EVENT_PATH, "r", encoding="utf-8") as f:
        event = json.load(f)

    issue = event.get("issue")

    if not issue:
        raise RuntimeError("No issue data found in GitHub event.")

    return issue, event.get("action")


def label_line(labels):
    names = [label["name"] for label in labels]

    if not names:
        return "🏷️ Labels: None"

    formatted = []

    for name in names:
        emoji = LABEL_EMOJIS.get(name.lower(), "🏷️")
        formatted.append(f"{emoji} {name}")

    return "🏷️ " + " · ".join(formatted)


def make_content(issue):
    title = issue.get("title", "Untitled issue")
    body = issue.get("body") or "No description provided."
    author = issue.get("user", {}).get("login", "Unknown")
    number = issue.get("number")
    url = issue.get("html_url")

    state = issue.get("state", "open")

    if state == "open":
        status = "🟢 Open"
    else:
        status = "🔴 Closed"

    labels = issue.get("labels", [])

    return (
        f"{label_line(labels)}\n\n"
        f"📝 **Description**\n"
        f"{body}\n\n"
        f"👤 **Opened by:** {author}\n"
        f"📊 **Status:** {status}\n\n"
        f"🔗 **GitHub Issue #{number}**\n"
        f"{url}"
    )


def create_post(issue):
    content = make_content(issue)

    payload = {
        "thread_name": issue.get("title", "GitHub Issue"),
        "content": content,
    }

    response = requests.post(
        WEBHOOK_URL + "?wait=true",
        json=payload,
        timeout=30,
    )

    response.raise_for_status()

    message = response.json()

    thread_id = message.get("channel_id")

    if not thread_id:
        raise RuntimeError("Discord did not return a Forum post/thread ID.")

    print(f"Created Discord post: {thread_id}")

    return thread_id


def get_webhook_parts():
    match = re.match(
        r"https://discord(?:app)?\.com/api/webhooks/(\d+)/([^/?]+)",
        WEBHOOK_URL,
    )

    if not match:
        raise RuntimeError("Invalid Discord webhook URL.")

    return match.group(1), match.group(2)


def update_post(thread_id, issue):
    webhook_id, webhook_token = get_webhook_parts()

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

    response.raise_for_status()

    print(f"Updated Discord post: {thread_id}")


def save_to_git():
    os.system("git config user.name 'github-actions[bot]'")
    os.system(
        "git config user.email "
        "'41898282+github-actions[bot]@users.noreply.github.com'"
    )

    os.system(f"git add {MAP_FILE}")

    result = os.system(
        "git diff --cached --quiet"
    )

    if result != 0:
        os.system(
            "git commit -m 'Update Discord issue mapping'"
        )
        os.system("git push")


def main():
    issue, action = get_issue_from_event()

    issue_number = str(issue["number"])

    issue_map = load_map()

    print(f"GitHub issue #{issue_number}")
    print(f"Action: {action}")

    # New issue → create Discord Forum post
    if action == "opened":
        if issue_number in issue_map:
            print(
                f"Issue #{issue_number} already has a Discord post. "
                "Skipping duplicate."
            )
            return

        thread_id = create_post(issue)

        issue_map[issue_number] = {
            "thread_id": thread_id,
            "issue_url": issue.get("html_url"),
        }

        save_map(issue_map)
        save_to_git()

        return

    # Existing issue → update Discord Forum post
    if issue_number not in issue_map:
        print(
            f"No Discord post mapping found for issue #{issue_number}. "
            "Skipping update."
        )
        return

    thread_id = issue_map[issue_number]["thread_id"]

    update_post(thread_id, issue)


if __name__ == "__main__":
    main()
