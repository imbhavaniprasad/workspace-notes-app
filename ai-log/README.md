# AI session logs

The assessment asked us to use AI tools and to include the complete, unedited history. These are those transcripts, exported as-is.

| File | Tool | What happened in it |
| --- | --- | --- |
| `claude-desktop-planning.*` | Claude desktop app | First discussion of the assignment and the overall approach. |
| `claude-code-session.txt` | Claude Code (CLI) | Choosing the stack, building, testing, debugging and preparing the demo. |

## How I worked with the AI

I used Claude as a pair programmer: it wrote most of the code, and I steered the decisions, questioned choices I didn't understand, and checked the result myself.

- **Planning before code.** I brought the assignment and asked for a plan aimed at what the reviewers care about, before any code was written.
- **Questioning the stack.** The first plan used plain Postgres with hand-written auth. I asked whether Supabase would be better because it includes auth and RLS. We compared both and I chose Supabase. I then asked what I would need to understand to defend that choice in a review, and what running it locally requires (no account or payment).
- **Learning what I didn't know.** Where I was new to something (Supabase's keys and roles, `auth.uid()`, the mock model scenarios), I asked for explanations instead of accepting the code as-is.
- **Checking it myself.** I set up Docker and ran the app. I tried the summary scenarios in the browser myself, and I reported a runtime error I hit while using the app, which we traced to the machine running out of memory.
- **Calls on publishing.** I decided how the repository is presented: public, generically named, no binary files, and no personal email in commit history.

## Verification

AI output was not taken on trust:

- 60 tests run against a real local database, covering URL, request-body and direct-database attacks between workspaces.
- A deliberately planted bad policy (`using (true)`) made 5 tests fail, which shows the tests catch real leaks.
- Clicking through the running app found a UI bug the tests didn't (the summary scenario dropdown reset after each submit), which was then fixed.
