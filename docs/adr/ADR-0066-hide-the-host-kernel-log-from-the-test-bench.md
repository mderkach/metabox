# ADR-0066. Hide the host kernel log from the test bench

- Status: Proposed
- Date: 2026-10-25
- Deciders: repository owner

## Context and problem statement

The `integration` job of CI runs the test bench container on the GitHub runner and drives `dataplane-check` through `docker exec` ([ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md), [ADR-0054](./ADR-0054-run-ci-checks-as-parallel-jobs-behind-a-summary-job.md)). Roughly one run in three the step `Dataplane check` never returned: runs 40116156272 (2026-10-24, over three hours until cancelled by hand), 40134718809 and 40181241418 (2026-10-25). The hung command was always `in_target log-has`, that is `logread | grep | grep -q` inside the container. The owner's bench on Docker Desktop never hung: 900 iterations of the same call and 150 iterations of the full traffic sequence passed.

A probe in PR #129 (run 40187963300) caught the hang with the process state of the container. `logread` sat in `uloop_run` with no stream fd from logd, `ubus call log read` timed out, and logd itself was blocked in the kernel:

```
-- pid 354 wchan=syslog_print state=S ppid=1: /sbin/logd -S 128
   fd 10 -> /proc/kmsg   flags: 02104000
   stack [<0>] syslog_print+0x17c/0x3e0
   stack [<0>] do_syslog+0xde/0x440
   stack [<0>] kmsg_read+0x43/0x60
```

logd opens `/proc/kmsg` with `O_NONBLOCK` and reads it from its single event loop (`log/syslog.c`, `klog_open`). The kernel honours `O_NONBLOCK` in two steps (`fs/proc/kmsg.c`, `kmsg_read`): first `SYSLOG_ACTION_SIZE_UNREAD` asks whether a record is pending, then `SYSLOG_ACTION_READ` reads it, and the read waits on `log_wait` when the record is no longer there (`kernel/printk/printk.c`, `syslog_print`). The cursor behind both calls, `syslog_seq`, is one global per kernel, shared by every `/proc/kmsg` reader. The container has no kernel of its own, so its `/proc/kmsg` is the runner's kernel log, and the runner has a reader of its own: `rsyslogd` with `module(load="imklog")` in `/etc/rsyslog.conf` holds `/proc/kmsg` open (run 40189248668, kernel 6.17.0-1022-azure). When a kernel message arrives, both readers see "pending"; the one that reads second finds nothing and sleeps until the next kernel message, which on an idle runner may never come. Every `docker run --rm` of a client in the dataplane check makes the kernel log veth and bridge lines, which is why the hang followed the client traffic of sections 2 and 5.

While logd sleeps it serves no ubus request, so `logread` waits forever: `ubus_lookup_id` and the stream read in `logread` have no timeout. Anything else that logs through `/dev/log` fills logd's receive queue and then blocks too; in run 40186777234 `/etc/init.d/metabox-singbox stop` hung the same way after the probe had kept logd busy.

In scope: how the test bench container treats the host kernel log. Out of scope: the host-side deadline of the check steps and the job timeouts (ADR-0054), logd and logread upstream, the router, where logd is the only `/proc/kmsg` reader.

## Decision drivers

1. The integration run must finish; a hang that needs a human is worse than a failure.
2. The test bench must stay the router's environment: no bench-only patches to logd or the init scripts the router runs.
3. The same bench files serve CI and the owner's machine, so the fix has to be harmless where the problem does not occur.
4. No new tool or dependency.

## Considered options

1. **Mask `/proc/kmsg` inside the container before procd starts: `mount --bind /dev/null /proc/kmsg` in `stand-init`.** logd opens the file as before, reads end of file at once and stops polling it; the bench log keeps the syslog lines of its own services and loses the host's kernel lines, which never belonged to it. Works on any host, needs nothing new, and leaves logd and the init scripts untouched (drivers 1–4). Drawback: one more line of bench-specific setup in `stand-init`, and the mask depends on the container being privileged, which it already is for procd. **Chosen.**
2. **Mask `/proc/kmsg` from docker-compose with a `/dev/null:/proc/kmsg:ro` volume.** The same effect without touching `stand-init`. runc refuses it: a user bind mount inside `/proc` fails its proc-safety check (`cannot be mounted because it is inside /proc`), measured on Docker 29 (Docker Desktop). **Rejected**: does not start.
3. **Bound the check instead: a timeout around `logread` or reading the log through `ubus -t`.** Hides the symptom in `log-has` only; logd stays stuck, and the next process that logs blocks on `/dev/log` (driver 1). **Rejected** as the fix; the host-side deadline per step from ADR-0054 stays as the safety net.
4. **Keep the current approach.** One run in three hangs until a timeout kills it. **Rejected**: driver 1.

## Decision outcome

- `stand-init` binds `/dev/null` over `/proc/kmsg` before `exec /sbin/procd`. logd still opens the path, reads end of file and stops polling it; the bench log (`logread`) has no `kernel:` lines.
- The dataplane check keeps the host-side deadline per step: a hang of any other origin fails the step within a minute and lists the processes alive in the container.
- Non-goals: changing logd, the fork's or the panel's init scripts, or the router.

### Scope and boundaries

`.devcontainer/target/files/usr/bin/stand-init`; the bench image built from it for CI and for the owner's machine.

## Consequences

### Positive

- The integration job cannot be held by the kernel log of the runner; the dataplane check finishes in about half a minute.
- The bench log shows only what the bench produced, which matches what `logread` shows on the router for the services under test.

### Negative

- Kernel messages are not visible from inside the bench. Nothing in the checks reads them; a future check that needs them would read `/dev/kmsg`, which has a cursor per reader.
- The mask lives in `stand-init`, a file that is already the list of ways the container differs from the device.

### Neutral or deferred

- The race itself is between the host's `/proc/kmsg` reader and any container that reads the same file; it is not reported upstream here.

## Compatibility, migration and rollback

The image is rebuilt by `make up`, as after any change to `.devcontainer/target/files`. No data or config is affected. Rollback: remove the `mount --bind` line; the hang returns on hosts with a second `/proc/kmsg` reader.

## Validation

- Inside the bench: `ls -lL /proc/kmsg` shows the character device `1, 3`; `logread | grep -c 'kernel:'` prints `0`; `ubus -t 5 call log read '{"lines":1}'` returns instead of `Request timed out`; `top` shows logd idle.
- The CI probe of PR #129 before the mask: `logd` with `wchan=syslog_print` and a `/proc/kmsg` descriptor, `ubus call log read` timing out (run 40187963300). After the mask: the same probe (150 traffic iterations) and the full check pass in run 40189248668, with `rsyslogd` still holding `/proc/kmsg` on the runner; inside the bench `/proc/kmsg` is `1, 3`, logd is in `ep_poll`, the log has 0 `kernel:` lines.
- `make dataplane-check` on the owner's bench passes with the mask.

## Links

- [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md): the bench runs procd from `stand-init`;
- [ADR-0054](./ADR-0054-run-ci-checks-as-parallel-jobs-behind-a-summary-job.md): job and step timeouts, the host-side deadline of the check;
- [`.devcontainer/target/files/usr/bin/stand-init`](../../.devcontainer/target/files/usr/bin/stand-init), [`.devcontainer/dataplane-check.sh`](../../.devcontainer/dataplane-check.sh);
- ubox `log/syslog.c` (`klog_open`, `klog_cb`) and `log/logd.c` (`read_log`): https://github.com/openwrt/ubox/tree/master/log;
- Linux `fs/proc/kmsg.c` (`kmsg_read`) and `kernel/printk/printk.c` (`syslog_print`, `SYSLOG_ACTION_SIZE_UNREAD`): https://github.com/torvalds/linux/blob/v6.11/fs/proc/kmsg.c, https://github.com/torvalds/linux/blob/v6.11/kernel/printk/printk.c;
- GitHub issue #122; PR #129; runs 40116156272, 40134718809, 40181241418 (hung), 40186777234, 40187963300 (probe).
