/** Size of the connection snapshot for manual load testing; 0 means the snapshot from the device as is. */
declare const __METABOX_MOCK_CONNECTIONS__: number;

/** A main-thread task the browser reported, in page time. */
interface LongTaskRecord {
  startTime: number;
  duration: number;
  /** Scripts of a long animation frame; empty for a long task. */
  scripts: string[];
}

/**
 * A connection load an end-to-end scenario sets before the page loads: the mock entry then feeds
 * the runtime stream itself and records long tasks, and the scenario reads the record back.
 */
interface ConnectionLoad {
  connections: number;
  rules: number;
  /** How many frames to serialize in advance: the stream stops after the last one. */
  frames: number;
  sent: number;
  longTasks: LongTaskRecord[];
  longFrames: LongTaskRecord[];
  flush: () => void;
}

interface Window {
  __METABOX_CONNECTION_LOAD__?: ConnectionLoad;
}
