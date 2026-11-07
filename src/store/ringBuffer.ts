/**
 * Bounded ring buffer for time-series metric samples.
 * Maintains flat memory overhead for arbitrarily long simulation runs.
 * Zero React/DOM dependencies; purely serializable items.
 */

export class BoundedRingBuffer<T> {
  private buffer: (T | undefined)[];
  private capacity: number;
  private head: number = 0;
  private count: number = 0;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('RingBuffer capacity must be greater than 0');
    }
    this.capacity = capacity;
    this.buffer = new Array<T | undefined>(capacity);
  }

  /**
   * Pushes a new item into the ring buffer.
   * If capacity is reached, overwrites the oldest item.
   */
  push(item: T): void {
    const index = (this.head + this.count) % this.capacity;
    this.buffer[index] = item;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Overwriting oldest element; advance head
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Returns items in chronological order (oldest to newest).
   */
  toArray(): T[] {
    const result: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      result[i] = this.buffer[idx]!;
    }
    return result;
  }

  /**
   * Current number of elements in the buffer.
   */
  size(): number {
    return this.count;
  }

  /**
   * Maximum capacity of the buffer.
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Clears the buffer.
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(undefined);
  }
}
