//! Buffer Pool Manager + LRU Replacer.
//!
//! The buffer pool sits between the "query engine" and the disk manager.
//! It maintains a fixed number of page-sized frames in memory. When a page
//! is requested, the BPM either returns it from cache (hit) or reads it
//! from disk into a frame (miss), possibly evicting another page first.

use std::collections::{HashMap, VecDeque, HashSet};
use crate::storage::types::*;
use crate::storage::disk::DiskManager;
use crate::storage::page;

// ── LRU Replacer ───────────────────────────────────────────────────

/// Tracks which frames are evictable and picks the least-recently-used one.
pub struct LruReplacer {
    /// LRU order: front = least recent, back = most recent.
    order: VecDeque<FrameId>,
    /// Set of frames that are currently evictable (pin_count == 0).
    evictable: HashSet<FrameId>,
}

impl LruReplacer {
    pub fn new(capacity: usize) -> Self {
        Self {
            order: VecDeque::with_capacity(capacity),
            evictable: HashSet::with_capacity(capacity),
        }
    }

    /// Record that a frame was accessed (move to back = most recent).
    pub fn record_access(&mut self, frame_id: FrameId) {
        self.order.retain(|&f| f != frame_id);
        self.order.push_back(frame_id);
    }

    /// Mark a frame as evictable or not.
    pub fn set_evictable(&mut self, frame_id: FrameId, evictable: bool) {
        if evictable {
            self.evictable.insert(frame_id);
        } else {
            self.evictable.remove(&frame_id);
        }
    }

    /// Evict the least-recently-used evictable frame.
    pub fn evict(&mut self) -> Option<FrameId> {
        // Walk from front (least recent) and find the first evictable frame
        let pos = self.order.iter().position(|f| self.evictable.contains(f))?;
        let frame_id = self.order.remove(pos).unwrap();
        self.evictable.remove(&frame_id);
        Some(frame_id)
    }

    /// Remove a frame from the replacer entirely (e.g., when page is deleted).
    pub fn remove(&mut self, frame_id: FrameId) {
        self.order.retain(|&f| f != frame_id);
        self.evictable.remove(&frame_id);
    }

    /// Number of evictable frames.
    pub fn size(&self) -> usize {
        self.evictable.len()
    }

    /// LRU order (front=least recent) for visualization.
    pub fn lru_order(&self) -> &VecDeque<FrameId> {
        &self.order
    }
}

// ── Frame ──────────────────────────────────────────────────────────

/// One frame in the buffer pool.
pub struct Frame {
    /// Raw page data.
    pub data: Vec<u8>,
    /// Which disk page is loaded here, or None if the frame is empty.
    pub page_id: Option<PageId>,
    /// Number of active users holding this frame.
    pub pin_count: u32,
    /// Has the page been modified since it was read from disk?
    pub is_dirty: bool,
}

// ── Buffer Pool Manager ────────────────────────────────────────────

pub struct BufferPoolManager {
    /// Fixed array of frames.
    pub frames: Vec<Frame>,
    /// Mapping from page_id → frame index.
    page_table: HashMap<PageId, FrameId>,
    /// Indices of empty (unused) frames.
    free_list: Vec<FrameId>,
    /// LRU eviction policy.
    replacer: LruReplacer,
    /// Underlying disk storage.
    pub disk: DiskManager,
    /// Page size in bytes.
    page_size: u32,
    // ── Stats ──
    pub hit_count: u64,
    pub miss_count: u64,
}

impl BufferPoolManager {
    pub fn new(pool_size: u32, disk: DiskManager) -> Self {
        let page_size = disk.page_size();
        let mut frames = Vec::with_capacity(pool_size as usize);
        let mut free_list = Vec::with_capacity(pool_size as usize);

        for i in 0..pool_size {
            frames.push(Frame {
                data: vec![0u8; page_size as usize],
                page_id: None,
                pin_count: 0,
                is_dirty: false,
            });
            free_list.push(i);
        }
        // Reverse so we pop from the front (frame 0 first)
        free_list.reverse();

        Self {
            frames,
            page_table: HashMap::new(),
            free_list,
            replacer: LruReplacer::new(pool_size as usize),
            disk,
            page_size,
            hit_count: 0,
            miss_count: 0,
        }
    }

    /// Fetch a page into the buffer pool. Returns the frame index.
    ///
    /// If the page is already in the pool, returns it (cache hit).
    /// Otherwise, finds a free frame or evicts one (cache miss).
    /// The returned frame is pinned (pin_count incremented).
    pub fn fetch_page(&mut self, page_id: PageId) -> Option<FrameId> {
        // Cache hit?
        if let Some(&frame_id) = self.page_table.get(&page_id) {
            self.frames[frame_id as usize].pin_count += 1;
            self.replacer.set_evictable(frame_id, false);
            self.replacer.record_access(frame_id);
            self.hit_count += 1;
            return Some(frame_id);
        }

        // Cache miss — need a frame
        self.miss_count += 1;
        let frame_id = self.get_free_frame()?;

        // Read page from disk into frame
        self.disk.read_page(page_id, &mut self.frames[frame_id as usize].data);
        self.frames[frame_id as usize].page_id = Some(page_id);
        self.frames[frame_id as usize].pin_count = 1;
        self.frames[frame_id as usize].is_dirty = false;
        self.page_table.insert(page_id, frame_id);
        self.replacer.record_access(frame_id);
        self.replacer.set_evictable(frame_id, false);

        Some(frame_id)
    }

    /// Allocate a new page on disk and bring it into the buffer pool.
    /// Returns (page_id, frame_id).
    pub fn new_page(&mut self) -> Option<(PageId, FrameId)> {
        let page_id = self.disk.allocate_page()?;
        let frame_id = self.get_free_frame()?;

        // Initialize the frame
        self.frames[frame_id as usize].data.fill(0);
        page::page_init(
            &mut self.frames[frame_id as usize].data,
            page_id,
            PageType::Data,
        );
        self.frames[frame_id as usize].page_id = Some(page_id);
        self.frames[frame_id as usize].pin_count = 1;
        self.frames[frame_id as usize].is_dirty = true; // new page needs to be written
        self.page_table.insert(page_id, frame_id);
        self.replacer.record_access(frame_id);
        self.replacer.set_evictable(frame_id, false);

        Some((page_id, frame_id))
    }

    /// Decrement pin count. Mark dirty if the caller modified the page.
    /// When pin_count reaches 0, the frame becomes evictable.
    pub fn unpin_page(&mut self, page_id: PageId, is_dirty: bool) -> bool {
        let Some(&frame_id) = self.page_table.get(&page_id) else {
            return false;
        };
        let frame = &mut self.frames[frame_id as usize];
        if frame.pin_count == 0 {
            return false;
        }
        frame.pin_count -= 1;
        if is_dirty {
            frame.is_dirty = true;
        }
        if frame.pin_count == 0 {
            self.replacer.set_evictable(frame_id, true);
        }
        true
    }

    /// Write a dirty page back to disk.
    pub fn flush_page(&mut self, page_id: PageId) -> bool {
        let Some(&frame_id) = self.page_table.get(&page_id) else {
            return false;
        };
        let frame = &self.frames[frame_id as usize];
        self.disk.write_page(page_id, &frame.data);
        self.frames[frame_id as usize].is_dirty = false;
        true
    }

    /// Delete a page from both the pool and disk.
    pub fn delete_page(&mut self, page_id: PageId) -> bool {
        if let Some(&frame_id) = self.page_table.get(&page_id) {
            let frame = &self.frames[frame_id as usize];
            if frame.pin_count > 0 {
                return false; // can't delete a pinned page
            }
            self.page_table.remove(&page_id);
            self.replacer.remove(frame_id);
            self.frames[frame_id as usize].page_id = None;
            self.frames[frame_id as usize].is_dirty = false;
            self.frames[frame_id as usize].pin_count = 0;
            self.free_list.push(frame_id);
        }
        self.disk.deallocate_page(page_id);
        true
    }

    /// Flush all dirty pages to disk.
    pub fn flush_all(&mut self) {
        let page_ids: Vec<PageId> = self.page_table.keys().copied().collect();
        for page_id in page_ids {
            let frame_id = self.page_table[&page_id];
            if self.frames[frame_id as usize].is_dirty {
                self.flush_page(page_id);
            }
        }
    }

    // ── Accessors ──────────────────────────────────────────────────

    pub fn pool_size(&self) -> usize {
        self.frames.len()
    }

    pub fn page_size(&self) -> u32 {
        self.page_size
    }

    /// Get the frame data for a frame that's already fetched.
    pub fn frame_data(&self, frame_id: FrameId) -> &[u8] {
        &self.frames[frame_id as usize].data
    }

    /// Get mutable frame data for a frame that's already fetched.
    pub fn frame_data_mut(&mut self, frame_id: FrameId) -> &mut [u8] {
        &mut self.frames[frame_id as usize].data
    }

    /// Look up which frame holds a page (if any).
    pub fn page_to_frame(&self, page_id: PageId) -> Option<FrameId> {
        self.page_table.get(&page_id).copied()
    }

    pub fn page_table(&self) -> &HashMap<PageId, FrameId> {
        &self.page_table
    }

    pub fn replacer(&self) -> &LruReplacer {
        &self.replacer
    }

    pub fn hit_rate(&self) -> f64 {
        let total = self.hit_count + self.miss_count;
        if total == 0 { 0.0 } else { self.hit_count as f64 / total as f64 }
    }

    // ── Internal ───────────────────────────────────────────────────

    /// Find a free frame, evicting if necessary.
    fn get_free_frame(&mut self) -> Option<FrameId> {
        // Try free list first
        if let Some(frame_id) = self.free_list.pop() {
            return Some(frame_id);
        }

        // Evict via LRU
        let frame_id = self.replacer.evict()?;
        let frame = &self.frames[frame_id as usize];
        let old_page_id = frame.page_id?;

        // Flush if dirty
        if frame.is_dirty {
            self.disk.write_page(old_page_id, &frame.data);
            self.frames[frame_id as usize].is_dirty = false;
        }

        // Remove old mapping
        self.page_table.remove(&old_page_id);
        self.frames[frame_id as usize].page_id = None;

        Some(frame_id)
    }
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_bpm(pool_size: u32, disk_pages: u32) -> BufferPoolManager {
        let dm = DiskManager::new(64, disk_pages);
        BufferPoolManager::new(pool_size, dm)
    }

    #[test]
    fn new_page_and_fetch() {
        let mut bpm = make_bpm(4, 16);

        let (pid, fid) = bpm.new_page().unwrap();
        assert_eq!(pid, 0);
        assert_eq!(bpm.frames[fid as usize].pin_count, 1);
        assert!(bpm.frames[fid as usize].is_dirty);

        // Unpin and flush
        bpm.unpin_page(pid, false);
        bpm.flush_page(pid);

        // Fetch should be a cache hit
        let fid2 = bpm.fetch_page(pid).unwrap();
        assert_eq!(fid, fid2);
        assert_eq!(bpm.hit_count, 1);
        bpm.unpin_page(pid, false);
    }

    #[test]
    fn eviction() {
        let mut bpm = make_bpm(2, 16); // only 2 frames

        let (p0, _) = bpm.new_page().unwrap();
        let (p1, _) = bpm.new_page().unwrap();
        bpm.unpin_page(p0, true);
        bpm.unpin_page(p1, false);

        // Pool is full. Allocating a third page should evict p0 (LRU).
        let (p2, _) = bpm.new_page().unwrap();
        assert!(bpm.page_to_frame(p0).is_none()); // evicted
        assert!(bpm.page_to_frame(p2).is_some());
        bpm.unpin_page(p2, false);

        // p0 was dirty → should have been flushed to disk during eviction
        // Fetch p0 from disk (miss — it was evicted)
        let _fid = bpm.fetch_page(p0).unwrap();
        assert_eq!(bpm.miss_count, 1); // only the fetch_page is a miss; new_page doesn't count
        assert_eq!(bpm.disk.read_count, 1); // one disk read to reload p0
        bpm.unpin_page(p0, false);
    }

    #[test]
    fn pin_prevents_eviction() {
        let mut bpm = make_bpm(2, 16);

        let (p0, _) = bpm.new_page().unwrap();
        let (p1, _) = bpm.new_page().unwrap();
        // Don't unpin p0 — it stays pinned
        bpm.unpin_page(p1, false);

        // New page should evict p1 (the only unpinned one), not p0
        let (p2, _) = bpm.new_page().unwrap();
        assert!(bpm.page_to_frame(p0).is_some()); // still here (pinned)
        assert!(bpm.page_to_frame(p1).is_none()); // evicted
        assert!(bpm.page_to_frame(p2).is_some());
        bpm.unpin_page(p0, false);
        bpm.unpin_page(p2, false);
    }

    #[test]
    fn all_pinned_no_eviction() {
        let mut bpm = make_bpm(2, 16);

        let (p0, _) = bpm.new_page().unwrap();
        let (p1, _) = bpm.new_page().unwrap();
        // Both pinned — can't evict anything

        assert!(bpm.new_page().is_none());
        bpm.unpin_page(p0, false);
        bpm.unpin_page(p1, false);
    }

    #[test]
    fn delete_page() {
        let mut bpm = make_bpm(4, 16);

        let (pid, _) = bpm.new_page().unwrap();
        bpm.unpin_page(pid, false);

        assert!(bpm.delete_page(pid));
        assert!(bpm.page_to_frame(pid).is_none());
        assert!(!bpm.disk.is_allocated(pid));
    }

    #[test]
    fn lru_replacer_order() {
        let mut r = LruReplacer::new(4);
        r.record_access(0);
        r.record_access(1);
        r.record_access(2);
        r.set_evictable(0, true);
        r.set_evictable(1, true);
        r.set_evictable(2, true);

        // Should evict 0 (least recent)
        assert_eq!(r.evict(), Some(0));
        assert_eq!(r.evict(), Some(1));
        assert_eq!(r.evict(), Some(2));
        assert_eq!(r.evict(), None);
    }

    #[test]
    fn lru_access_reorder() {
        let mut r = LruReplacer::new(4);
        r.record_access(0);
        r.record_access(1);
        r.record_access(2);
        r.set_evictable(0, true);
        r.set_evictable(1, true);
        r.set_evictable(2, true);

        // Touch 0 again — now 1 is LRU
        r.record_access(0);
        assert_eq!(r.evict(), Some(1));
    }
}
