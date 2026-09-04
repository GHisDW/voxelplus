```python
import os
import json
import subprocess
import requests

REPO = "GHisDW/voxelplus"
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


# ------------------------------------------------------------
# Mapping file
# ------------------------------------------------------------

def load_mapping():
    if not os.path.exists(MAP_FILE):
        return {}

    with open(MAP_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_mapping(mapping):
    with open(MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2)


def save_mapping_to_git():
    subprocess.run(
        ["git", "config", "user.name", "github-actions[bot]"],
        check=True
    )

    subprocess.run(
        [
            "git",
            "config",
            "user.email",
            "41898282+github-actions[bot]@users.noreply.github.com"
        ],
        check=True
    )

    subprocess.run(
        ["git", "add", MAP_FILE],
        check=True
    )

    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"]
    )

    # Nothing changed.
    if result.returncode == 0:
        return

    subprocess.run(
        ["git", "commit", "-m", "Update Discord issue mapping"],
        check=True
    )

    subprocess.run(
        ["git", "push"],
        check=True
    )


# ------------------------------------------------------------
# Formatting
# ------------------------------------------------------------

def label_line(issue):
    labels = []

    for label in issue.get("labels", []):
        name = label["name"]
        emoji = LABEL_EMOJIS.get(name.lower(), "🏷️")
        labels.append(f"{emoji} {name}")

    if not labels:
        return "🏷️ No labels"

    return "🏷️ " + " · ".join(labels)


def make_content(issue):
    body = issue.get("body") or "_No description provided._"

    status = (
        "🟢 Open"
        if issue["state"] == "open"
        else "🔴 Closed"
    )

    return (
        f"{label_line(issue)}\n\n"
        f"**📝 Description**\n"
        f"{body}\n\n"
        f"**👤 Opened by**\n"
        f"{issue['user']['login']}\n\n"
        f"**📊 Status**\n"
        f"{status}\n\n"
        f"**🔗 GitHub Issue #{issue['number']}**\n"
        f"{issue['html_url']}"
    )


# ------------------------------------------------------------
# Discord
# ------------------------------------------------------------

def webhook_parts():
    """
    Discord webhook URL looks like:

    https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
    """

    parts = WEBHOOK_URL.rstrip("/").split("/")

    webhook_id = parts[-2]
    webhook_token = parts[-1]

    return webhook_id, webhook_token


def create_post(issue):
    payload = {
        "thread_name": issue["title"],
        "content": make_content(issue),
    }

    response = requests.post(
        WEBHOOK_URL,
        params={"wait": "true"},
        json=payload,
        timeout=30,
    )

    if not response.ok:
        print(response.text)

    response.raise_for_status()

    data = response.json()

    # Discord returns the created thread ID.
    thread_id = data.get("channel_id")

    if not thread_id:
        raise RuntimeError(
            "Discord did not return a channel_id for the new Forum post."
        )

    print(
        f"✅ Created Discord post for issue "
        f"#{issue['number']}"
    )

    return thread_id


def update_post(thread_id, issue):
    webhook_id, webhook_token = webhook_parts()

    url = (
        f"https://discord.com/api/webhooks/"
        f"{webhook_id}/{webhook_token}/messages/@original"
    )

    response = requests.patch(
        url,
        params={"thread_id": thread_id},
        json={
            "content": make_content(issue)
        },
        timeout=30,
    )

    if not response.ok:
        print(
            f"Discord update failed: "
            f"{response.status_code}"
        )
        print(response.text)

    response.raise_for_status()

    print(
        f"✅ Updated Discord post for issue "
        f"#{issue['number']}"
    )


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------

def main():

    with open(EVENT_PATH, "r", encoding="utf-8") as f:
        event = json.load(f)

    issue = event.get("issue")

    if not issue:
        print("No issue in this GitHub event.")
        return

    # Ignore pull requests.
    if "pull_request" in issue:
        print("Pull request detected. Ignoring.")
        return

    issue_number = str(issue["number"])
    action = event.get("action")

    print(
        f"GitHub issue #{issue_number}: "
        f"action={action}"
    )

    mapping = load_mapping()

    # --------------------------------------------------------
    # New issue
    # --------------------------------------------------------

    if action == "opened":

        if issue_number in mapping:
            print(
                "Discord post already exists. "
                "Nothing to do."
            )
            return

        thread_id = create_post(issue)

        mapping[issue_number] = {
            "thread_id": thread_id,
            "issue_url": issue["html_url"],
        }

        save_mapping(mapping)
        save_mapping_to_git()

        return

    # --------------------------------------------------------
    # Existing issue changed
    # --------------------------------------------------------

    if issue_number not in mapping:
        print(
            "⚠️ This issue does not have a Discord post "
            "registered yet."
        )
        print(
            "No new post will be created automatically "
            "to avoid duplicates."
        )
        return

    thread_id = mapping[issue_number]["thread_id"]

    update_post(thread_id, issue)


if __name__ == "__main__":
    main()
```
