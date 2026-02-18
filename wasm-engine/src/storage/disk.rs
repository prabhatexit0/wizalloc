use crate::storage::types::*;

/// Manages a contiguous byte array that acts as "disk" storage.
///
/// Each page is a fixed-size slice of the storage vector.  A free-list
/// tracks deallocated pages for reuse.  I/O counters let the UI display
/// read/write statistics.
pub struct DiskManager {
    /// The "disk" — a pre-allocated byte buffer.
    storage: Vec<u8>,
    /// Which pages are currently allocated (true = in use).
    allocated: Vec<bool>,
    /// Free page IDs available for reuse.
    free_list: Vec<PageId>,
    /// Total number of pages currently allocated.
    num_allocated: u32,
    /// Bytes per page.
    page_size: u32,
    /// Maximum number of pages the disk can hold.
    max_pages: u32,
    /// Cumulative I/O counters.
    pub read_count: u64,
    pub write_count: u64,
}

impl DiskManager {
    pub fn new(page_size: u32, max_pages: u32) -> Self {
        let total_bytes = page_size as usize * max_pages as usize;
        Self {
            storage: vec![0u8; total_bytes],
            allocated: vec![false; max_pages as usize],
            free_list: Vec::new(),
            num_allocated: 0,
            page_size,
            max_pages,
            read_count: 0,
            write_count: 0,
        }
    }

    /// Allocate a fresh page, returning its ID.  Returns `None` if disk is full.
    pub fn allocate_page(&mut self) -> Option<PageId> {
        // Try free list first
        if let Some(pid) = self.free_list.pop() {
            self.allocated[pid as usize] = true;
            self.num_allocated += 1;
            // Zero out the page
            let offset = self.page_offset(pid);
            self.storage[offset..offset + self.page_size as usize].fill(0);
            return Some(pid);
        }
        // Linear scan for an unallocated page
        for i in 0..self.max_pages {
            if !self.allocated[i as usize] {
                self.allocated[i as usize] = true;
                self.num_allocated += 1;
                let offset = self.page_offset(i);
                self.storage[offset..offset + self.page_size as usize].fill(0);
                return Some(i);
            }
        }
        None // disk full
    }

    /// Deallocate a page, returning it to the free list.
    pub fn deallocate_page(&mut self, page_id: PageId) {
        if (page_id as usize) < self.allocated.len() && self.allocated[page_id as usize] {
            self.allocated[page_id as usize] = false;
            self.num_allocated -= 1;
            self.free_list.push(page_id);
        }
    }

    /// Read a page from "disk" into the provided buffer.
    pub fn read_page(&mut self, page_id: PageId, buf: &mut [u8]) {
        let offset = self.page_offset(page_id);
        let size = self.page_size as usize;
        buf[..size].copy_from_slice(&self.storage[offset..offset + size]);
        self.read_count += 1;
    }

    /// Write buffer contents to a page on "disk".
    pub fn write_page(&mut self, page_id: PageId, data: &[u8]) {
        let offset = self.page_offset(page_id);
        let size = self.page_size as usize;
        self.storage[offset..offset + size].copy_from_slice(&data[..size]);
        self.write_count += 1;
    }

    /// Is the page allocated?
    pub fn is_allocated(&self, page_id: PageId) -> bool {
        (page_id as usize) < self.allocated.len() && self.allocated[page_id as usize]
    }

    // ── Accessors ──────────────────────────────────────────────────

    pub fn page_size(&self) -> u32 {
        self.page_size
    }

    pub fn max_pages(&self) -> u32 {
        self.max_pages
    }

    pub fn num_allocated(&self) -> u32 {
        self.num_allocated
    }

    /// Base pointer of the disk storage in WASM linear memory.
    pub fn storage_base_ptr(&self) -> usize {
        self.storage.as_ptr() as usize
    }

    /// Total storage size in bytes.
    pub fn storage_size(&self) -> usize {
        self.storage.len()
    }

    /// Direct read-only access to a page's bytes on disk (for snapshots).
    pub fn page_data(&self, page_id: PageId) -> &[u8] {
        let offset = self.page_offset(page_id);
        let size = self.page_size as usize;
        &self.storage[offset..offset + size]
    }

    /// Read-only view of allocation bitmap.
    pub fn allocation_bitmap(&self) -> &[bool] {
        &self.allocated
    }

    // ── Internal ───────────────────────────────────────────────────

    fn page_offset(&self, page_id: PageId) -> usize {
        page_id as usize * self.page_size as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocate_and_read_write() {
        let mut dm = DiskManager::new(64, 16);
        let pid = dm.allocate_page().unwrap();
        assert_eq!(pid, 0);
        assert!(dm.is_allocated(pid));

        // Write some data
        let mut data = vec![0u8; 64];
        data[0] = 0xAB;
        data[63] = 0xCD;
        dm.write_page(pid, &data);
        assert_eq!(dm.write_count, 1);

        // Read it back
        let mut buf = vec![0u8; 64];
        dm.read_page(pid, &mut buf);
        assert_eq!(buf[0], 0xAB);
        assert_eq!(buf[63], 0xCD);
        assert_eq!(dm.read_count, 1);
    }

    #[test]
    fn deallocate_and_reuse() {
        let mut dm = DiskManager::new(64, 4);
        let p0 = dm.allocate_page().unwrap();
        let p1 = dm.allocate_page().unwrap();
        assert_eq!(dm.num_allocated(), 2);

        dm.deallocate_page(p0);
        assert_eq!(dm.num_allocated(), 1);
        assert!(!dm.is_allocated(p0));

        // Reuse freed page
        let p2 = dm.allocate_page().unwrap();
        assert_eq!(p2, p0); // free list reuse
    }

    #[test]
    fn disk_full() {
        let mut dm = DiskManager::new(64, 2);
        assert!(dm.allocate_page().is_some());
        assert!(dm.allocate_page().is_some());
        assert!(dm.allocate_page().is_none()); // full
    }
}
