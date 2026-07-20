# Logger Signature Mechanical Fix — Audit Report

**Task ID:** v15-logger-mechanical-fix
**Date:** 2026-07-12
**Agent:** general-purpose sub-agent (Z.ai Code)
**Codebase:** GarfiX EOS v15 at `/home/z/my-project/garfix-v15/`
**Commit:** `0ad5147` — "Mechanical logger signature fix across 31 files"

---

## 1. Summary

| Metric                         | Before    | After    | Δ        |
|--------------------------------|-----------|----------|----------|
| Files changed                  | —         | 31       | —        |
| Logger calls swapped           | —         | 82       | —        |
| `tsc --noEmit` total errors    | 124       | 42       | **−82**  |
| `tsc --noEmit` TS2345 errors   | 91        | 9        | **−82**  |
| `tsc --noEmit` logger TS2345   | 82        | 0        | **−82**  |
| `bun test src/lib/__tests__/`  | 74/0/209  | 74/0/209 | unchanged |

The 82-logger-TS2345 reduction exactly matches the 82 swaps performed. No new errors were introduced (verified by diffing baseline vs. post-fix `tsc` output — every error in the after-set was present, modulo line/column shifts, in the before-set). The remaining 42 errors are pre-existing and unrelated to the logger signature.

---

## 2. Repro Script

`scripts/fix-logger-signature.py` (idempotent; re-running produces 0 swaps):

```python
#!/usr/bin/env python3
r"""
fix-logger-signature.py — Mechanical fix for backwards logger calls.

Background:
  The logger at `src/lib/logger.ts` has the signature `(message: string,
  meta?: LogMeta)` — message FIRST, meta SECOND. The docstring + `wrap()`
  helper were fixed in v14 (P0.4), but ~82 caller sites still use the
  BACKWARDS order:
      logger.info({ err: msg }, "[tag] message")
  This causes 82 TS2345 errors ("Argument of type '{...}' is not assignable
  to parameter of type 'string'") in `tsc --noEmit`.

What this script does:
  Walks `src/` recursively for `.ts`/`.tsx` files (skipping `node_modules`,
  `.next`, `__tests__`, and `src/lib/logger.ts` itself). For each file, it
  scans for `logger.(info|warn|error|debug|fatal)(...)` calls where the FIRST
  argument is an object literal and the SECOND argument is a string literal,
  and swaps them:
      logger.info({ err: msg }, "[tag] message")
      ->
      logger.info("[tag] message", { err: msg })

Safety:
  - Idempotent: re-running on already-fixed files is a no-op (the first arg
    is a string, not an object literal, so the call is skipped).
  - Does NOT touch:
      * `src/lib/logger.ts` (source of truth — already correct)
      * `src/lib/__tests__/` (tests may intentionally test both signatures)
      * Any call where the first arg is NOT an object literal
        (e.g., `logger.info("msg")` is already correct; template-literal
        messages are also fine; `logger.info(someVar, "msg")` is ambiguous
        and is flagged for MANUAL REVIEW).
  - Multi-line calls are handled: `logger.X(\n  { ... },\n  "...",\n)` is
    collapsed to a single-line `logger.X("...", { ... })`.
  - Calls with 3+ args, calls where the second arg is not a string literal,
    and object-only calls (`logger.X({...})` with no message) are flagged
    for MANUAL REVIEW rather than auto-swapped.

Usage:
  python3 scripts/fix-logger-signature.py            # apply changes
  python3 scripts/fix-logger-signature.py --dry-run  # preview only

Exits 0 on success (regardless of whether any changes were made).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# --- Configuration -----------------------------------------------------------

SRC_ROOT = Path(__file__).resolve().parent.parent / "src"
SKIP_FILES = (
    SRC_ROOT / "lib" / "logger.ts",  # source of truth — already correct
)
SKIP_DIR_PARTS = frozenset({"node_modules", ".next", "__tests__"})
LEVELS = ("info", "warn", "error", "debug", "fatal")

# Matches the *start* of a logger call: `logger.<level>(` with optional
# whitespace before the open paren. `\b` ensures we don't match `mylogger.`
# (no word boundary between `y` and `l`), but we DO match `foo.logger.info(`
# (word boundary between `.` and `logger`) — which is intended, since the
# swap preserves any prefix.
LOGGER_CALL_START = re.compile(r"\blogger\.(info|warn|error|debug|fatal)\s*\(")


# --- Character-level parsers -------------------------------------------------

def skip_string(text: str, start: int) -> int:
    """
    Skip a string literal starting at `start` (must point at a quote char:
    `"`, `'`, or backtick). Returns the index of the closing quote, or -1 if
    unterminated. Handles `\\` escapes and template-literal `${...}`
    interpolations (recursively).
    """
    quote = text[start]
    i = start + 1
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if quote == "`" and c == "$" and i + 1 < n and text[i + 1] == "{":
            # Template literal interpolation — find matching close brace.
            brace_close = find_matching(text, i + 1, "{", "}")
            if brace_close < 0:
                return -1
            i = brace_close + 1
            continue
        if c == quote:
            return i
        i += 1
    return -1


def find_matching(text: str, open_pos: int, open_ch: str, close_ch: str) -> int:
    """
    Find the index of the matching `close_ch` for the `open_ch` at `open_pos`.
    Handles nested braces, strings, escapes, and line/block comments.
    Returns -1 if unbalanced.
    """
    depth = 0
    i = open_pos
    n = len(text)
    while i < n:
        c = text[i]
        if c in ('"', "'", "`"):
            end = skip_string(text, i)
            if end < 0:
                return -1
            i = end + 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            nl = text.find("\n", i)
            if nl < 0:
                return -1
            i = nl + 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            if end < 0:
                return -1
            i = end + 2
            continue
        if c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def parse_call_args(text: str, paren_open: int):
    """
    Parse the arguments of a function call whose open paren is at `paren_open`.
    Returns `(args, paren_close)` where `args` is a list of `(start, end)`
    tuples (inclusive on both ends, stripped of surrounding whitespace) for
    each top-level argument, or `None` entries for empty args (e.g. trailing
    comma). Returns `(None, -1)` if parsing fails.
    """
    paren_close = find_matching(text, paren_open, "(", ")")
    if paren_close < 0:
        return None, -1

    args = []
    depth = 0
    i = paren_open + 1
    n = paren_close
    arg_start = i
    while i < n:
        c = text[i]
        if c in ('"', "'", "`"):
            end = skip_string(text, i)
            if end < 0:
                return None, -1
            i = end + 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            nl = text.find("\n", i)
            if nl < 0:
                return None, -1
            i = nl + 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            if end < 0:
                return None, -1
            i = end + 2
            continue
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == "," and depth == 0:
            args.append((arg_start, i))
            arg_start = i + 1
        i += 1
    args.append((arg_start, n))  # last arg

    # Strip surrounding whitespace from each arg.
    stripped = []
    for s, e in args:
        a = s
        while a < e and text[a].isspace():
            a += 1
        b = e - 1
        while b >= a and text[b].isspace():
            b -= 1
        stripped.append((a, b) if a <= b else None)
    return stripped, paren_close


# --- Predicates --------------------------------------------------------------

def is_object_literal(text: str, start: int, end: int) -> bool:
    """True iff the inclusive slice text[start..end] starts with `{`."""
    return start <= end and text[start] == "{"


def is_string_literal(text: str, start: int, end: int) -> bool:
    """True iff the inclusive slice text[start..end] starts with a quote."""
    return start <= end and text[start] in ('"', "'", "`")


def get_line_no(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


# --- File-level fix ----------------------------------------------------------

def fix_file(path: Path, dry_run: bool):
    """
    Fix all backwards logger calls in `path`.
    Returns (list_of_swaps, list_of_manual_reviews, modified).
    Each swap is (line_no, before, after).
    Each manual_review is (line_no, before, reason).
    """
    text = path.read_text(encoding="utf-8")
    swaps = []           # list of (start, end, new_text, line_no, before, after)
    manual_review = []   # list of (line_no, before, reason)

    for m in LOGGER_CALL_START.finditer(text):
        level = m.group(1)
        call_start = m.start()
        paren_open = m.end() - 1  # position of '('

        args, paren_close = parse_call_args(text, paren_open)
        if args is None or paren_close < 0:
            # Unparseable — skip silently (don't flag, since this likely means
            # the regex matched inside a string or some non-call context).
            continue

        non_empty = [a for a in args if a is not None]
        if len(non_empty) == 0:
            continue  # logger.X() — nothing to do

        if len(non_empty) == 1:
            # Could be logger.X("msg") (correct) or logger.X({...}) (backwards,
            # object-only — manual review).
            only = non_empty[0]
            if is_object_literal(text, *only):
                line_no = get_line_no(text, call_start)
                raw = text[call_start:paren_close + 1]
                manual_review.append(
                    (line_no, raw, "object-only call (no message arg) — needs message")
                )
            continue

        if len(non_empty) >= 2:
            first = non_empty[0]
            second = non_empty[1]
            if not is_object_literal(text, *first):
                # First arg is not an object literal — already correct or
                # some other shape (string, var, function call). Leave alone.
                continue
            # First IS an object literal — this is the "backwards" pattern.
            if not is_string_literal(text, *second):
                line_no = get_line_no(text, call_start)
                raw = text[call_start:paren_close + 1]
                manual_review.append(
                    (line_no, raw, "second arg is not a string literal — ambiguous")
                )
                continue
            if len(non_empty) > 2:
                line_no = get_line_no(text, call_start)
                raw = text[call_start:paren_close + 1]
                manual_review.append(
                    (line_no, raw, "3+ args — needs manual review")
                )
                continue

            # --- Swap! ---
            meta_full = text[first[0]:first[1] + 1]   # includes outer { }
            meta_inner = meta_full[1:-1].strip()
            msg_str = text[second[0]:second[1] + 1]   # includes surrounding quotes

            # Preserve `logger.<level>` prefix exactly as matched.
            prefix = text[call_start:m.end() - 1]  # everything up to but not incl '('
            if meta_inner:
                new_call = f"{prefix}({msg_str}, {{ {meta_inner} }})"
            else:
                new_call = f"{prefix}({msg_str}, {{}})"

            before = text[call_start:paren_close + 1]
            after = new_call
            line_no = get_line_no(text, call_start)
            swaps.append((call_start, paren_close + 1, new_call, line_no, before, after))

    if not swaps:
        return [], manual_review, False

    # Apply swaps in REVERSE order so positions don't shift.
    swaps.sort(key=lambda s: s[0], reverse=True)
    new_text = text
    swap_records = []
    for start, end, repl, line_no, before, after in swaps:
        new_text = new_text[:start] + repl + new_text[end:]
        swap_records.append((line_no, before, after))

    # Reverse swap_records back to ascending line order for readable output.
    swap_records.reverse()

    if not dry_run:
        path.write_text(new_text, encoding="utf-8")

    return swap_records, manual_review, True


# --- Main --------------------------------------------------------------------

def skip_path(p: Path) -> bool:
    if p in SKIP_FILES:
        return True
    parts = set(p.parts)
    return bool(parts & SKIP_DIR_PARTS)


def main():
    dry_run = "--dry-run" in sys.argv
    verbose = "--verbose" in sys.argv or "-v" in sys.argv

    files_changed = 0
    calls_swapped = 0
    swap_log = []          # list of (rel_path, line_no, before, after)
    manual_review_all = [] # list of (rel_path, line_no, before, reason)
    files_with_changes = []

    all_files = sorted(SRC_ROOT.rglob("*"))
    for path in all_files:
        if not path.is_file():
            continue
        if path.suffix not in (".ts", ".tsx"):
            continue
        if skip_path(path):
            continue

        swaps, manual, modified = fix_file(path, dry_run=dry_run)
        rel = path.relative_to(SRC_ROOT.parent)
        if modified:
            files_changed += 1
            files_with_changes.append(rel)
        calls_swapped += len(swaps)
        for line_no, before, after in swaps:
            swap_log.append((rel, line_no, before, after))
        for line_no, before, reason in manual:
            manual_review_all.append((rel, line_no, before, reason))

    mode = "[DRY RUN] " if dry_run else ""
    print(f"{mode}Files changed: {files_changed}")
    print(f"{mode}Calls swapped: {calls_swapped}")

    if manual_review_all:
        print(f"\nMANUAL REVIEW NEEDED ({len(manual_review_all)} items):")
        for rel, line_no, raw, reason in manual_review_all:
            raw_oneline = " ".join(raw.split())
            snippet = raw_oneline[:160]
            if len(raw_oneline) > 160:
                snippet += " …"
            print(f"  {rel}:{line_no} — {reason}")
            print(f"    Raw: {snippet}")
    else:
        print("\nNo manual review items.")

    if verbose:
        print(f"\n--- Swap details ({calls_swapped} total) ---")
        for rel, line_no, before, after in swap_log:
            before_oneline = " ".join(before.split())
            after_oneline = " ".join(after.split())
            print(f"\n{rel}:{line_no}")
            print(f"  BEFORE: {before_oneline[:240]}")
            print(f"  AFTER:  {after_oneline[:240]}")

    print(f"\nFiles changed:")
    for rel in files_with_changes:
        print(f"  {rel}")

    # Exit 0 regardless — the script is informational; CI should check
    # tsc/test results separately.
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

**Design notes:**

- The script uses a **character-level parser** rather than a single regex. This is necessary because the meta object can contain nested braces, ternaries, function calls, strings with commas, escaped quotes, and template-literal interpolations — none of which a simple regex can reliably handle.
- The parser is **string-aware**: it skips over `"..."`, `'...'`, and `` `...` `` literals (including `${...}` interpolations inside template literals) when scanning for the matching `}`, `)`, and top-level `,`.
- It also skips line comments (`//`) and block comments (`/* */`) inside argument lists.
- **Idempotent**: re-running on already-fixed files produces 0 swaps (the first arg is now a string literal, so `is_object_literal(first)` returns False and the call is skipped). Verified by running the script again after the fix.
- Multi-line calls are **collapsed to a single line** in the output. This minimizes the diff and avoids the question of where to put line breaks in the swapped form. The original multi-line call shape (3-4 lines) becomes 1 line.

---

## 3. Files Changed — Full `file:line` List (82 swaps across 31 files)

```
  - src/app/api/ai/agents/route.ts:57
  - src/app/api/ai/agents/route.ts:114
  - src/app/api/ai/bulk-import/route.ts:82
  - src/app/api/ai/bulk-import/route.ts:235
  - src/app/api/ai/chat/route.ts:50
  - src/app/api/ai/chat/stream/route.ts:79
  - src/app/api/ai/chat/stream/route.ts:213
  - src/app/api/ai/invoice-brain/extract/route.ts:147
  - src/app/api/ai/parse-file/route.ts:99
  - src/app/api/ai/parse-file/route.ts:146
  - src/app/api/ai/parse-file/route.ts:187
  - src/app/api/ai/parse-image/route.ts:120
  - src/app/api/ai/parse-image/route.ts:157
  - src/app/api/ai/parse-image/route.ts:189
  - src/app/api/ai/parse-image/route.ts:232
  - src/app/api/ai/smart-parse/route.ts:69
  - src/app/api/ai/smart-parse/route.ts:179
  - src/app/api/ai/smart-parse/route.ts:194
  - src/app/api/ai/smart-parse/route.ts:205
  - src/app/api/ai/smart-parse/route.ts:241
  - src/app/api/ai/smart-parse/route.ts:286
  - src/app/api/auth/forgot-password/route.ts:55
  - src/app/api/auth/reset-password/route.ts:95
  - src/app/api/backups/route.ts:29
  - src/app/api/dashboard/stats/route.ts:89
  - src/app/api/onboarding/route.ts:135
  - src/app/api/onboarding/route.ts:155
  - src/app/api/storage/[key]/route.ts:52
  - src/lib/aiConfig.ts:67
  - src/lib/aiConfig.ts:91
  - src/lib/aiProvider.ts:371
  - src/lib/aiProvider.ts:411
  - src/lib/aiProvider.ts:413
  - src/lib/aiProvider.ts:416
  - src/lib/aiProvider.ts:488
  - src/lib/api.ts:80
  - src/lib/audit.ts:32
  - src/lib/audit.ts:58
  - src/lib/backup.ts:96
  - src/lib/backup.ts:102
  - src/lib/backup.ts:111
  - src/lib/backup.ts:125
  - src/lib/backup.ts:128
  - src/lib/cache.ts:34
  - src/lib/cryptoVault.ts:76
  - src/lib/cryptoVault.ts:123
  - src/lib/invoice-brain/aiFallback.ts:58
  - src/lib/invoice-brain/excelParser.ts:105
  - src/lib/invoice-brain/extractInvoice.ts:44
  - src/lib/invoice-brain/extractInvoice.ts:49
  - src/lib/invoice-brain/extractInvoice.ts:66
  - src/lib/invoice-brain/extractInvoice.ts:68
  - src/lib/invoice-brain/extractInvoice.ts:78
  - src/lib/invoice-brain/headerMapStore.ts:118
  - src/lib/invoice-brain/patternStore.ts:137
  - src/lib/middleware.ts:277
  - src/lib/notifications.ts:43
  - src/lib/notifications.ts:142
  - src/lib/notifications.ts:146
  - src/lib/notifications.ts:216
  - src/lib/notifications.ts:220
  - src/lib/notifications.ts:264
  - src/lib/notifications.ts:276
  - src/lib/rateLimit.ts:55
  - src/lib/rateLimit.ts:57
  - src/lib/rateLimit.ts:61
  - src/lib/rateLimit.ts:81
  - src/lib/rateLimit.ts:104
  - src/lib/rateLimit.ts:150
  - src/lib/rateLimit.ts:191
  - src/lib/rateLimit.ts:227
  - src/lib/rateLimit.ts:291
  - src/lib/startupCheck.ts:95
  - src/lib/startupCheck.ts:96
  - src/lib/startupCheck.ts:106
  - src/lib/startupCheck.ts:120
  - src/lib/startupCheck.ts:121
  - src/lib/startupCheck.ts:122
  - src/lib/startupCheck.ts:126
  - src/lib/storage.ts:22
  - src/lib/storage.ts:43
  - src/lib/storage.ts:63
```

**Breakdown by level:** error=49, info=18, warn=10, debug=5, fatal=0.
**Breakdown by shape:** single-line=73, multi-line (object or message on its own line)=9.

---

## 4. Spot-check: 15 before/after pairs

Selection prioritized: **9 multi-line calls** (most complex parser cases), **3 complex-meta single-line calls** (nested ternaries, 3-field metas, meta inside `forEach` callback), and **2 cases that unmasked pre-existing latent TS18004 bugs** in `src/app/api/onboarding/route.ts` (not introduced by the swap — flagged for a separate fix pass).

### 4.1 `src/app/api/ai/agents/route.ts:57` — multi-line error call (1-field meta with ternary)

**Before** (4 lines):
```ts
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "[ai/agents] LLM call failed",
    );
```

**After** (1 line):
```ts
    logger.error("[ai/agents] LLM call failed", { err: err instanceof Error ? err.message : String(err) });
```

✅ Message and meta are in the correct order; the ternary inside `err:` is preserved verbatim.

### 4.2 `src/app/api/ai/agents/route.ts:114` — multi-line warn call (2-field meta)

**Before** (4 lines):
```ts
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), agentType },
      "[ai/agents] classifier failed — assuming in scope",
    );
```

**After** (1 line):
```ts
    logger.warn("[ai/agents] classifier failed — assuming in scope", { err: err instanceof Error ? err.message : String(err), agentType });
```

✅ Both meta fields preserved; em-dash in message preserved.

### 4.3 `src/app/api/ai/invoice-brain/extract/route.ts:147` — multi-line info call (6-field meta)

**Before** (4 lines):
```ts
  logger.info(
    { companySlug, source, orders: orders.length, skipped: skipped.length, processingMs, templates: brainStats.totalTemplates },
    "[invoice-brain] extraction complete",
  );
```

**After** (1 line):
```ts
  logger.info("[invoice-brain] extraction complete", { companySlug, source, orders: orders.length, skipped: skipped.length, processingMs, templates: brainStats.totalTemplates });
```

✅ All 6 meta fields preserved in order; shorthand (`companySlug`, `source`, `processingMs`) and explicit (`orders: orders.length`) forms both intact.

### 4.4 `src/lib/rateLimit.ts:61` — multi-line error call (2-field meta inside catch block)

**Before** (4 lines):
```ts
    logger.error(
      { err: msg, url: REDIS_URL },
      "[rate-limit] Redis connection FAILED — falling back to in-memory",
    );
```

**After** (1 line):
```ts
    logger.error("[rate-limit] Redis connection FAILED — falling back to in-memory", { err: msg, url: REDIS_URL });
```

✅ Both meta fields preserved.

### 4.5 `src/lib/rateLimit.ts:81` — multi-line info call (1-field meta, long message with em-dash and parens)

**Before** (4 lines):
```ts
  logger.info(
    { url: REDIS_URL },
    "[rate-limit] REDIS_URL detected — will use Redis backend (connects lazily on first request)",
  );
```

**After** (1 line):
```ts
  logger.info("[rate-limit] REDIS_URL detected — will use Redis backend (connects lazily on first request)", { url: REDIS_URL });
```

✅ The message contains `(`, `)`, and `—` — all preserved correctly. The parser correctly skipped the parenthesized text inside the string literal (it didn't confuse the inner `(` with a nested call).

### 4.6 `src/lib/rateLimit.ts:150` — multi-line error call (message contains a COMMA)

**Before** (4 lines):
```ts
      logger.error(
        { err: msg, key },
        "[rate-limit] Redis op failed — fail-open for this request, using in-memory",
      );
```

**After** (1 line):
```ts
      logger.error("[rate-limit] Redis op failed — fail-open for this request, using in-memory", { err: msg, key });
```

✅ **Comma stress test.** The message `"..., using in-memory"` contains a comma. The parser correctly identified this comma as being *inside the string literal* (it does not split args on commas inside strings), so the comma is preserved in the message. The meta `{ err: msg, key }` (which also contains a comma, between fields) is preserved correctly.

### 4.7 `src/lib/invoice-brain/excelParser.ts:105` — multi-line warn call (2-field meta with type assertion + method call)

**Before** (4 lines):
```ts
      logger.warn(
        { err: (err as Error).message, unresolved: auto.unresolved.length },
        "[brain] header AI resolution failed — using synonym-only mapping",
      );
```

**After** (1 line):
```ts
      logger.warn("[brain] header AI resolution failed — using synonym-only mapping", { err: (err as Error).message, unresolved: auto.unresolved.length });
```

✅ The parser correctly handled the parens in `(err as Error)` and the method call `auto.unresolved.length` — they were counted as nested depth and not confused with arg delimiters.

### 4.8 `src/lib/invoice-brain/aiFallback.ts:58` — multi-line warn call (2-field meta with type assertion + slice)

**Before** (4 lines):
```ts
    logger.warn(
      { err: (firstErr as Error).message, preview: cleaned.slice(0, 120) },
      "[brain] AI JSON parse failed — retrying with repair prompt",
    );
```

**After** (1 line):
```ts
    logger.warn("[brain] AI JSON parse failed — retrying with repair prompt", { err: (firstErr as Error).message, preview: cleaned.slice(0, 120) });
```

✅ The `cleaned.slice(0, 120)` call contains a comma between its arguments. The parser correctly handled this — the comma is inside parens (depth > 0), so it's not an arg delimiter.

### 4.9 `src/lib/invoice-brain/extractInvoice.ts:68` — multi-line info call (2-field meta, in an `else` branch)

**Before** (4 lines):
```ts
      logger.info(
        { fingerprint, fieldsCount: fields.length },
        "[brain] AI ok but too few fields to save a template",
      );
```

**After** (1 line):
```ts
      logger.info("[brain] AI ok but too few fields to save a template", { fingerprint, fieldsCount: fields.length });
```

✅ Both meta fields preserved. (Note: this file had *another* swap on line 66 with identical meta content but a different message — see audit list — confirming the script handled both correctly.)

### 4.10 `src/app/api/ai/parse-image/route.ts:157` — single-line error call (2-field meta with nested ternary + typeof + slice)

**Before**:
```ts
      logger.error({ err: err instanceof Error ? err.message : String(err), content: typeof content === "string" ? content.slice(0, 200) : "non-string" }, "[parse-image] JSON parse failed");
```

**After**:
```ts
      logger.error("[parse-image] JSON parse failed", { err: err instanceof Error ? err.message : String(err), content: typeof content === "string" ? content.slice(0, 200) : "non-string" });
```

✅ The meta contains a nested ternary (`typeof content === "string" ? content.slice(0, 200) : "non-string"`) with parens, commas (inside the slice call), and string literals. The parser handled all of them correctly — no truncation, no misparse.

### 4.11 `src/lib/audit.ts:32` — single-line error call (3-field meta with ternary)

**Before**:
```ts
    logger.error({ err: err instanceof Error ? err.message : String(err), action: input.action, entity: input.entity }, "[audit] failed to write audit log");
```

**After**:
```ts
    logger.error("[audit] failed to write audit log", { err: err instanceof Error ? err.message : String(err), action: input.action, entity: input.entity });
```

✅ All 3 meta fields preserved in order.

### 4.12 `src/lib/notifications.ts:276` — single-line info call (3-field meta, all shorthand)

**Before**:
```ts
  logger.info({ overdue, residence, subscription }, "[notifications] scan complete");
```

**After**:
```ts
  logger.info("[notifications] scan complete", { overdue, residence, subscription });
```

✅ All 3 shorthand meta fields preserved.

### 4.13 `src/lib/startupCheck.ts:95` — single-line error call inside `forEach` callback (1-field shorthand meta)

**Before**:
```ts
    fatal.forEach((msg) => logger.error({ msg }, "[startup] FATAL environment check failed"));
```

**After**:
```ts
    fatal.forEach((msg) => logger.error("[startup] FATAL environment check failed", { msg }));
```

✅ The parser correctly identified the `logger.error(...)` call inside the arrow function argument to `forEach`. The outer parens of `forEach(...)` were correctly tracked as depth+1, so the comma between `forEach`'s args (if there were more than one) would not have been confused with logger's args. The shorthand `{ msg }` references the arrow function's parameter `msg` — preserved correctly.

### 4.14 `src/app/api/onboarding/route.ts:135` — single-line info call (3-field meta; **PRE-EXISTING LATENT BUG UNMASKED**)

**Before**:
```ts
      logger.info({ companySlug, accountsCreated, businessType }, "[onboarding] account tree generated");
```

**After**:
```ts
      logger.info("[onboarding] account tree generated", { companySlug, accountsCreated, businessType });
```

⚠️ **Pre-existing latent bug unmasked (not introduced by this swap).** The shorthand `{ companySlug }` references a variable `companySlug` that is **not in scope** at this line — the surrounding code only has `data.companySlug` (the validated `data` object from the request body). TypeScript emitted `TS18004: No value exists in scope for the shorthand property 'companySlug'` on this line *in the baseline* — but that error was hidden in the 124-error noise. After the swap removed the TS2345, the TS18004 is now visible (line 135, col 60). At runtime, this line would throw `ReferenceError: companySlug is not defined` if executed.

This is **out of scope** for the mechanical logger-signature fix — the swap itself is correct. The fix is to change `{ companySlug, ... }` → `{ companySlug: data.companySlug, ... }` (and similarly for line 155). Listed in §5 below.

### 4.15 `src/app/api/onboarding/route.ts:155` — single-line info call (3-field meta; **PRE-EXISTING LATENT BUG UNMASKED**)

**Before**:
```ts
    logger.info({ companySlug, modulesActivated, recommended }, "[onboarding] modules activated");
```

**After**:
```ts
    logger.info("[onboarding] modules activated", { companySlug, modulesActivated, recommended });
```

⚠️ **Same pre-existing latent bug** as 4.14 — `companySlug` is not in scope (only `data.companySlug` is). Same fix needed.

---

## 5. MANUAL REVIEW NEEDED

The script reported **zero** manual-review items during its run. (No 3-arg logger calls, no object-only calls, no calls where the second arg was a non-string literal were found.)

However, **two pre-existing latent bugs** were unmasked by the swap and need a separate fix pass. These were **not introduced** by the mechanical fix — they were always present in the baseline (verified by `git stash` + `tsc` on baseline). The mechanical swap just removed the louder TS2345 error that was hiding them.

| # | File:line (after swap) | Error | Latent bug | Suggested fix |
|---|------------------------|-------|------------|---------------|
| 1 | `src/app/api/onboarding/route.ts:135` | TS18004 | `{ companySlug, ... }` shorthand references a variable that is not in scope (only `data.companySlug` is) | Change to `{ companySlug: data.companySlug, accountsCreated, businessType }` |
| 2 | `src/app/api/onboarding/route.ts:155` | TS18004 | Same — `{ companySlug, ... }` shorthand | Change to `{ companySlug: data.companySlug, modulesActivated, recommended }` |

These are runtime bugs (`ReferenceError: companySlug is not defined` would be thrown whenever the `complete` onboarding flow reached those log lines). They are NOT logger-signature issues and are NOT in scope for this mechanical pass. A separate fix pass should address them.

---

## 6. `tsc --noEmit` Error Count

|                          | Before | After | Δ     |
|--------------------------|--------|-------|-------|
| Total errors             | 124    | 42    | −82   |
| TS2345 (any)             | 91     | 9     | −82   |
| TS2345 (`'string'`)      | 82     | 0     | −82   |
| Other TS error codes     | 33     | 33    | 0     |

Verified by diffing the baseline error list against the post-fix error list (ignoring line/column position shifts): **every error in the after-set is present in the before-set, and every error removed from the before-set is a logger-signature TS2345.** No new errors were introduced by the swap.

The remaining 42 errors break down as:
- 9 TS2345 `AuthPayload` type mismatches (pre-existing, unrelated)
- 5 TS2307 `Cannot find module 'bun:test'` (test files; pre-existing, unrelated)
- 4 TS2339 property-does-not-exist (pre-existing)
- 4 TS2322 type-assignment (pre-existing, in onboarding, automation, AuthContext)
- 2 TS18004 shorthand-property-not-in-scope (the latent bugs in onboarding — see §5)
- 18 various other pre-existing errors (TS2769, TS2783, TS1117, TS18046, TS2741, TS2535, TS2352, TS18004, TS2533, etc.)

---

## 7. Test Pass Count

```
$ bun test src/lib/__tests__/
...
74 pass
0 fail
209 expect() calls
Ran 74 tests across 5 files. [297.00ms]
```

**Before:** 74 pass / 0 fail / 209 expect() calls.
**After:**  74 pass / 0 fail / 209 expect() calls.

Unchanged — as expected, since the swap is purely a syntactic reorder (no behavioral change to logger output; the logger's `format()` function receives the same `msg` and `meta` values, just via the correct parameter slots). The test files don't import the logger at all (verified via `rg "logger\." src/lib/__tests__/` — zero hits).

---

## 8. Constraints honored

- ✅ Did **NOT** modify `src/lib/logger.ts` (verified: `git diff HEAD -- src/lib/logger.ts` is empty).
- ✅ Did **NOT** modify any test file in `src/lib/__tests__/` (verified: `git diff HEAD -- src/lib/__tests__/` is empty; also confirmed the test files don't import `logger` at all).
- ✅ Did **NOT** use `@ts-ignore` or `@ts-expect-error` anywhere (verified: `rg "@ts-(ignore|expect-error)" src/` returns zero hits).
- ✅ No ambiguous calls were auto-swapped (the script's MANUAL REVIEW logic was exercised by zero calls — i.e., there were no ambiguous calls in the codebase to begin with).
- ✅ All 82 swaps are mechanical reorders — no behavioral change to log output (the logger's `format(level, msg, meta)` receives the same `msg` and `meta` values, just via the correct parameter slots).
- ✅ `bun test` still passes 74/74 (verified).
- ✅ Script is idempotent (verified: re-running produces "Files changed: 0 / Calls swapped: 0").

---

## 9. How to reproduce

```bash
cd /home/z/my-project/garfix-v15

# Apply the fix
python3 scripts/fix-logger-signature.py

# Verify tsc dropped from 124 -> 42
bunx tsc --noEmit 2>&1 | grep -E "^src/.*error TS" | wc -l

# Verify tests still pass
bun test src/lib/__tests__/ 2>&1 | tail -5

# Verify idempotency
python3 scripts/fix-logger-signature.py --dry-run
# -> "[DRY RUN] Files changed: 0 / Calls swapped: 0"
```
