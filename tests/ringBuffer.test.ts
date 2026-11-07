import { describe, it, expect } from 'vitest';
import { BoundedRingBuffer } from '../src/store/ringBuffer';

describe('BoundedRingBuffer', () => {
  it('stores elements up to capacity and maintains chronological order', () => {
    const rb = new BoundedRingBuffer<number>(3);
    expect(rb.size()).toBe(0);
    expect(rb.toArray()).toEqual([]);

    rb.push(10);
    rb.push(20);
    expect(rb.size()).toBe(2);
    expect(rb.toArray()).toEqual([10, 20]);

    rb.push(30);
    expect(rb.size()).toBe(3);
    expect(rb.toArray()).toEqual([10, 20, 30]);
  });

  it('overwrites oldest element when capacity is exceeded (wraparound)', () => {
    const rb = new BoundedRingBuffer<string>(3);
    rb.push('A');
    rb.push('B');
    rb.push('C');
    expect(rb.toArray()).toEqual(['A', 'B', 'C']);

    // Overwrite A with D
    rb.push('D');
    expect(rb.size()).toBe(3);
    expect(rb.toArray()).toEqual(['B', 'C', 'D']);

    // Overwrite B with E
    rb.push('E');
    expect(rb.size()).toBe(3);
    expect(rb.toArray()).toEqual(['C', 'D', 'E']);
  });

  it('resets cleanly on clear', () => {
    const rb = new BoundedRingBuffer<number>(4);
    rb.push(1);
    rb.push(2);
    rb.clear();
    expect(rb.size()).toBe(0);
    expect(rb.toArray()).toEqual([]);

    rb.push(99);
    expect(rb.toArray()).toEqual([99]);
  });
});
