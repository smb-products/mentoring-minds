status: done
checks: 1 ✓ 2 ✓ 3 ✓ 4 ✓
tests: tests/contract/contract.test.ts, tests/integration/wc-contract-writes.test.ts
notes: The stricter shape check found one gap: ai.discardDraft returned null where the mock returns the draft. It now returns the draft as it stands (src/server/ai.ts). The draftSessionNote recap now says "missed number 2 on test 1" so the mock's keyword stand-in gives the same redo list as the stubbed Claude.
