# Config corpus

The files in this directory are the input of the golden round-trip: the panel must
parse each of them, keep its bytes outside the edit and not lose a single node.
They are checked by `Config.corpus.test.ts`, which picks up the whole directory,
so a new file only needs to be placed next to the others.

What belongs here: forms found on live routers, not the ones convenient for the
panel. Comments, a comma before a closing bracket, tabs, CRLF, unknown sections,
key order different from the schema.

Owner data cannot be here: domains use the `.example` and `.invalid` zones
(RFC 2606), addresses use `198.51.100.0/24` and `203.0.113.0/24` (RFC 5737), keys
and subscriptions are `REDACTED`. The file is in git, and a dump from a real
device is never put here.
