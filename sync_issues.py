import os
import requests

REPO = "GHisDW/voxelplus"
WEBHOOK_URL = os.environ["DISCORD_WEBHOOK_URL"]

# Get all issues from GitHub
url = f"https://api.github.com/repos/{REPO}/issues"
params = {
    "state": "open",
    "per_page": 100
}

response = requests.get(url, params=params)
response.raise_for_status()

issues = response.json()

for issue in issues:
    # Pull requests also appear in GitHub's issues API, so skip them.
    if "pull_request" in issue:
        continue

    title = issue["title"]
    body = issue.get("body") or "_No description provided._"
    author = issue["user"]["login"]
    issue_url = issue["html_url"]

    content = (
        f"**Description**\n"
        f"{body}\n\n"
        f"**Opened by**\n"
        f"{author}\n\n"
        f"**GitHub Issue**\n"
        f"{issue_url}"
    )

    payload = {
        "thread_name": title,
        "content": content
    }

    r = requests.post(WEBHOOK_URL, json=payload)

    print(f"{issue['number']}: {r.status_code} - {title}")

    if not r.ok:
        print(r.text)
