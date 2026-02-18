use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Arena-allocated Linked List
//
// Nodes live in a Vec (arena). Indices are used instead of pointers, which
// maps naturally to the flat-buffer serialization we send across the WASM
// boundary.  Deleted slots are recycled via a free-list so the arena stays
// compact.
// ---------------------------------------------------------------------------

const NULL: u32 = u32::MAX;

#[derive(Clone, Copy)]
struct Node {
    value: u32,
    next: u32, // index into arena, or NULL
    alive: bool,
}

/// Per-operation traversal step recorded for the UI to animate.
/// Each step is (node_index, action).
///   action: 0 = visit, 1 = insert, 2 = delete, 3 = found
#[derive(Clone, Copy)]
struct Step {
    index: u32,
    action: u8,
}

#[wasm_bindgen]
pub struct LinkedList {
    arena: Vec<Node>,
    head: u32,
    len: u32,
    free: Vec<u32>,
    traversal: Vec<Step>,
}

#[wasm_bindgen]
impl LinkedList {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            arena: Vec::new(),
            head: NULL,
            len: 0,
            free: Vec::new(),
            traversal: Vec::new(),
        }
    }

    // -- Mutations -----------------------------------------------------------

    /// Push a value to the front of the list.
    pub fn push_front(&mut self, value: u32) {
        self.traversal.clear();
        let idx = self.alloc(value);
        self.arena[idx as usize].next = self.head;
        self.head = idx;
        self.len += 1;
        self.traversal.push(Step { index: idx, action: 1 });
    }

    /// Insert a value in sorted (ascending) order.
    pub fn insert_sorted(&mut self, value: u32) {
        self.traversal.clear();
        let new_idx = self.alloc(value);

        // Empty list or insert before head
        if self.head == NULL || self.arena[self.head as usize].value >= value {
            if self.head != NULL {
                self.traversal.push(Step { index: self.head, action: 0 });
            }
            self.arena[new_idx as usize].next = self.head;
            self.head = new_idx;
            self.len += 1;
            self.traversal.push(Step { index: new_idx, action: 1 });
            return;
        }

        let mut cur = self.head;
        while cur != NULL {
            self.traversal.push(Step { index: cur, action: 0 });
            let next = self.arena[cur as usize].next;
            if next == NULL || self.arena[next as usize].value >= value {
                // Insert after cur
                self.arena[new_idx as usize].next = next;
                self.arena[cur as usize].next = new_idx;
                self.len += 1;
                self.traversal.push(Step { index: new_idx, action: 1 });
                return;
            }
            cur = next;
        }
    }

    /// Delete the first occurrence of `value`. Returns true if found.
    pub fn delete(&mut self, value: u32) -> bool {
        self.traversal.clear();
        if self.head == NULL {
            return false;
        }

        // Head deletion
        if self.arena[self.head as usize].value == value {
            self.traversal.push(Step { index: self.head, action: 2 });
            let old_head = self.head;
            self.head = self.arena[old_head as usize].next;
            self.release(old_head);
            self.len -= 1;
            return true;
        }

        let mut prev = self.head;
        let mut cur = self.arena[self.head as usize].next;
        self.traversal.push(Step { index: prev, action: 0 });

        while cur != NULL {
            if self.arena[cur as usize].value == value {
                self.traversal.push(Step { index: cur, action: 2 });
                self.arena[prev as usize].next = self.arena[cur as usize].next;
                self.release(cur);
                self.len -= 1;
                return true;
            }
            self.traversal.push(Step { index: cur, action: 0 });
            prev = cur;
            cur = self.arena[cur as usize].next;
        }
        false
    }

    /// Search for a value. Returns the arena index or NULL.
    pub fn search(&mut self, value: u32) -> u32 {
        self.traversal.clear();
        let mut cur = self.head;
        while cur != NULL {
            if self.arena[cur as usize].value == value {
                self.traversal.push(Step { index: cur, action: 3 });
                return cur;
            }
            self.traversal.push(Step { index: cur, action: 0 });
            cur = self.arena[cur as usize].next;
        }
        NULL
    }

    /// Clear the entire list.
    pub fn clear(&mut self) {
        self.traversal.clear();
        self.arena.clear();
        self.free.clear();
        self.head = NULL;
        self.len = 0;
    }

    /// Generate a random list of `count` elements.
    pub fn generate_random(&mut self, count: u32, max_value: u32) {
        self.clear();
        for _ in 0..count {
            let v = (rand::random::<u32>()) % max_value;
            self.push_front(v);
        }
    }

    /// Sort the list in ascending order (bottom-up merge sort, O(n log n)).
    pub fn sort(&mut self) {
        self.traversal.clear();
        if self.len <= 1 {
            return;
        }

        // Bottom-up merge sort operating directly on arena next-pointers.
        let mut step_size: u32 = 1;
        while step_size < self.len {
            let mut prev = NULL;
            let mut cur = self.head;

            while cur != NULL {
                // Split off the left run of `step_size` nodes.
                let mut left = cur;
                let mut left_size = step_size;
                let mut right = cur;
                for _ in 0..step_size {
                    if right == NULL { break; }
                    right = self.arena[right as usize].next;
                }
                let mut right_size = step_size;

                // Merge left and right runs.
                while (left_size > 0 && left != NULL)
                    || (right_size > 0 && right != NULL)
                {
                    let pick_left = if left_size == 0 || left == NULL {
                        false
                    } else if right_size == 0 || right == NULL {
                        true
                    } else {
                        self.arena[left as usize].value
                            <= self.arena[right as usize].value
                    };

                    let chosen;
                    if pick_left {
                        chosen = left;
                        left = self.arena[left as usize].next;
                        left_size -= 1;
                    } else {
                        chosen = right;
                        right = self.arena[right as usize].next;
                        right_size -= 1;
                    }

                    if prev == NULL {
                        self.head = chosen;
                    } else {
                        self.arena[prev as usize].next = chosen;
                    }
                    prev = chosen;
                }
                cur = right;
            }
            if prev != NULL {
                self.arena[prev as usize].next = NULL;
            }
            step_size *= 2;
        }

        // Record traversal: walk the now-sorted list so UI can animate.
        let mut c = self.head;
        while c != NULL {
            self.traversal.push(Step { index: c, action: 1 });
            c = self.arena[c as usize].next;
        }
    }

    // -- Queries -------------------------------------------------------------

    pub fn length(&self) -> u32 {
        self.len
    }

    /// Snapshot the full list state as a flat Uint32Array.
    ///
    /// Layout:
    ///   [total_nodes, head_index, arena_base_ptr, node_size,
    ///    arena_len, (value, next, alive)×arena_len,
    ///    traversal_len, (index, action)×traversal_len ]
    ///
    /// All values are u32.  `alive` is 0 or 1.
    /// `arena_base_ptr` is the real WASM linear memory address of the arena.
    /// `node_size` is `size_of::<Node>()` in bytes.
    pub fn snapshot(&self) -> Vec<u32> {
        let arena_len = self.arena.len();
        let trav_len = self.traversal.len();
        // 4 header + 3*arena + 1 + 2*trav
        let cap = 4 + 3 * arena_len + 1 + 2 * trav_len;
        let mut buf = Vec::with_capacity(cap);

        // Header
        buf.push(self.len);
        buf.push(self.head);
        buf.push(if arena_len > 0 {
            self.arena.as_ptr() as u32
        } else {
            0
        });
        buf.push(std::mem::size_of::<Node>() as u32);

        // Arena
        buf.push(arena_len as u32);
        for node in &self.arena {
            buf.push(node.value);
            buf.push(node.next);
            buf.push(node.alive as u32);
        }

        // Traversal
        buf.push(trav_len as u32);
        for step in &self.traversal {
            buf.push(step.index);
            buf.push(step.action as u32);
        }

        buf
    }

    // -- Internal helpers ----------------------------------------------------

    fn alloc(&mut self, value: u32) -> u32 {
        if let Some(idx) = self.free.pop() {
            self.arena[idx as usize] = Node {
                value,
                next: NULL,
                alive: true,
            };
            idx
        } else {
            let idx = self.arena.len() as u32;
            self.arena.push(Node {
                value,
                next: NULL,
                alive: true,
            });
            idx
        }
    }

    fn release(&mut self, idx: u32) {
        self.arena[idx as usize].alive = false;
        self.free.push(idx);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_and_length() {
        let mut ll = LinkedList::new();
        ll.push_front(10);
        ll.push_front(20);
        ll.push_front(30);
        assert_eq!(ll.length(), 3);
    }

    #[test]
    fn insert_sorted_order() {
        let mut ll = LinkedList::new();
        ll.insert_sorted(30);
        ll.insert_sorted(10);
        ll.insert_sorted(20);
        // Should be 10 -> 20 -> 30
        let snap = ll.snapshot();
        let head = snap[1] as usize;
        let arena_start = 5; // after header(4) + arena_len(1)
        let first_val = snap[arena_start + head * 3];
        assert_eq!(first_val, 10);
    }

    #[test]
    fn delete_value() {
        let mut ll = LinkedList::new();
        ll.push_front(10);
        ll.push_front(20);
        ll.push_front(30);
        assert!(ll.delete(20));
        assert_eq!(ll.length(), 2);
        assert!(!ll.delete(99));
    }

    #[test]
    fn sort_list() {
        let mut ll = LinkedList::new();
        ll.push_front(5);
        ll.push_front(1);
        ll.push_front(4);
        ll.push_front(2);
        ll.push_front(3);
        ll.sort();
        // Walk and collect values
        let mut vals = Vec::new();
        let mut c = ll.head;
        while c != NULL {
            vals.push(ll.arena[c as usize].value);
            c = ll.arena[c as usize].next;
        }
        assert_eq!(vals, vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn sort_large() {
        let mut ll = LinkedList::new();
        ll.generate_random(1000, 9999);
        ll.sort();
        let mut prev = 0;
        let mut c = ll.head;
        let mut count = 0;
        while c != NULL {
            let v = ll.arena[c as usize].value;
            assert!(v >= prev, "not sorted: {} after {}", v, prev);
            prev = v;
            c = ll.arena[c as usize].next;
            count += 1;
        }
        assert_eq!(count, 1000);
    }

    #[test]
    fn search_found_and_not_found() {
        let mut ll = LinkedList::new();
        ll.push_front(42);
        assert_ne!(ll.search(42), NULL);
        assert_eq!(ll.search(99), NULL);
    }
}
