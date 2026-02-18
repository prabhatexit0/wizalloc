//! Overflow page management.
//!
//! When a variable-length value exceeds the overflow threshold, it is stored
//! across one or more overflow pages.  Each overflow page has a small header:
//!
//! ```text
//! ┌──────────────────────────────────────────────┐
//! │ PAGE HEADER (16 bytes, page_type = Overflow)  │
//! ├──────────────────────────────────────────────┤
//! │ data_length : u16  (bytes used in this page)  │
//! ├──────────────────────────────────────────────┤
//! │ payload data (up to page_size - 18 bytes)     │
//! └──────────────────────────────────────────────┘
//! ```
//!
//! The `next_page_id` field in the standard page header chains overflow pages.

use crate::storage::types::*;
use crate::storage::page;
use crate::storage::schema::OverflowPointer;
use crate::storage::buffer_pool::BufferPoolManager;

/// Bytes reserved for the overflow-specific header (just the data_length u16).
const OVERFLOW_DATA_OFFSET: usize = PAGE_HEADER_SIZE + 2;

/// Max payload per overflow page.
fn overflow_payload_capacity(page_size: u32) -> usize {
    page_size as usize - OVERFLOW_DATA_OFFSET
}

/// Write a large value across one or more overflow pages.
/// Returns the overflow pointer to embed in the tuple.
pub fn write_overflow(bpm: &mut BufferPoolManager, data: &[u8]) -> Option<OverflowPointer> {
    let total_len = data.len() as u32;
    let cap = overflow_payload_capacity(bpm.page_size());
    let mut remaining = data;
    let mut first_page_id: Option<PageId> = None;
    let mut prev_page_id: Option<PageId> = None;

    while !remaining.is_empty() {
        let (page_id, frame_id) = bpm.new_page()?;

        // Initialize as overflow page
        page::page_init(
            &mut bpm.frames[frame_id as usize].data,
            page_id,
            PageType::Overflow,
        );

        let chunk_len = remaining.len().min(cap);
        let chunk = &remaining[..chunk_len];

        // Write data_length
        let frame_data = &mut bpm.frames[frame_id as usize].data;
        frame_data[PAGE_HEADER_SIZE] = (chunk_len as u16).to_le_bytes()[0];
        frame_data[PAGE_HEADER_SIZE + 1] = (chunk_len as u16).to_le_bytes()[1];

        // Write payload
        frame_data[OVERFLOW_DATA_OFFSET..OVERFLOW_DATA_OFFSET + chunk_len]
            .copy_from_slice(chunk);

        bpm.unpin_page(page_id, true);

        if first_page_id.is_none() {
            first_page_id = Some(page_id);
        }

        // Link previous overflow page to this one
        if let Some(prev) = prev_page_id {
            let prev_fid = bpm.fetch_page(prev)?;
            page::set_next_page(&mut bpm.frames[prev_fid as usize].data, page_id);
            bpm.unpin_page(prev, true);
        }

        prev_page_id = Some(page_id);
        remaining = &remaining[chunk_len..];
    }

    first_page_id.map(|pid| OverflowPointer {
        page_id: pid,
        total_len: total_len,
    })
}

/// Read an overflow value by following the chain.
pub fn read_overflow(bpm: &mut BufferPoolManager, ptr: &OverflowPointer) -> Option<Vec<u8>> {
    let mut result = Vec::with_capacity(ptr.total_len as usize);
    let mut current_page = ptr.page_id;

    while current_page != INVALID_PAGE {
        let frame_id = bpm.fetch_page(current_page)?;
        let frame_data = bpm.frame_data(frame_id);

        let data_len = u16::from_le_bytes([
            frame_data[PAGE_HEADER_SIZE],
            frame_data[PAGE_HEADER_SIZE + 1],
        ]) as usize;

        result.extend_from_slice(&frame_data[OVERFLOW_DATA_OFFSET..OVERFLOW_DATA_OFFSET + data_len]);

        let next = page::next_page(frame_data);
        bpm.unpin_page(current_page, false);
        current_page = next;
    }

    Some(result)
}

/// Delete all overflow pages in a chain.
pub fn delete_overflow(bpm: &mut BufferPoolManager, ptr: &OverflowPointer) {
    let mut current_page = ptr.page_id;
    while current_page != INVALID_PAGE {
        if let Some(frame_id) = bpm.fetch_page(current_page) {
            let next = page::next_page(bpm.frame_data(frame_id));
            bpm.unpin_page(current_page, false);
            bpm.delete_page(current_page);
            current_page = next;
        } else {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::disk::DiskManager;

    fn make_bpm(page_size: u32) -> BufferPoolManager {
        let dm = DiskManager::new(page_size, 64);
        BufferPoolManager::new(16, dm)
    }

    #[test]
    fn write_and_read_single_page() {
        let mut bpm = make_bpm(128);
        let data = vec![0xAB; 50]; // fits in one overflow page
        let ptr = write_overflow(&mut bpm, &data).unwrap();
        assert_eq!(ptr.total_len, 50);

        let read_back = read_overflow(&mut bpm, &ptr).unwrap();
        assert_eq!(read_back, data);
    }

    #[test]
    fn write_and_read_multi_page() {
        let mut bpm = make_bpm(64);
        // Overflow payload capacity per page: 64 - 18 = 46 bytes
        // 100 bytes → needs 3 pages (46 + 46 + 8)
        let data: Vec<u8> = (0..100).collect();
        let ptr = write_overflow(&mut bpm, &data).unwrap();
        assert_eq!(ptr.total_len, 100);

        let read_back = read_overflow(&mut bpm, &ptr).unwrap();
        assert_eq!(read_back, data);
    }

    #[test]
    fn delete_overflow_frees_pages() {
        let mut bpm = make_bpm(64);
        let data = vec![0u8; 100];
        let ptr = write_overflow(&mut bpm, &data).unwrap();

        let allocated_before = bpm.disk.num_allocated();
        delete_overflow(&mut bpm, &ptr);
        let allocated_after = bpm.disk.num_allocated();
        assert!(allocated_after < allocated_before);
    }
}
