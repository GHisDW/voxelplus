```python
import os
import json
import requests

# ============================================================
# CONFIG
# ============================================================

REPO = "GHisDW/voxelplus"
WEBHOOK_URL = os.environ["DISCORD_WEBHOOK_URL"]
EVENT_PATH = os.environ.get("GITHUB_EVENT_PATH")

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


# ============================================================
# GITHUB
# ============================================================

def get_issue_from_event():
    """Get the issue that triggered this GitHub Action."""

    if not EVENT_PATH:
        return None

    with open(EVENT_PATH, "r", encoding="utf-8") as file:
        event = json.load(file)

    return event.get("issue")


# ============================================================
# DISCORD FORMATTING
# ============================================================

def make_label_line(issue):
    """Turn GitHub labels into a neat emoji line."""

    labels = []

    for label in issue.get("labels", []):
        name = label["name"].strip()
        emoji = LABEL_EMOJIS.get(name.lower(), "🏷️")

        labels.append(f"{emoji} {name}")

    if not labels:
        return "🏷️ No labels"

    return "🏷️ " + " · ".join(labels)


def make_post(issue):
    """Build the Discord Forum post."""

    number = issue["number"]
    title = issue["title"]
    body = issue.get("body") or "_No description provided._"
    author = issue["user"]["login"]
    url = issue["html_url"]
    state = issue["state"]

    label_line = make_label_line(issue)

    status = "🟢 Open" if state == "open" else "🔴 Closed"

    content = (
        f"{label_line}\n\n"
        f"**📝 Description**\n"
        f"{body}\n\n"
        f"**👤 Opened by**\n"
        f"{author}\n\n"
        f"**📊 Status**\n"
        f"{status}\n\n"
        f"**🔗 GitHub Issue #{number}**\n"
        f"{url}"
    )

    return title, content


# ============================================================
# DISCORD
# ============================================================

def create_forum_post(issue):
    """Create one Discord Forum post."""

    title, content = make_post(issue)

    payload = {
        "thread_name": title,
        "content": content,
    }

    response = requests.post(
        WEBHOOK_URL,
        params={"wait": "true"},
        json=payload,
        timeout=30,
    )

    if response.ok:
        print(
            f"✅ Created Discord post for "
            f"GitHub issue #{issue['number']}: {title}"
        )
    else:
        print(
            f"❌ Discord returned {response.status_code}"
        )
        print(response.text)

    response.raise_for_status()


# ============================================================
# MAIN
# ============================================================

def main():

    print("======================================")
    print(" GitHub → Discord Issue Sync")
    print("======================================")

    issue = get_issue_from_event()

    if not issue:
        print("No issue event found.")
        print("This workflow should be triggered by a GitHub issue.")
        return

    # Ignore pull requests.
    if "pull_request" in issue:
        print("This is a pull request. Ignoring.")
        return

    print(
        f"Processing GitHub issue "
        f"#{issue['number']}: {issue['title']}"
    )

    create_forum_post(issue)

    print("Done!")


if __name__ == "__main__":
    main()
```
