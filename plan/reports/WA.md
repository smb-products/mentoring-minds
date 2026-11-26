status: done
checks: 1 ✓ 2 ✓ 3 ✓ 4 ✓ 5 ✓ 6 ✓
tests: tests/live-adapter.test.ts (13 tests, unit project); typecheck, test:contract (70) and test:unit green
notes: STALE matches Next's "Failed to find Server Action" plus its newer UnrecognizedActionError / "was not found" wording. content.uploadFile also returns NETWORK instead of rejecting. No e2e run: the live adapter isn't imported by any screen yet and WA has no wN spec.
