/**
 * Indexed binary min-heap over node ids 0..capacity-1 with decrease-key.
 * Ordering: lower f, then lower h, then lower node id (deterministic tie-breaking).
 * Keys live in caller-owned Float64Arrays so the heap itself never allocates per push.
 */
export class IndexedMinHeap {
  private readonly heap: Int32Array
  private readonly pos: Int32Array
  private n = 0

  constructor(
    capacity: number,
    private readonly f: Float64Array,
    private readonly h: Float64Array,
  ) {
    this.heap = new Int32Array(capacity)
    this.pos = new Int32Array(capacity).fill(-1)
  }

  get size(): number {
    return this.n
  }

  clear(): void {
    for (let i = 0; i < this.n; i++) this.pos[this.heap[i]!] = -1
    this.n = 0
  }

  contains(id: number): boolean {
    return this.pos[id]! >= 0
  }

  private less(a: number, b: number): boolean {
    const fa = this.f[a]!
    const fb = this.f[b]!
    if (fa !== fb) return fa < fb
    const ha = this.h[a]!
    const hb = this.h[b]!
    if (ha !== hb) return ha < hb
    return a < b
  }

  push(id: number): void {
    if (this.pos[id]! >= 0) {
      this.decreaseKey(id)
      return
    }
    const i = this.n++
    this.heap[i] = id
    this.pos[id] = i
    this.up(i)
  }

  /** Call after lowering f[id] (and/or h[id]) of a node already in the heap. */
  decreaseKey(id: number): void {
    const i = this.pos[id]!
    if (i >= 0) this.up(i)
  }

  pop(): number {
    if (this.n === 0) return -1
    const top = this.heap[0]!
    this.pos[top] = -1
    const last = this.heap[--this.n]!
    if (this.n > 0) {
      this.heap[0] = last
      this.pos[last] = 0
      this.down(0)
    }
    return top
  }

  private up(i: number): void {
    const heap = this.heap
    const pos = this.pos
    const id = heap[i]!
    while (i > 0) {
      const p = (i - 1) >> 1
      const pid = heap[p]!
      if (!this.less(id, pid)) break
      heap[i] = pid
      pos[pid] = i
      i = p
    }
    heap[i] = id
    pos[id] = i
  }

  private down(i: number): void {
    const heap = this.heap
    const pos = this.pos
    const n = this.n
    const id = heap[i]!
    for (;;) {
      const l = 2 * i + 1
      if (l >= n) break
      const r = l + 1
      let c = l
      if (r < n && this.less(heap[r]!, heap[l]!)) c = r
      const cid = heap[c]!
      if (!this.less(cid, id)) break
      heap[i] = cid
      pos[cid] = i
      i = c
    }
    heap[i] = id
    pos[id] = i
  }
}
