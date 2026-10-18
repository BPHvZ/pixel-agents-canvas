# Protect main with owner-only pull requests

`main` accepts changes only through pull requests with the existing `Checks / check` status and resolved review conversations; approvals are not required because the repository has one write/admin owner and self-approval would deadlock. The owner manually reviews and merges, and write/admin access remains owner-only; admin bypass, force pushes, and branch deletion are disabled.
