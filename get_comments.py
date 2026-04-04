import json
import urllib.request

# Fetch PR comments from github API
# Note: we need the PR number and repo. I don't have this immediately.
# Let's check the git config for the origin.
import subprocess
result = subprocess.run(['git', 'config', '--get', 'remote.origin.url'], capture_output=True, text=True)
print(result.stdout)
