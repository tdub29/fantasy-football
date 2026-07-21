# Nudge: Smart Disclosure Spec

## When to Use

Use when information exists but is not usable:

- Fees or terms are hard to compare.
- Users need transaction/export data in a standard format.
- A mortgage, credit card, fund, or account picker needs comparable inputs.
- Sure should expose data for user-owned analysis or third-party tools.

## Framework

Smart Disclosure releases complex information in a timely, standardized, machine-readable way so users or tools can turn it into better choices.

## How to Apply

1. **Name the decision the disclosure supports.**
2. **List required fields.**
3. **Normalize units.** APR/APY, monthly/annual costs, dollars, percentages, time horizons.
4. **Make it machine-readable.** CSV, JSON, API, or schema.
5. **Make it user-readable.** Plain-language summary and comparison table.
6. **Support portability.** Export, copy, or connect to choice tools.
7. **Check privacy and consent.**

## Output Format

```markdown
## Smart Disclosure Spec: {domain}

Decision supported:
Fields:
Standard units:
Machine-readable format:
User-facing explanation:
Portability:
Privacy/consent:
```

## Common Failure Modes

- **PDF disclosure.** Legally present but not practically usable.
- **Non-comparable units.** Users cannot compare APR vs fees vs monthly cost.
- **No user ownership.** Data is visible but not exportable.
- **Overdisclosure.** More fields without structure increases burden.

## References

- Richard Thaler and Cass Sunstein, *Nudge: The Final Edition* (2021), chapter 7.
