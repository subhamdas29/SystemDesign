/**
 * Deterministic Priority Queue implemented as a binary min-heap.
 * Keyed by (timeMs, sequenceNumber) so simultaneous events resolve strictly
 * in creation order.
 */

export interface ScheduledEventItem<T = unknown> {
  timeMs: number;
  sequenceNumber: number;
  data: T;
}

export class PriorityQueue<T = unknown> {
  private heap: ScheduledEventItem<T>[] = [];

  public get size(): number {
    return this.heap.length;
  }

  public get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  public push(timeMs: number, sequenceNumber: number, data: T): void {
    const item: ScheduledEventItem<T> = { timeMs, sequenceNumber, data };
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  public pop(): ScheduledEventItem<T> | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0 && bottom !== undefined) {
      this.heap[0] = bottom;
      this.siftDown(0);
    }
    return top;
  }

  public peek(): ScheduledEventItem<T> | undefined {
    return this.heap[0];
  }

  public clear(): void {
    this.heap = [];
  }

  private compare(a: ScheduledEventItem<T>, b: ScheduledEventItem<T>): number {
    if (a.timeMs !== b.timeMs) {
      return a.timeMs - b.timeMs;
    }
    return a.sequenceNumber - b.sequenceNumber;
  }

  private siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = (current - 1) >> 1;
      const currentItem = this.heap[current]!;
      const parentItem = this.heap[parent]!;

      if (this.compare(currentItem, parentItem) < 0) {
        this.heap[current] = parentItem;
        this.heap[parent] = currentItem;
        current = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let current = index;
    const length = this.heap.length;

    while ((current << 1) + 1 < length) {
      const left = (current << 1) + 1;
      const right = left + 1;
      let smallest = current;

      if (this.compare(this.heap[left]!, this.heap[smallest]!) < 0) {
        smallest = left;
      }

      if (right < length && this.compare(this.heap[right]!, this.heap[smallest]!) < 0) {
        smallest = right;
      }

      if (smallest !== current) {
        const temp = this.heap[current]!;
        this.heap[current] = this.heap[smallest]!;
        this.heap[smallest] = temp;
        current = smallest;
      } else {
        break;
      }
    }
  }
}
