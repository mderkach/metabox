import type { EntryWire } from '../api/Log.schema';

/**
 * The log stream in jsdom: there is no `EventSource` there. The stand-in remembers open streams
 * so that the test sends lines to the last one and sees what level it was opened with.
 */
const READY_STATE = { Connecting: 0, Open: 1, Closed: 2 } as const;

export class FakeLogSource {
  static readonly CONNECTING = READY_STATE.Connecting;
  static readonly OPEN = READY_STATE.Open;
  static readonly CLOSED = READY_STATE.Closed;
  static opened: FakeLogSource[] = [];

  readonly url: string;
  readyState: number = FakeLogSource.CONNECTING;
  closed = false;
  private readonly listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeLogSource.opened.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    const set = this.listeners.get(type) ?? new Set();

    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeLogSource.CLOSED;
  }

  emit(type: string, data = ''): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(new MessageEvent(type, { data }));
    }
  }

  open(): void {
    this.readyState = FakeLogSource.OPEN;
    this.emit('open');
  }

  /** A failure after which the browser does not reconnect by itself: the response is not 200. */
  refuse(): void {
    this.readyState = FakeLogSource.CLOSED;
    this.emit('error');
  }

  /** A log line in the daemon envelope. */
  line(seq: number, message: string, level = 'info'): void {
    this.send(seq, { level, message });
  }

  /** A line in the daemon shape as is: no level, with a timestamp. */
  send(seq: number, entry: EntryWire): void {
    this.emit('log', JSON.stringify({ seq, entry }));
  }

  static last(): FakeLogSource {
    const source = FakeLogSource.opened.at(-1);

    if (source === undefined) {
      throw new Error('Поток лога не открыт');
    }

    return source;
  }
}
