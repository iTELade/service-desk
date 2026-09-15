# Service Desk 1.0.8

## GitHub Issues integration choices

- Show every active Service Desk project visible to the Global Administrator in the GitHub Issues project selector, including project types previously hidden by the UI.
- Allow every active human or service account to be selected as Reporter / service account.
- Exclude inactive, directory-disabled and pending accounts.
- Validate saved reporters with the same eligibility rules as the dropdown.
- Add functional and UI regression tests for these choices.

Database schema remains **8**. No migration is required.
