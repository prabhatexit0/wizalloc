//! Slotted-page implementation.
//!
//! Operates on a raw `&mut [u8]` buffer — does NOT own the memory.
//! The caller (BufferPoolManager) owns the frame data and lends it here.
//!
//! Layout:
//! ```text
//! ┌─────────────────────────────────────────────┐
//! │ PAGE HEADER (16 bytes)                      │
//! ├─────────────────────────────────────────────┤
//! │ SLOT ARRAY  (grows →)                       │
//! │   slot 0 | slot 1 | slot 2 | ...            │
//! ├─────────────────────────────────────────────┤
//! │           FREE SPACE                        │
//! ├─────────────────────────────────────────────┤
//! │ TUPLE DATA  (← grows from bottom)          │
//! │   tuple 2 | tuple 1 | tuple 0              │
//! └─────────────────────────────────────────────┘
//! ```

use crate::storage::types::*;

// ── Header field offsets ───────────────────────────────────────────

const OFF_PAGE_ID: usize = 0;     // u32  [0..4]
const OFF_PAGE_TYPE: usize = 4;   // u8   [4]
const OFF_SLOT_COUNT: usize = 5;  // u16  [5..7]
const OFF_FREE_START: usize = 7;  // u16  [7..9]
const OFF_FREE_END: usize = 9;    // u16  [9..11]
const OFF_NEXT_PAGE: usize = 11;  // u32  [11..15]
// byte 15 is reserved

// ── Helper read/write for little-endian values ─────────────────────

fn read_u16(buf: &[u8], off: usize) -> u16 {
    u16::from_le_bytes([buf[off], buf[off + 1]])
}

fn write_u16(buf: &mut [u8], off: usize, val: u16) {
    let bytes = val.to_le_bytes();
    buf[off] = bytes[0];
    buf[off + 1] = bytes[1];
}

fn read_u32(buf: &[u8], off: usize) -> u32 {
    u32::from_le_bytes([buf[off], buf[off + 1], buf[off + 2], buf[off + 3]])
}

fn write_u32(buf: &mut [u8], off: usize, val: u32) {
    let bytes = val.to_le_bytes();
    buf[off] = bytes[0];
    buf[off + 1] = bytes[1];
    buf[off + 2] = bytes[2];
    buf[off + 3] = bytes[3];
}

// ── Slot helpers ───────────────────────────────────────────────────

/// Byte offset of the Nth slot in the slot array.
fn slot_offset(n: u16) -> usize {
    PAGE_HEADER_SIZE + n as usize * SLOT_SIZE
}

/// Read a slot entry: (tuple_offset, tuple_length).
pub fn read_slot(buf: &[u8], slot_id: SlotId) -> (u16, u16) {
    let base = slot_offset(slot_id);
    (read_u16(buf, base), read_u16(buf, base + 2))
}

/// Write a slot entry.
fn write_slot(buf: &mut [u8], slot_id: SlotId, offset: u16, length: u16) {
    let base = slot_offset(slot_id);
    write_u16(buf, base, offset);
    write_u16(buf, base + 2, length);
}

// ── Public slotted-page API ────────────────────────────────────────

/// Initialize a fresh page.  Zeroes the buffer and writes the header.
pub fn page_init(buf: &mut [u8], page_id: PageId, page_type: PageType) {
    let page_size = buf.len();
    buf.fill(0);
    write_u32(buf, OFF_PAGE_ID, page_id);
    buf[OFF_PAGE_TYPE] = page_type as u8;
    write_u16(buf, OFF_SLOT_COUNT, 0);
    write_u16(buf, OFF_FREE_START, PAGE_HEADER_SIZE as u16);
    write_u16(buf, OFF_FREE_END, page_size as u16);
    write_u32(buf, OFF_NEXT_PAGE, INVALID_PAGE);
}

/// Read the page ID from the header.
pub fn page_id(buf: &[u8]) -> PageId {
    read_u32(buf, OFF_PAGE_ID)
}

/// Read the page type.
pub fn page_type(buf: &[u8]) -> PageType {
    PageType::from_u8(buf[OFF_PAGE_TYPE])
}

/// Number of slots (including tombstones).
pub fn slot_count(buf: &[u8]) -> u16 {
    read_u16(buf, OFF_SLOT_COUNT)
}

/// Byte offset where the slot array ends (= start of free gap).
pub fn free_start(buf: &[u8]) -> u16 {
    read_u16(buf, OFF_FREE_START)
}

/// Byte offset where tuple data begins (= end of free gap).
pub fn free_end(buf: &[u8]) -> u16 {
    read_u16(buf, OFF_FREE_END)
}

/// Available contiguous free space in the middle of the page.
pub fn free_space(buf: &[u8]) -> usize {
    let fs = free_start(buf) as usize;
    let fe = free_end(buf) as usize;
    if fe > fs { fe - fs } else { 0 }
}

/// Next page pointer (linked list of pages in a table).
pub fn next_page(buf: &[u8]) -> PageId {
    read_u32(buf, OFF_NEXT_PAGE)
}

/// Set the next page pointer.
pub fn set_next_page(buf: &mut [u8], next: PageId) {
    write_u32(buf, OFF_NEXT_PAGE, next);
}

/// Insert a tuple into the page.  Returns the slot ID, or `None` if there
/// isn't enough space (even after considering a deleted slot for reuse).
pub fn insert_tuple(buf: &mut [u8], tuple_data: &[u8]) -> Option<SlotId> {
    let data_len = tuple_data.len() as u16;

    // Check: do we have room for the tuple data + possibly a new slot?
    let need_for_data = data_len as usize;

    // Try to reuse a deleted slot first
    let sc = slot_count(buf);
    let mut reuse_slot: Option<SlotId> = None;
    for i in 0..sc {
        let (_, len) = read_slot(buf, i);
        if len == 0 {
            reuse_slot = Some(i);
            break;
        }
    }

    let extra_slot_bytes = if reuse_slot.is_some() { 0 } else { SLOT_SIZE };
    let available = free_space(buf);
    if available < need_for_data + extra_slot_bytes {
        return None;
    }

    // Write tuple data at the bottom (grow upward)
    let fe = free_end(buf);
    let new_free_end = fe - data_len;
    buf[new_free_end as usize..fe as usize].copy_from_slice(tuple_data);
    write_u16(buf, OFF_FREE_END, new_free_end);

    // Write slot entry
    let sid = if let Some(sid) = reuse_slot {
        write_slot(buf, sid, new_free_end, data_len);
        sid
    } else {
        let sid = sc;
        write_slot(buf, sid, new_free_end, data_len);
        write_u16(buf, OFF_SLOT_COUNT, sc + 1);
        write_u16(buf, OFF_FREE_START, slot_offset(sc + 1) as u16);
        sid
    };

    Some(sid)
}

/// Delete a tuple by marking its slot as a tombstone (length = 0).
/// Does NOT reclaim the tuple bytes immediately — call `compact` for that.
pub fn delete_tuple(buf: &mut [u8], slot_id: SlotId) -> bool {
    let sc = slot_count(buf);
    if slot_id >= sc {
        return false;
    }
    let (_, len) = read_slot(buf, slot_id);
    if len == 0 {
        return false; // already deleted
    }
    write_slot(buf, slot_id, 0, 0);
    true
}

/// Read a tuple's raw bytes.  Returns `None` if the slot is a tombstone
/// or out of range.
pub fn get_tuple(buf: &[u8], slot_id: SlotId) -> Option<&[u8]> {
    let sc = slot_count(buf);
    if slot_id >= sc {
        return None;
    }
    let (offset, len) = read_slot(buf, slot_id);
    if len == 0 {
        return None;
    }
    Some(&buf[offset as usize..(offset + len) as usize])
}

/// Compact the page: squeeze out dead space from deleted tuples.
///
/// After compacting, all live tuples are packed contiguously at the bottom
/// of the page, the slot array offsets are updated, and `free_end` is
/// adjusted so that the free gap is as large as possible.
pub fn compact(buf: &mut [u8]) {
    let page_size = buf.len();
    let sc = slot_count(buf);

    // Collect live tuples: (slot_id, data_copy)
    let mut live: Vec<(SlotId, Vec<u8>)> = Vec::new();
    for i in 0..sc {
        let (off, len) = read_slot(buf, i);
        if len > 0 {
            live.push((i, buf[off as usize..(off + len) as usize].to_vec()));
        }
    }

    // Rewrite tuples from the bottom
    let mut cursor = page_size;
    for (sid, data) in &live {
        cursor -= data.len();
        buf[cursor..cursor + data.len()].copy_from_slice(data);
        write_slot(buf, *sid, cursor as u16, data.len() as u16);
    }

    // Zero the free gap
    let fs = free_start(buf) as usize;
    buf[fs..cursor].fill(0);

    write_u16(buf, OFF_FREE_END, cursor as u16);
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_page(size: usize) -> Vec<u8> {
        let mut buf = vec![0u8; size];
        page_init(&mut buf, 0, PageType::Data);
        buf
    }

    #[test]
    fn init_header() {
        let buf = make_page(128);
        assert_eq!(page_id(&buf), 0);
        assert_eq!(page_type(&buf), PageType::Data);
        assert_eq!(slot_count(&buf), 0);
        assert_eq!(free_start(&buf), PAGE_HEADER_SIZE as u16);
        assert_eq!(free_end(&buf), 128);
        assert_eq!(free_space(&buf), 128 - PAGE_HEADER_SIZE);
        assert_eq!(next_page(&buf), INVALID_PAGE);
    }

    #[test]
    fn insert_and_get() {
        let mut buf = make_page(128);
        let data = b"hello";
        let sid = insert_tuple(&mut buf, data).unwrap();
        assert_eq!(sid, 0);
        assert_eq!(slot_count(&buf), 1);

        let got = get_tuple(&buf, sid).unwrap();
        assert_eq!(got, b"hello");
    }

    #[test]
    fn insert_multiple() {
        let mut buf = make_page(128);
        let s0 = insert_tuple(&mut buf, b"aaa").unwrap();
        let s1 = insert_tuple(&mut buf, b"bbbbb").unwrap();
        let s2 = insert_tuple(&mut buf, b"cc").unwrap();
        assert_eq!(s0, 0);
        assert_eq!(s1, 1);
        assert_eq!(s2, 2);
        assert_eq!(get_tuple(&buf, s0).unwrap(), b"aaa");
        assert_eq!(get_tuple(&buf, s1).unwrap(), b"bbbbb");
        assert_eq!(get_tuple(&buf, s2).unwrap(), b"cc");
    }

    #[test]
    fn delete_and_reuse() {
        let mut buf = make_page(128);
        let s0 = insert_tuple(&mut buf, b"aaa").unwrap();
        let s1 = insert_tuple(&mut buf, b"bbb").unwrap();

        assert!(delete_tuple(&mut buf, s0));
        assert!(get_tuple(&buf, s0).is_none());

        // New insert should reuse slot 0
        let s2 = insert_tuple(&mut buf, b"cc").unwrap();
        assert_eq!(s2, s0);
        assert_eq!(get_tuple(&buf, s2).unwrap(), b"cc");
        // s1 still intact
        assert_eq!(get_tuple(&buf, s1).unwrap(), b"bbb");
    }

    #[test]
    fn page_full() {
        // Tiny page: 64 bytes. Header=16, so 48 bytes for slots+tuples.
        let mut buf = make_page(64);
        // Each insert: 4 bytes slot + N bytes tuple data
        // First: 4 slot + 20 data = 24 consumed → 24 remaining
        assert!(insert_tuple(&mut buf, &[0u8; 20]).is_some());
        // Second: 4 slot + 20 data = 24 consumed → 0 remaining
        assert!(insert_tuple(&mut buf, &[0u8; 20]).is_some());
        // Third: no room
        assert!(insert_tuple(&mut buf, &[0u8; 1]).is_none());
    }

    #[test]
    fn compact_reclaims_space() {
        let mut buf = make_page(128);
        let s0 = insert_tuple(&mut buf, &[0xAA; 20]).unwrap();
        let _s1 = insert_tuple(&mut buf, &[0xBB; 20]).unwrap();
        let s2 = insert_tuple(&mut buf, &[0xCC; 20]).unwrap();

        let before = free_space(&buf);
        delete_tuple(&mut buf, s0);
        delete_tuple(&mut buf, s2);
        // Free space hasn't changed (just tombstoned)
        assert_eq!(free_space(&buf), before);

        compact(&mut buf);
        // Now we should have reclaimed 40 bytes of tuple data
        assert!(free_space(&buf) > before + 30);
        // Live tuple still readable
        assert_eq!(get_tuple(&buf, _s1).unwrap(), &[0xBB; 20]);
    }
}
