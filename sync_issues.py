
import os
import json
import requests


WEBHOOK_URL = os.environ["DISCORD_WEBHOOK_URL"]
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
GITHUB_REPOSITORY = os.environ["GITHUB_REPOSITORY"]

POSTS_FILE = "discord_posts.json"

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


def load_posts():
    if not os.path.exists(POSTS_FILE):
        return []

    try:
        with open(POSTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_posts(posts):
    with open(POSTS_FILE, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2)


def get_open_issues():
    url = (
        f"https://api.github.com/repos/"
        f"{GITHUB_REPOSITORY}/issues"
    )

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    issues = []
    page = 1

    while True:
        response = requests.get(
            url,
            headers=headers,
            params={
                "state": "open",
                "per_page": 100,
                "page": page,
            },
            timeout=30,
        )

        response.raise_for_status()

        batch = response.json()

        if not batch:
            break

        for issue in batch:
            # Ignore pull requests.
            if "pull_request" not in issue:
                issues.append(issue)

        page += 1

    return issues


def make_labels(labels):
    if not labels:
        return "🏷️ **Labels:** None"

    result = []

    for label in labels:
        name = label.get("name", "unknown")
        emoji = LABEL_EMOJIS.get(
            name.lower(),
            "🏷️",
        )
        result.append(f"{emoji} {name}")

    return "🏷️ **Labels:** " + " · ".join(result)


def make_content(issue):
    body = issue.get("body") or "No description provided."

    # Keep the Discord message below 2000 characters.
    if len(body) > 1400:
        body = (
            body[:1400]
            + "\n\n…Description truncated."
        )

    return (
        f"{make_labels(issue.get('labels', []))}\n\n"
        f"📝 **Description**\n"
        f"{body}\n\n"
        f"👤 **Opened by:** "
        f"{issue.get('user', {}).get('login', 'Unknown')}\n"
        f"📊 **Status:** 🟢 Open\n\n"
        f"🔗 **GitHub Issue #{issue['number']}**\n"
        f"{issue.get('html_url', '')}"
    )[:2000]


def delete_post(thread_id):
    """
    Delete one Forum post using the webhook that created it.
    """

    url = (
        WEBHOOK_URL.rstrip("/")
        + f"?thread_id={thread_id}"
    )

    response = requests.delete(
        url,
        timeout=30,
    )

    # Already gone = that's fine.
    if response.status_code == 404:
        print(f"Already deleted: {thread_id}")
        return

    response.raise_for_status()

    print(f"Deleted: {thread_id}")


def delete_old_posts():
    posts = load_posts()

    if not posts:
        print("No old Discord posts.")
        return

    print(f"Deleting {len(posts)} old Discord posts...")

    for thread_id in posts:
        try:
            delete_post(thread_id)
        except Exception as error:
            print(
                f"Could not delete {thread_id}: {error}"
            )

    save_posts([])


def create_post(issue):
    title = issue.get("title") or "GitHub Issue"

    # Discord Forum post name limit.
    title = title[:100]

    url = (
        WEBHOOK_URL.rstrip("/")
        + "?wait=true"
    )

    response = requests.post(
        url,
        json={
            "thread_name": title,
            "content": make_content(issue),
        },
        timeout=30,
    )

    if not response.ok:
        print("Discord error:")
        print(response.text)

    response.raise_for_status()

    data = response.json()

    thread_id = data.get("channel_id")

    if not thread_id:
        raise RuntimeError(
            "Discord did not return a Forum post ID."
        )

    print(
        f"Created Issue #{issue['number']} "
        f"→ {thread_id}"
    )

    return thread_id


def sync():
    print("================================")
    print("STARTING DISCORD SYNC")
    print("================================")

    # 1. Delete previous posts.
    delete_old_posts()

    # 2. Get current OPEN GitHub issues.
    issues = get_open_issues()

    print(
        f"Found {len(issues)} open GitHub issues."
    )

    # 3. Create fresh Discord posts.
    new_posts = []

    for issue in issues:
        try:
            thread_id = create_post(issue)
            new_posts.append(thread_id)

        except Exception as error:
            print(
                f"Failed Issue #{issue['number']}: "
                f"{error}"
            )

    # 4. Remember the new post IDs.
    save_posts(new_posts)

    print("================================")
    print("SYNC COMPLETE")
    print(f"Created: {len(new_posts)}")
    print("================================")


if __name__ == "__main__":
    sync()

