
import os
import json
import re
import requests


# ============================================================
# CONFIG
# ============================================================

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


# ============================================================
# MAPPING FILE
# ============================================================

def load_map():
    """
    The mapping file now stores ONLY Discord post IDs.

    Example:

    {
        "thread_ids": [
            "123456789",
            "987654321"
        ]
    }
    """

    if not os.path.exists(MAP_FILE):
        return []

    try:
        with open(MAP_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict):
            thread_ids = data.get("thread_ids", [])

            if isinstance(thread_ids, list):
                return thread_ids

        # Also support an old format temporarily.
        if isinstance(data, dict):
            ids = []

            for value in data.values():
                if isinstance(value, dict):
                    thread_id = value.get("thread_id")

                    if thread_id:
                        ids.append(thread_id)

            return ids

        return []

    except (json.JSONDecodeError, OSError):
        return []


def save_map(thread_ids):
    """
    Save only the Discord post IDs.
    """

    with open(MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(
            {
                "thread_ids": thread_ids
            },
            f,
            indent=2,
        )


# ============================================================
# GITHUB
# ============================================================

def get_event():
    with open(EVENT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_open_issues():
    """
    Get every OPEN GitHub issue.

    Pull requests are ignored because GitHub's Issues API
    also returns pull requests.
    """

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
                "state": "open",
                "per_page": 100,
                "page": page,
            },
            timeout=30,
        )

        if not response.ok:
            print("GitHub API request failed.")
            print("Status:", response.status_code)
            print("Response:", response.text)

        response.raise_for_status()

        issues = response.json()

        if not issues:
            break

        for issue in issues:
            # GitHub's Issues API also includes pull requests.
            if "pull_request" not in issue:
                all_issues.append(issue)

        page += 1

    return all_issues


# ============================================================
# CONTENT
# ============================================================

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

        result.append(
            f"{emoji} {name}"
        )

    return (
        "🏷️ **Labels:** "
        + " · ".join(result)
    )


def make_content(issue):
    body = (
        issue.get("body")
        or "No description provided."
    )

    # Keep enough room for the rest of the message.
    if len(body) > MAX_DESCRIPTION_LENGTH:
        body = (
            body[:MAX_DESCRIPTION_LENGTH]
            + "\n\n"
            "…Description truncated. "
            "See the GitHub issue for the full description."
        )

    author = (
        issue.get("user", {})
        .get("login", "Unknown")
    )

    number = issue.get(
        "number",
        "Unknown",
    )

    url = issue.get(
        "html_url",
        "",
    )

    content = (
        f"{make_labels(issue.get('labels', []))}\n\n"
        f"📝 **Description**\n"
        f"{body}\n\n"
        f"👤 **Opened by:** {author}\n"
        f"📊 **Status:** 🟢 Open\n\n"
        f"🔗 **GitHub Issue #{number}**\n"
        f"{url}"
    )

    # Final safety check.
    if len(content) > DISCORD_MAX_MESSAGE_LENGTH:
        content = (
            content[
                :DISCORD_MAX_MESSAGE_LENGTH - 3
            ]
            + "..."
        )

    return content


# ============================================================
# DISCORD WEBHOOK
# ============================================================

def webhook_parts():
    """
    Extract the webhook ID and token from the webhook URL.
    """

    match = re.match(
        r"^https://discord(?:app)?\.com/api/webhooks/"
        r"(\d+)/([^/?]+)",
        WEBHOOK_URL,
    )

    if not match:
        raise RuntimeError(
            "Invalid DISCORD_WEBHOOK_URL."
        )

    return (
        match.group(1),
        match.group(2),
    )


def delete_post(thread_id):
    """
    Delete one Forum post created by this webhook.

    A webhook can manage/delete its own messages.
    """

    webhook_id, webhook_token = webhook_parts()

    url = (
        f"https://discord.com/api/webhooks/"
        f"{webhook_id}/{webhook_token}"
        f"?thread_id={thread_id}"
    )

    response = requests.delete(
        url,
        timeout=30,
    )

    # 404 usually means the post was already deleted.
    if response.status_code == 404:
        print(
            f"Post {thread_id} already deleted."
        )
        return

    if not response.ok:
        print(
            f"Failed to delete Discord post "
            f"{thread_id}"
        )
        print("Status:", response.status_code)
        print("Response:", response.text)

    response.raise_for_status()

    print(
        f"Deleted Discord post: {thread_id}"
    )


def delete_old_posts():
    """
    Delete every Discord Forum post that our previous
    sync created.
    """

    old_thread_ids = load_map()

    if not old_thread_ids:
        print(
            "No previous Discord posts to delete."
        )
        return

    print("================================")
    print("DELETING OLD DISCORD POSTS")
    print("================================")

    print(
        f"Found {len(old_thread_ids)} "
        f"previous Discord posts."
    )

    for thread_id in old_thread_ids:
        try:
            delete_post(thread_id)

        except Exception as error:
            print(
                f"Could not delete post "
                f"{thread_id}: {error}"
            )

    # Clear the old list before creating the new one.
    save_map([])

    print(
        "Finished cleaning old Discord posts."
    )


def create_post(issue):
    """
    Create a new Discord Forum post using the webhook.
    """

    title = (
        issue.get("title")
        or "GitHub Issue"
    )

    # Discord Forum post names are limited.
    title = title[:100]

    url = (
        WEBHOOK_URL.rstrip("/")
        + "?wait=true"
    )

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
        print("================================")
        print("DISCORD CREATE FAILED")
        print("================================")
        print("Status:", response.status_code)
        print("Response:", response.text)
        print("================================")

    response.raise_for_status()

    try:
        message = response.json()

    except ValueError:
        raise RuntimeError(
            "Discord returned an invalid JSON response."
        )

    thread_id = message.get(
        "channel_id"
    )

    if not thread_id:
        raise RuntimeError(
            "Discord did not return a Forum post ID."
        )

    print(
        f"Created Discord post for "
        f"Issue #{issue['number']}: "
        f"{thread_id}"
    )

    return thread_id


# ============================================================
# FULL REBUILD
# ============================================================

def sync_all():
    print("================================")
    print("GITHUB → DISCORD SYNC")
    print("================================")

    # --------------------------------------------------------
    # STEP 1: Delete everything we created last time.
    # --------------------------------------------------------

    delete_old_posts()

    # --------------------------------------------------------
    # STEP 2: Get ONLY currently open GitHub issues.
    # --------------------------------------------------------

    print("Getting open GitHub issues...")

    issues = get_open_issues()

    print(
        f"Found {len(issues)} open GitHub issues."
    )

    # --------------------------------------------------------
    # STEP 3: Create a fresh Discord post for every issue.
    # --------------------------------------------------------

    print("================================")
    print("CREATING DISCORD POSTS")
    print("================================")

    new_thread_ids = []

    created = 0
    failed = 0

    for issue in issues:
        try:
            thread_id = create_post(issue)

            new_thread_ids.append(
                thread_id
            )

            created += 1

        except Exception as error:
            print(
                f"FAILED Issue "
                f"#{issue.get('number')}: "
                f"{error}"
            )

            failed += 1

    # --------------------------------------------------------
    # STEP 4: Save the NEW post IDs.
    # --------------------------------------------------------

    save_map(new_thread_ids)

    print("================================")
    print("SYNC FINISHED")
    print("================================")
    print(
        f"Open GitHub issues: {len(issues)}"
    )
    print(
        f"Discord posts created: {created}"
    )
    print(
        f"Failed: {failed}"
    )
    print("================================")


# ============================================================
# MAIN
# ============================================================

def main():
    event = get_event()

    if "issue" in event:
        print(
            f"GitHub issue event detected: "
            f"#{event['issue']['number']}"
        )
    else:
        print(
            "Manual workflow run detected."
        )

    # IMPORTANT:
    #
    # We ALWAYS do a complete rebuild.
    #
    # We do NOT update individual issues.
    # We do NOT compare issue IDs.
    # We do NOT create a second copy based on events.
    #
    # Discord is simply rebuilt from the current
    # list of OPEN GitHub issues.
    sync_all()


if __name__ == "__main__":
    main()

